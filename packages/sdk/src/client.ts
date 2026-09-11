import type { TokenStore } from './tokens.js';

export interface ClientOptions {
  /**
   * Origin the API is reached at. Empty means same-origin, which is what
   * running behind the edge gives the web app.
   *
   * A **function** is accepted for the one surface whose origin is not fixed
   * at construction: the browser extension, where the member's Botvy address
   * is a per-browser setting they can change in the panel. Pinning it in the
   * constructor would mean an address change took effect only after a reload,
   * and the reload of a side panel is a thing the member cannot ask for.
   */
  baseUrl?: string | (() => string);
  tokens?: TokenStore;
  fetchImpl?: typeof fetch;
}

/**
 * The one path that must never trigger a refresh.
 *
 * `AuthStore.refreshFn` performs the exchange *through this client*, so a 401
 * from `/auth/refresh` used to call `tokens.refresh()` — which returns the
 * in-flight promise, which is the very call still waiting on this response.
 * Circular await: `.finally` never ran, `#inFlight` stayed poisoned, and every
 * later request hung too. No error, no sign-out, no banner — the portal and
 * the side panel simply stopped.
 *
 * A refused refresh is the *normal* case (an expired token, a replay, a
 * deleted account), so this was not an edge.
 *
 * The mobile client avoids the same trap by refreshing through a bare Dio and
 * says so; this is the SDK's version of that guard.
 */
function isRefreshPath(path: string): boolean {
  return path === '/auth/refresh' || path.startsWith('/auth/refresh?');
}

/**
 * The HTTP status a GraphQL error code stands for.
 *
 * GraphQL answers 200 with an `errors` array, so a caller that branched on the
 * status alone would treat "forbidden" as success. The codes come from the
 * server's own `formatError`, which sets them precisely so both transports can
 * be branched on the same way.
 */
