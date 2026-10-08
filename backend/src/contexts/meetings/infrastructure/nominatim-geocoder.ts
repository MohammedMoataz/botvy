import { BOTVY_VERSION } from '../../../shared/health/health.controller.js';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import {
  Geocoder,
  PreviewUnavailable,
  type Place,
} from '../domain/link-preview.ports.js';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * At most one call per `intervalMs`, in arrival order, for the whole process.
 *
 * The public Nominatim's usage policy is an absolute one request a second, and
 * a meetings list opened on two devices at once is two requests; a queue
 * rather than a refusal, because the second caller only has to wait a second.
 * ponytail: per-process, so two backend replicas would each keep their own
 * second — one replica is the deployment this product has.
 */
export class RateGate {
  private chain: Promise<void> = Promise.resolve();
  private last = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  /** Resolves when it is this caller's turn. */
  turn(): Promise<void> {
    const mine = this.chain.then(async () => {
      const wait = this.last + this.intervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
    });
    this.chain = mine.catch(() => undefined);
    return mine;
  }
}

/** One gate for the process, shared by every geocoder instance. */
export const NOMINATIM_GATE = new RateGate(1_000);

/**
 * A plain-text address to a point, through Nominatim (032, FR-004).
 *
 * The base URL is an operator's setting (`meetings.geocodeUrl`), so it is not
 * put through the SSRF guard: a self-hosted Nominatim on the compose network
 * is exactly what an operator who wants addresses to stay home would point it
 * at. The user agent names the product and its version, as the policy asks,
 * and no contact address — this is somebody's own installation.
 */
export class NominatimGeocoder extends Geocoder {
  constructor(
    private readonly settings: SettingsService,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly gate: RateGate = NOMINATIM_GATE,
  ) {
    super();
  }

  async geocode(address: string): Promise<Place | null> {
    const base = (await this.settings.get('meetings.geocodeUrl')).replace(
      /\/+$/,
      '',
    );
    const url = `${base}/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;

    await this.gate.turn();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          'user-agent': `Botvy/${BOTVY_VERSION} (self-hosted personal assistant)`,
          accept: 'application/json',
        },
      });
    } catch (error) {
      throw new PreviewUnavailable(
        `Could not reach the geocoder: ${(error as Error).message}`,
      );
    }
    // A refusal or a rate limit is the geocoder's answer for now, not a fact
    // about the address — not cached.
    if (!response.ok) {
      throw new PreviewUnavailable(`The geocoder answered ${response.status}.`);
    }

    const rows = (await response.json().catch(() => [])) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;
    const first = Array.isArray(rows) ? rows[0] : undefined;
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);
    if (!first || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, label: first.display_name ?? null };
  }
}
