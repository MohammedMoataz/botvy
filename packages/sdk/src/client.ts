import type { TokenStore } from './tokens.js';

export interface ClientOptions {
  /** Origin the API is reached at. Empty means same-origin, which is what
   *  running behind the edge gives the web app. */
  baseUrl?: string;
  tokens?: TokenStore;
  fetchImpl?: typeof fetch;
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
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  /**
   * A state change. Retries exactly once after refreshing, and only on a 401 —
   * retrying a command more than that risks performing it twice, which is what
   * the idempotency key exists to make safe rather than something to rely on.
   */
  async command<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const send = async (): Promise<Response> =>
      this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...this.authHeader(),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    let response = await send();

    if (response.status === 401 && this.options.tokens) {
      const refreshed = await this.options.tokens.refresh();
      if (refreshed) response = await send();
    }

    return this.unwrap<T>(response, path);
  }

  /** A read. */
  async query<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
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

    const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (payload.errors?.length) {
      throw new ApiError(response.status, payload.errors, payload.errors[0]!.message);
    }
    return payload.data as T;
  }

  private authHeader(): Record<string, string> {
    const token = this.options.tokens?.accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  private async unwrap<T>(response: Response, path: string): Promise<T> {
    if (response.status === 404) throw new NotAvailableYetError(path);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiError(
        response.status,
        body,
        (body as { message?: string } | null)?.message ?? `HTTP ${response.status}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
