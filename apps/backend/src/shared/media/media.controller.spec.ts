import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.schema.js';
import { MediaController } from './media.controller.js';
import { signMediaUrl } from './media.signing.js';

/**
 * The signed image proxy, which is the whole of FR-008.
 *
 * Two things it has to get right and one it has to refuse.
 *
 * The two: a URL this installation signed is served, and the bytes come back as
 * an image with the source's own headers left behind. The one: **everything
 * else**. A signature proves we minted the URL and says nothing about where it
 * points, so the SSRF guard runs on every request — before the fetch, and again
 * on whatever the chain ended at.
 *
 * These cases construct the controller directly rather than booting Nest. The
 * route is one method over two pure helpers and a `fetch`, and a test harness
 * with a real HTTP server would be testing Express.
 */

const SECRET = 'a-media-signing-secret-long-enough';
const env = { MEDIA_SIGNING_SECRET: SECRET } as unknown as Env;

/** The three response methods the controller uses, recorded. */
function recorder() {
  const state = {
    status: 0,
    headers: {} as Record<string, string>,
    body: undefined as Buffer | undefined,
    ended: false,
  };
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
      return response;
    },
    end(body?: Buffer) {
      state.body = body;
      state.ended = true;
    },
  };
  return { state, response };
}

function controller(answer: () => Promise<Response>): MediaController {
  const instance = new MediaController(env);
  instance.fetchImpl = answer as unknown as typeof fetch;
  return instance;
}

function imageResponse(
  url = 'https://cdn.example.com/a.png',
  type = 'image/png',
): Response {
  const body = new Uint8Array([137, 80, 78, 71]);
  const response = new Response(body, {
    status: 200,
    headers: { 'content-type': type },
  });
  // `Response.url` is read-only and empty for a constructed response, which is
  // exactly the field the redirect check reads — so it is defined here rather
  // than left empty, or the check would be testing its own fallback.
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('the media proxy', () => {
  it('serves a signed image and leaves the source’s headers behind', async () => {
    const target = 'https://cdn.example.com/a.png';
    const { state, response } = recorder();

    await controller(async () => imageResponse(target)).proxy(
      target,
      signMediaUrl(target, SECRET),
      response,
    );

    expect(state.status).toBe(200);
    expect(state.headers['content-type']).toBe('image/png');
    expect(state.headers['cache-control']).toContain('immutable');
    // Passing the source's headers through would carry its cookies and its CSP
    // into this origin, which is how a proxy becomes somebody else's page.
    expect(state.headers['x-content-type-options']).toBe('nosniff');
    expect(state.body).toBeInstanceOf(Buffer);
  });

  it('refuses a URL it did not sign', async () => {
    const { response } = recorder();
    await expect(
      controller(async () => imageResponse()).proxy(
        'https://cdn.example.com/a.png',
        'not-the-signature',
        response,
      ),
    ).rejects.toThrow(/bad signature/);
  });

  it('refuses a request with nothing to check', async () => {
    const { response } = recorder();
    await expect(
      controller(async () => imageResponse()).proxy('', '', response),
    ).rejects.toThrow(/url and sig/);
  });

  it('refuses a signed URL pointing inside the compose network', async () => {
    /*
     * The case the whole guard exists for.
     *
     * A signature proves this installation minted the URL — and an Owner with a
     * signing secret could mint one for `http://n8n:5678` by accident, or a
     * future bug could. The compose network puts PostgreSQL, Mongo, n8n and the
     * model server one hostname away, so the target is checked on every request
     * regardless of who signed it.
     */
    for (const target of [
      'http://n8n:5678/rest/workflows',
      'http://127.0.0.1:9090/metrics',
      'http://169.254.169.254/latest/meta-data/',
      'http://mongo:27017/',
      'file:///etc/passwd',
    ]) {
      const { response } = recorder();
      await expect(
        controller(async () => imageResponse()).proxy(
          target,
          signMediaUrl(target, SECRET),
          response,
        ),
      ).rejects.toThrow();
    }
  });

  it('refuses a redirect that ends somewhere private', async () => {
    const target = 'https://cdn.example.com/a.png';
    const { state, response } = recorder();

    await controller(async () =>
      imageResponse('http://169.254.169.254/latest/meta-data/'),
    ).proxy(target, signMediaUrl(target, SECRET), response);

    // The body is refused rather than served: nobody signed the end of the
    // chain. The request itself has already been made, which is why the
    // *article* fetcher in Knowledge walks its redirects by hand — there the
    // URL comes from somebody else's page, and here from a string this
    // installation signed.
    expect(state.status).toBe(400);
    expect(state.body).toBeUndefined();
  });

  it('refuses anything that is not an image', async () => {
    const target = 'https://cdn.example.com/page';
    const { state, response } = recorder();

    await controller(async () => imageResponse(target, 'text/html')).proxy(
      target,
      signMediaUrl(target, SECRET),
      response,
    );

    // A proxy that would fetch `text/html` on request is a proxy that can be
    // used to read pages through this host's address. Checked against the
    // *response*, because the extension in the URL is the attacker's to choose.
    expect(state.status).toBe(415);
  });

  it('answers 502 when the source cannot be reached', async () => {
    const target = 'https://cdn.example.com/a.png';
    const { state, response } = recorder();

    await controller(async () => {
      throw new Error('ECONNREFUSED');
    }).proxy(target, signMediaUrl(target, SECRET), response);

    // Somebody else's server, and an `<img>` that renders as broken is the
    // right outcome either way.
    expect(state.status).toBe(502);
  });

  it('refuses a file larger than an illustration could be', async () => {
    const target = 'https://cdn.example.com/huge.png';
    const { state, response } = recorder();
    const huge = new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': String(50 * 1024 * 1024),
      },
    });
    Object.defineProperty(huge, 'url', { value: target });

    await controller(async () => huge).proxy(
      target,
      signMediaUrl(target, SECRET),
      response,
    );
    expect(state.status).toBe(413);
  });
});
