import { NextResponse, type NextRequest } from 'next/server';

/**
 * The content security policy (E-025).
 *
 * It is minted here rather than at the edge for one reason: the App Router
 * emits an inline bootstrap script in every document, so `script-src` needs
 * either `'unsafe-inline'` — which is the same as having no policy at all — or
 * a **nonce**, and a nonce has to be new on every request. Caddy cannot mint
 * one. So the edge owns the switch (see `infra/Caddyfile`) and the web app owns
 * the policy, and the API's responses carry none: they are JSON and images,
 * where a script-source directive has nothing to act on, and helmet's
 * `contentSecurityPolicy: false` stays exactly as it is.
 *
 * Next reads the nonce back out of the **request** copy of the header — either
 * name, enforced or report-only — and threads it onto its own script tags. That
 * is the whole mechanism; `x-nonce` below is for our own inline script, if we
 * ever write one.
 */

/** A per-request nonce must never be cached, so the static assets are skipped. */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)',
  ],
};

function policyFor(nonce: string): string {
  const dev = process.env.NODE_ENV !== 'production';

  return [
    `default-src 'self'`,
    // `'strict-dynamic'` is what makes the nonce worth having: the chunks Next's
    // bootstrap loads inherit its trust, and a `<script src>` somebody injects
    // into the document does not, however same-origin the URL looks.
    // `next dev` compiles through `eval`, which a production image never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // Deliberately not nonce'd. A nonce on `style-src` *disables* the
    // `'unsafe-inline'` beside it, and inline `style` attributes are how both
    // React's server render and PrimeReact's overlays position themselves —
    // enforcing that would unstyle the portal rather than protect it. The
    // runtime `<style>` blocks (Dialog, DataTable, VirtualScroller, Ripple,
    // FocusTrap) are covered by the same token.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    // The API, GraphQL and the socket are all same-origin behind the edge
    // (`NEXT_PUBLIC_API_BASE` is empty in compose), and `'self'` covers
    // `wss://` to the same host.
    `connect-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    // No `upgrade-insecure-requests`: the default installation serves plain
    // HTTP behind a tunnel that terminates TLS, and upgrading there would ask
    // the browser for a scheme the edge does not answer on.
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());

  // The switch. Set by the edge, so flipping it is a Caddy restart rather than
  // a frontend rebuild — `process.env` in middleware is inlined at build time
  // and a rebuild is exactly what an operator backing a bad policy out cannot
  // wait for. A client cannot forge it: `header_up` replaces whatever arrived.
  const enforced = request.headers.get('x-botvy-csp-enforce') === 'on';
  const header = enforced
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';
  const policy = policyFor(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(header, policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(header, policy);
  return response;
}