function statusForCode(code: string | undefined, fallback: number): number {
  switch (code) {
    case 'unauthorized':
    case 'token_expired':
      return 401;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    default:
      return fallback === 200 ? 500 : fallback;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown when the endpoint is not there yet — P1 delivers sign-in. */
export class NotAvailableYetError extends ApiError {
  constructor(path: string) {
    super(404, null, `${path} is not available in this build yet.`);
    this.name = 'NotAvailableYetError';
  }
}

/**
 * The typed client both web surfaces use.
 *
 * Commands are REST and reads are GraphQL, deliberately kept as separate
 * methods rather than one `request`: the split is a rule the platform is built
 * on, and a client that blurred it would make breaking the rule the path of
 * least resistance.
 */
export class BotvyClient {
  private readonly origin: string | (() => string);
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ClientOptions = {}) {
    this.origin = options.baseUrl ?? '';
    /*
     * **Bound**, because a browser's `fetch` refuses to be called as a method
     * of anything but the window.
     *
     * `this.fetchImpl = globalThis.fetch` and then `this.fetchImpl(url, init)`
     * calls it with this client as the receiver, and Chrome answers
     * `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`.
     * Node does not care, so every test passed and every request from a real
     * browser threw **before it was sent** — no network entry, nothing in the
     * server log, and a sign-in form that says the server is unreachable when
     * the server was never asked.
     *
     * Found in P9, from the extension's panel. The admin portal builds this
     * client the same way and had the same failure.
     */
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /** Resolved per request, so a surface whose address can change is correct. */
  private get baseUrl(): string {
    const raw = typeof this.origin === 'function' ? this.origin() : this.origin;
    return (raw ?? '').replace(/\/$/, '');
  }

  /**
   * A state change. Retries exactly once after refreshing, and only on a 401 —
   * retrying a command more than that risks performing it twice, which is what
   * the idempotency key exists to make safe rather than something to rely on.
   */
  async command<T>(
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    return this.rest<T>('POST', path, body, idempotencyKey);
  }

  /**
   * One REST call, with the 401-refresh-retry every path needs.
   *
   * `command` is POST sugar over this. The other verbs exist because P1's
   * routes use them — a role patch is a PATCH, a device removal a DELETE — and
   * because reads are REST until the GraphQL edge is wired: `/auth/devices` and
   * `/admin/users` have nowhere else to be answered from yet. When those move
   * to GraphQL the callers change and this method stays.
   *
   * Never retries more than once, and never on anything but a 401. A retry
   * loop on a command is how one action becomes three.
   */
  async rest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const send = async (): Promise<Response> =>
      this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...this.authHeader(),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    let response = await send();

    if (
      response.status === 401 &&
      this.options.tokens &&
      !isRefreshPath(path)
    ) {
      const refreshed = await this.options.tokens.refresh();
      if (refreshed) response = await send();
    }

    return this.unwrap<T>(response, path);
  }

  /**
   * A multipart upload — the photo, today.
   *
   * Separate from `rest` because the body must not be JSON-encoded and the
   * `content-type` must be left for the runtime to set: writing it by hand
   * omits the multipart boundary, and the request then fails in a way that
   * looks like a server problem.
   */
  async upload<T>(
    method: 'POST' | 'PATCH',
    path: string,
    form: FormData,
  ): Promise<T> {
    const send = async (): Promise<Response> =>
      this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers: this.authHeader(),
        body: form,
      });

    let response = await send();
    if (
      response.status === 401 &&
      this.options.tokens &&
      !isRefreshPath(path)
    ) {
      const refreshed = await this.options.tokens.refresh();
      if (refreshed) response = await send();
    }
    return this.unwrap<T>(response, path);
  }

  /**
   * A read.
   *
   * Every read in the platform comes through here. It existed from P0 and was
   * called by nobody until the resolvers did — all four surfaces read over the
   * REST `GET`s they were built against, which is the split constitution X
   * exists to prevent.
   */
  async query<T>(
    document: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const send = async (): Promise<Response> =>
      this.fetchImpl(`${this.baseUrl}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this.authHeader() },
        body: JSON.stringify({ query: document, variables }),
      });

    let response = await send();
    if (response.status === 401 && this.options.tokens) {
      const refreshed = await this.options.tokens.refresh();
      if (refreshed) response = await send();
    }

    // No refresh-path guard here: this posts to `/graphql`, which the refresh
    // exchange never uses. If a GraphQL mutation ever performs the exchange,
    // it needs the same guard `rest` has.

    // A transport failure before GraphQL sees the request — a 502 from the
    // edge, an HTML error page — is not a GraphQL error document, and parsing
    // it as one throws a `SyntaxError` that tells a caller nothing.
    const payload = (await response.json().catch(() => null)) as {
      data?: T;
      errors?: Array<{ message: string; extensions?: { code?: string } }>;
    } | null;

    if (!payload) {
      throw new ApiError(
        response.status,
        null,
        `HTTP ${response.status} from /graphql`,
      );
    }

    if (payload.errors?.length) {
      const first = payload.errors[0]!;
      const code = first.extensions?.code;
      // `body` carries `{ code }` because that is where the stores already look
      // — `AuthStore` reads `error.body.code` to decide between refreshing and
      // signing out. A read that reported an expired token differently from a
      // command would sign the member out of a session that is still good.
      throw new ApiError(
        statusForCode(code, response.status),
        { code, errors: payload.errors },
        first.message,
      );
    }
    return payload.data as T;
  }

  private authHeader(): Record<string, string> {
    const token = this.options.tokens?.accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  private async unwrap<T>(response: Response, path: string): Promise<T> {
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      // A 404 that carries a message is the server saying "this thing is not
      // here" — no such profile, no photo, no such device. Only a *bodiless*
      // 404 means the route itself does not exist. Treating both the same told
      // an Owner that `/admin/service-clients/foo` "is not available in this
      // build yet" when they revoked a client twice.
      if (
        response.status === 404 &&
        !(body as { message?: string } | null)?.message
      ) {
        throw new NotAvailableYetError(path);
      }
      throw new ApiError(
        response.status,
        body,
        (body as { message?: string } | null)?.message ??
          `HTTP ${response.status}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
