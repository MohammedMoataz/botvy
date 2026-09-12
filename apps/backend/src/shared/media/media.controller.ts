import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Logger,
  Query,
  Res,
} from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { checkResolvedTarget, verifyMediaUrl } from './media.signing.js';

/** Long enough for a slow CDN, short enough that a hung host is not a hang. */
const TIMEOUT_MS = 15_000;

/** Nothing an article illustrates itself with is larger than this. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Images are served for a year. The URL is a capability over one target, so a
 * changed picture at the same address is the source's business and a cache that
 * holds the old one is the normal behaviour of every image on the web.
 */
const CACHE_SECONDS = 31_536_000;

const ALLOWED_TYPES = ['image/'];

/**
 * The signed image proxy (`GET /media`, FR-008).
 *
 * ## It existed as two helpers and no route until P7
 *
 * `media.signing.ts` was ported from v1 in P0 with its spec, and
 * `rest-commands.md` has listed `GET /media?sig=…` since the blueprint. Nothing
 * called either: no phase before this one had an external image to show, so the
 * proxy was a signing function with no proxy behind it. P7 is the phase with
 * the images — an article's pictures reach the member's device or they reach
 * the *source*, and FR-008 says which — so the route lands here.
 *
 * ## Why it is public, and why that is safe
 *
 * An `<img>` tag cannot send an Authorization header, and an image request
 * never passes through the SDK's refresh interceptor — so a bearer token would
 * start failing fifteen minutes in and on every reload of history. The
 * signature is the whole authorisation: a URL nobody could have minted without
 * `MEDIA_SIGNING_SECRET`. `media.signing.ts` explains why it carries no expiry.
 *
 * **The signature is not enough on its own, and both checks are here.** A
 * signature proves *we* minted the URL; it says nothing about where it points.
 * The compose network puts PostgreSQL, Mongo, n8n and the model server one
 * hostname away, so `checkTarget` runs on every request, before the fetch —
 * and again on the final URL, because a redirect is a second target nobody
 * signed.
 *
 * ## What it will not serve
 *
 * Only images. The one caller is an article's illustrations, and a proxy that
 * would fetch `text/html` on request is a proxy that can be used to read pages
 * through this host's IP address. The content type is checked against the
 * response rather than against the URL's extension, because an extension is
 * something the attacker chooses.
 */
@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  /**
   * The outbound call, as a property rather than a constructor argument.
   *
   * Nest resolves a controller's constructor from its metadata, and a parameter
   * typed `typeof fetch` emits `Function` as its design type — so a default
   * value does not save it, and the controller would fail to build at boot with
   * an `UnknownDependenciesException` no typecheck can see. A property the spec
   * assigns costs one line and cannot do that.
   */
  fetchImpl: typeof fetch = fetch;

  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get()
  @Public()
  async proxy(
    @Query('url') target: string,
    @Query('sig') signature: string,
    @Res() response: HttpResponse,
  ): Promise<void> {
    if (!target || !signature) {
      throw new BadRequestException('media needs url and sig');
    }
    if (!verifyMediaUrl(target, signature, this.env.MEDIA_SIGNING_SECRET)) {
      // Not "forbidden", which would tell a prober that the target was
      // interesting and only the signature wrong. There is one failure here and
      // it is "this is not a URL Botvy minted".
      throw new BadRequestException('bad signature');
    }

    const verdict = await checkResolvedTarget(target);
    if (!verdict.allowed) {
      this.logger.warn(`refused a signed media target: ${verdict.reason}`);
      throw new BadRequestException(verdict.reason);
    }

    let upstream: Response_;
    try {
      upstream = (await this.fetchImpl(target, {
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'image/*' },
      })) as unknown as Response_;
    } catch {
      // 502 rather than 500: the failure is somebody else's server, and an
      // `<img>` that renders as broken is the correct outcome either way.
      response.status(502).end();
      return;
    }

    // The end of the chain is a target nobody signed, so it is checked too.
    // `redirect: 'follow'` means the request has already been made by the time
    // we get here, which is why the *fetcher* in Knowledge walks its redirects
    // by hand — but there the URL comes from an article and here it comes from
    // a string this installation signed, so the remaining risk is a source that
    // redirects inward and the answer is to refuse the body rather than to
    // never have asked.
    const finalUrl = upstream.url || target;
    const finalVerdict = await checkResolvedTarget(finalUrl);
    if (!finalVerdict.allowed) {
      this.logger.warn(`media redirected somewhere refused: ${finalVerdict.reason}`);
      response.status(400).end();
      return;
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!ALLOWED_TYPES.some((allowed) => contentType.startsWith(allowed))) {
      response.status(415).end();
      return;
    }

    const declared = Number(upstream.headers.get('content-length') ?? '0');
    if (declared > MAX_BYTES) {
      response.status(413).end();
      return;
    }

    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_BYTES) {
      response.status(413).end();
      return;
    }

    response
      .status(upstream.status)
      .setHeader('content-type', contentType)
      .setHeader('cache-control', `public, max-age=${CACHE_SECONDS}, immutable`)
      // The proxy's job is the bytes, not the source's opinions about them.
      // Passing headers through would carry its cookies and its CSP into this
      // origin, which is how a proxy becomes somebody else's page.
      .setHeader('x-content-type-options', 'nosniff')
      .end(Buffer.from(body));
  }
}

/** The platform `Response`, named apart from the HTTP one below. */
type Response_ = globalThis.Response;

/**
 * The response object, structurally.
 *
 * Express's own `Response` type would be the obvious import and this backend
 * has no `@types/express` — Nest re-exports neither, and adding the package to
 * type one parameter is a dependency for a sentence. Three methods is the whole
 * of what this controller uses, and every one of them is `http.ServerResponse`'s
 * rather than Express's, so the shape is stable across the framework.
 */
interface HttpResponse {
  status(code: number): HttpResponse;
  setHeader(name: string, value: string): HttpResponse;
  end(body?: Buffer): void;
}
