# A content security policy the App Router can live with

## What it is

`main.ts` runs `helmet({ contentSecurityPolicy: false })`, so no
`Content-Security-Policy` header is sent by the API, and Caddy sets none either.
Every other header helmet and the edge provide is in place —
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS on HTTPS —
and this is the one that is off.

## Why it is not a defect

It was turned off deliberately in P0 and the reason was correct at the time:
helmet's default policy blocks inline script, and both the Swagger UI at `/docs`
and the GraphQL playground load inline script. With the policy on, the two
surfaces a developer uses most stopped working.

It is also aimed at the wrong process. The thing a policy protects is a page in
a browser, and the pages are served by **Next.js behind Caddy**, not by the API.
A policy set in helmet covers `/api/*`, `/graphql` and `/media` — responses that
are JSON and images, where a script-source directive has nothing to act on. The
web app's own responses never pass through helmet at all.

So the gap is real and the fix is not "delete `contentSecurityPolicy: false`",
which would restore a broken playground and still not cover a single page.

## What leaving it costs

A cross-site scripting hole in the portal or the public site would have no
second line of defence. How much that is worth depends on how likely the first
line is to fail, and here it is fairly sturdy: the public page is static server
components with no user-supplied content in it at all, the portal renders member
data through React's escaping, and `apps/frontend/e2e/public.spec.ts` asserts
the public page fetches nothing from any other origin — so there is no
third-party script to be compromised.

What it also costs is the ability to say "we have a policy" in a review, which
matters more than it sounds: the next person to add an embed, an analytics
snippet or a rich-text field will find nothing pushing back.

## What fixing it would take

The policy belongs on the **edge**, in `infra/Caddyfile`, applied to the web
app's responses and not to the API's.

The hard part is `script-src`. Next's App Router emits inline bootstrap script
in every document, so `'unsafe-inline'` — which defeats the point — or a nonce.
Next supports the nonce route: middleware generates one per request, sets it in
the CSP header and in a request header, and Next threads it onto its own script
tags. That means:

1. `apps/frontend/middleware.ts` generating a nonce and setting the header;
2. checking every PrimeReact component that injects style at runtime, because
   `style-src` is the directive that breaks quietly and looks like a CSS bug;
3. a report-only rollout first, because a wrong policy on the App Router ships a
   blank page rather than an error;
4. a Playwright case asserting the header is present and that the page still
   renders, so it cannot regress to report-only and stay there.

Half a day, most of it in step 2, and it should be done in a phase that has a
running stack in front of it — a policy verified only by reading it is exactly
the kind of check this repository keeps learning not to trust.
