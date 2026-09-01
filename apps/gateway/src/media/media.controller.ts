import { Controller, Get, Logger, NotFoundException, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { verifyMediaUrl } from './media.signing.js';
import { checkUrlIsPublic } from './ssrf.js';

/** What may be rendered in a chat bubble. SVG is excluded: it carries script. */
const ALLOWED_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetches an image on the phone's behalf.
 *
 * Proxying rather than hotlinking: a phone loading an image straight from a
 * search result hands its IP and referer to whatever host the result points
 * at, and the allowlist below belongs on a machine we control.
 *
 * Every failure answers 404 and nothing else — the app then shows the original
 * address as a plain link, which is the requested fallback and also means this
 * endpoint never becomes a way to probe what the server can reach.
 */
@ApiExcludeController()
@Public()
@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);
  private readonly secret?: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('MEDIA_SIGNING_SECRET');
  }

  @Get()
  async proxy(
    @Query('url') target: string | undefined,
    @Query('sig') signature: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.secret || !target || !signature) throw new NotFoundException();
    if (!verifyMediaUrl(target, signature, this.secret)) {
      this.logger.warn(`refused ${target}: signature does not match`);
      // A tampered URL is indistinguishable from a missing one, on purpose.
      throw new NotFoundException();
    }

    const body = await this.fetchImage(target);
    if (!body) throw new NotFoundException();

    res.setHeader('Content-Type', body.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(body.bytes);
  }

  private async fetchImage(
    target: string,
  ): Promise<{ bytes: Buffer; contentType: string } | null> {
    let url = target;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const check = await checkUrlIsPublic(url);
      if (!check.ok) {
        this.logger.warn(`refused ${url}: ${check.reason}`);
        return null;
      }

      let response: Response0;
      try {
        response = (await fetch(url, {
          // Manual: a 302 into 169.254.169.254 is the classic way past a guard
          // that only checks the address it was given.
          redirect: 'manual',
          // Neutral, and never the client's own headers — but not empty
          // either: Wikimedia and others answer 403 to a bare agent string.
          headers: {
            Accept: 'image/*',
            'User-Agent': 'Botvy/1.0 (self-hosted personal assistant)',
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })) as Response0;
      } catch (err) {
        this.logger.warn(`fetch failed for ${url}: ${String(err)}`);
        return null;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return null;
        url = new URL(location, url).toString();
        continue; // re-checked at the top of the loop
      }

      if (!response.ok || !response.body) {
        this.logger.warn(`refused ${url}: upstream answered ${response.status}`);
        return null;
      }

      const contentType = (response.headers.get('content-type') ?? '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      // Checked from the header before a byte of the body is read.
      if (!ALLOWED_TYPES.has(contentType)) {
        this.logger.warn(`refused ${url}: content-type ${contentType || 'missing'}`);
        return null;
      }

      const bytes = await readCapped(response.body, MAX_BYTES);
      // Counted as it streams: Content-Length is the sender's claim, not a fact.
      if (!bytes) {
        this.logger.warn(`refused ${url}: larger than ${MAX_BYTES} bytes`);
        return null;
      }
      return { bytes, contentType };
    }

    this.logger.warn(`refused ${target}: too many redirects`);
    return null;
  }
}

/** Minimal shape of the global fetch Response, which express's Response shadows. */
interface Response0 {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
}

async function readCapped(
  body: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Buffer | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
