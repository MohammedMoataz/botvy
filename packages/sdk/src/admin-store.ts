import type { BotvyClient } from './client.js';
import type { Role } from './auth-store.js';

export interface MemberSummary {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
  status: 'active' | 'banned';
  createdAt: string;
  lastLoginAt: string | null;
  deviceCount: number;
}

export interface MemberPage {
  members: MemberSummary[];
  nextCursor: string | null;
}

export interface MemberFilter {
  query?: string;
  status?: 'active' | 'banned';
  role?: Role;
  limit?: number;
}

export interface ServiceClientSummary {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface SettingEntry {
  key: string;
  value: unknown;
  default: unknown;
  description: string;
  readOnly: boolean;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  postgres: boolean;
  mongo: boolean;
  ollama: boolean;
  pushConfigured: boolean;
  /** The seeded administrator still has its published default password. */
  defaultAdminPassword: boolean;
  jobs: Array<{
    job: string;
    lastOkAt: string | null;
    lastError: string | null;
    stale: boolean;
  }>;
  version: string;
}

/**
 * The portal's own reads and writes.
 *
 * Paging is explicit rather than hidden behind an infinite scroll: an Owner
 * looking for one member searches, and an Owner auditing an installation wants
 * to know how many there are. `loadMore` appends, `search` replaces — a filter
 * change that appended would show results from two different queries at once.
 */
export class AdminStore {
  #members: MemberSummary[] = [];
  #cursor: string | null = null;
  #filter: MemberFilter = {};
  #listeners = new Set<() => void>();

  constructor(private readonly client: BotvyClient) {}

  get members(): MemberSummary[] {
    return this.#members;
  }

  get hasMore(): boolean {
    return this.#cursor !== null;
  }

  get filter(): MemberFilter {
    return this.#filter;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async search(filter: MemberFilter = {}): Promise<void> {
    this.#filter = filter;
    const page = await this.#fetchMembers(filter, null);
    this.#members = page.members;
    this.#cursor = page.nextCursor;
    this.#announce();
  }

  async loadMore(): Promise<void> {
    if (!this.#cursor) return;
    const page = await this.#fetchMembers(this.#filter, this.#cursor);
    this.#members = [...this.#members, ...page.members];
    this.#cursor = page.nextCursor;
    this.#announce();
  }

  async setRole(userId: string, role: Role): Promise<void> {
    await this.client.rest(
      'PATCH',
      `/admin/users/${encodeURIComponent(userId)}/role`,
      { role },
    );
    this.#patchMember(userId, { role });
  }

  async ban(
    userId: string,
    reason?: string,
  ): Promise<{ sessionsEnded: number }> {
    const result = await this.client.rest<{ sessionsEnded: number }>(
      'POST',
      `/admin/users/${encodeURIComponent(userId)}/ban`,
      reason ? { reason } : {},
    );
    this.#patchMember(userId, { status: 'banned' });
    return result;
  }

  async unban(userId: string): Promise<void> {
    await this.client.rest(
      'POST',
      `/admin/users/${encodeURIComponent(userId)}/unban`,
    );
    this.#patchMember(userId, { status: 'active' });
  }

  async serviceClients(): Promise<ServiceClientSummary[]> {
    const { serviceClients } = await this.client.query<{
      serviceClients: ServiceClientSummary[];
    }>(`
      query ServiceClients {
        serviceClients { id name scopes createdAt lastUsedAt revokedAt }
      }
    `);
    return serviceClients;
  }

  /** The secret comes back once. The caller has to show it before it is gone. */
  async createServiceClient(
    name: string,
    scopes: string[],
  ): Promise<{ id: string; name: string; scopes: string[]; secret: string }> {
    return this.client.rest('POST', '/admin/service-clients', { name, scopes });
  }

  async revokeServiceClient(name: string): Promise<void> {
    await this.client.rest(
      'DELETE',
      `/admin/service-clients/${encodeURIComponent(name)}`,
    );
  }

  async settings(): Promise<SettingEntry[]> {
    // `defaultValue` aliased back to `default`: the schema cannot call a field
    // `default` without every generated client needing a reserved-word escape,
    // and the portal's table column is named after the registry's own term.
    const { settings } = await this.client.query<{ settings: SettingEntry[] }>(`
      query Settings {
        settings { key value default: defaultValue description readOnly }
      }
    `);
    return settings;
  }

  async patchSetting(key: string, value: unknown): Promise<void> {
    await this.client.rest(
      'PATCH',
      `/admin/settings/${encodeURIComponent(key)}`,
      { value },
    );
  }

  /**
   * `/health` is public and outside `/api/v1`, so it does not go through
   * `rest`. The overview reads it for the store and job tiles.
   */
  async health(baseUrl = ''): Promise<HealthReport> {
    const response = await fetch(`${baseUrl}/health`);
    return (await response.json()) as HealthReport;
  }

  /**
   * Applies a change locally instead of re-reading the page.
   *
   * A re-read after every row action would reshuffle the table under the
   * Owner's cursor — and with a cursor-paged list, page two of a list that has
   * changed is not the same page two.
   */
  #patchMember(userId: string, patch: Partial<MemberSummary>): void {
    this.#members = this.#members.map((member) =>
      member.id === userId ? { ...member, ...patch } : member,
    );
    this.#announce();
  }

  async #fetchMembers(
    filter: MemberFilter,
    cursor: string | null,
  ): Promise<MemberPage> {
    const { users } = await this.client.query<{
      users: { nodes: MemberPage['members']; endCursor: string | null };
    }>(
      `
      query Users(
        $search: String
        $status: UserStatus
        $role: Role
        $first: Int
        $after: String
      ) {
        users(search: $search, status: $status, role: $role, first: $first, after: $after) {
          nodes { id email displayName role status createdAt lastLoginAt deviceCount }
          endCursor
        }
      }
    `,
      {
        // Omitted rather than sent as null: the resolver treats an absent
        // argument as "no filter", and `status: null` would be a filter on
        // nothing.
        ...(filter.query ? { search: filter.query } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.role ? { role: filter.role } : {}),
        first: filter.limit ?? 25,
        ...(cursor ? { after: cursor } : {}),
      },
    );
    // `hasNextPage` is derivable from the cursor and the store only ever used
    // the cursor, so it is not selected.
    return { members: users.nodes, nextCursor: users.endCursor };
  }

  #announce(): void {
    for (const listener of this.#listeners) listener();
  }
}
