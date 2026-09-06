/**
 * Thin JSON fetch. The typed client lands in `@botvy/sdk` (T050); until then the
 * login form needs exactly this much, and it needs to report a 404 rather than
 * throw on one — P0 has no `/api/v1/auth/login` yet.
 *
 * Empty base URL = same origin, which is how Caddy serves us in compose.
 */
export const API_BASE_URL: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export interface ApiResult<T> {
  ok: boolean;
  /** 0 when the request never reached a server. */
  status: number;
  data?: T;
  error?: string;
}

export async function postJson<T>(
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    return {
      ok: false,
      status: 0,
      error: cause instanceof Error ? cause.message : 'network error',
    };
  }

  const text = await res.text().catch(() => '');
  let data: T | undefined;
  try {
    data = text ? (JSON.parse(text) as T) : undefined;
  } catch {
    // A 404 from the edge is an HTML page, not JSON. The status is what matters.
    data = undefined;
  }
  return res.ok
    ? { ok: true, status: res.status, data }
    : { ok: false, status: res.status, error: text.slice(0, 200) };
}
