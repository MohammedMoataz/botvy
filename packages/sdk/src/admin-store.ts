import { ApiError, type BotvyClient } from './client.js';
import type { Role } from './auth-store.js';

/**
 * The member an act was aimed at is not there any more.
 *
 * Distinct from every other refusal because the *answer* is different: a guard
 * rail says "no, and here is why", and the row stays. This says the row itself
 * is wrong, so the store drops it and the screen goes back to the list rather
 * than leaving an Owner pressing a button against an account that has been
 * deleted — from another tab, from the member's own settings, or by a purge.
 */
export class MemberGone extends Error {
  constructor(readonly userId: string) {
    super('That account no longer exists.');
    this.name = 'MemberGone';
  }
}

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
  /**
   * Which input this key's own rule asks for (P10, FR-006).
   *
   * Derived on the server from the zod schema the registry declares, so a key
   * added there renders correctly here with no change to this package. `kind`
   * is read and an unknown one falls back to a text box, which is what keeps a
   * seventh control from being a contract change.
   */
  control: SettingControl;
}

export type SettingControl =
  | { kind: 'switch' }
  | { kind: 'number'; min?: number; max?: number; integer: boolean }
  | { kind: 'choice'; options: string[] }
  | { kind: 'time' }
  | { kind: 'text' }
  | { kind: 'chips' }
  | { kind: 'json' }
  /** Anything the server knows about and this build does not. */
  | { kind: string };

/** One recorded act, as the audit page reads it. */
export interface AuditEntry {
  id: string;
  at: string;
  actorType: string;
  actorId: string;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string | null;
  meta: Record<string, unknown> | null;
}

/** One group of model calls: a day, a kind, a model, and maybe a member. */
export interface UsageRow {
  day: string;
  kind: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  calls: number;
  userId: string | null;
}

/** One automation workflow, as the Owner drives it. */
export interface WorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
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
    await this.#against(userId, () =>
      this.client.rest('PATCH', `/admin/users/${encodeURIComponent(userId)}/role`, {
        role,
      }),
    );
    this.#patchMember(userId, { role });
  }

  async ban(
    userId: string,
    reason?: string,
  ): Promise<{ sessionsEnded: number }> {
    const result = await this.#against(userId, () =>
      this.client.rest<{ sessionsEnded: number }>(
        'POST',
        `/admin/users/${encodeURIComponent(userId)}/ban`,
        reason ? { reason } : {},
      ),
    );
    this.#patchMember(userId, { status: 'banned' });
    return result;
  }

  async unban(userId: string): Promise<void> {
    await this.#against(userId, () =>
      this.client.rest('POST', `/admin/users/${encodeURIComponent(userId)}/unban`),
    );
    this.#patchMember(userId, { status: 'active' });
  }

  /**
   * Runs an act aimed at one member, and drops the row if it has gone.
   *
   * Here rather than in each of the three, because the three would drift: the
   * list an Owner is looking at is a snapshot, and any of them can be aimed at
   * an account that was deleted since it was drawn. A 404 is the only status
   * that means this — a 409 is a guard rail, a 403 is the Owner's own role —
   * so it is the only one that removes anything.
   */
  async #against<R>(userId: string, act: () => Promise<R>): Promise<R> {
    try {
      return await act();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        this.#members = this.#members.filter((member) => member.id !== userId);
        this.#announce();
        throw new MemberGone(userId);
      }
      throw error;
    }
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
        settings { key value default: defaultValue description readOnly control }
      }
    `);
    return settings;
  }

  /**
   * The administrative trail, a page at a time (FR-005).
   *
   * `after` is the previous page's `endCursor` and nothing else: the rows are
   * ordered and cursored by id on the server, because acts arrive while the
   * Owner is reading and an offset would show one twice and hide another.
   */
  async audit(
    filter: {
      actor?: string;
      action?: string;
      targetType?: string;
      from?: string;
      to?: string;
      first?: number;
      after?: string;
    } = {},
  ): Promise<{ nodes: AuditEntry[]; endCursor: string | null; hasNextPage: boolean }> {
    const { audit } = await this.client.query<{
      audit: { nodes: AuditEntry[]; endCursor: string | null; hasNextPage: boolean };
    }>(
      `query Audit($actor: ID, $action: String, $targetType: String, $from: DateTime, $to: DateTime, $first: Int, $after: String) {
        audit(actor: $actor, action: $action, targetType: $targetType, from: $from, to: $to, first: $first, after: $after) {
          nodes { id at actorType actorId actorLabel action targetType targetId meta }
          endCursor
          hasNextPage
        }
      }`,
      filter,
    );
    return audit;
  }

  /**
   * What the model has been asked to do (FR-011).
   *
   * `from` and `to` are both **inclusive** dates, which is what an operator
   * typing "the 1st to the 7th" means; the server turns the second into the
   * exclusive instant. The day on each row is UTC — an operator-wide view has
   * no single member whose midnight it could use — and the screen says so.
   */
  async usage(range: {
    from: string;
    to: string;
    userId?: string;
    byMember?: boolean;
  }): Promise<UsageRow[]> {
    const { usage } = await this.client.query<{ usage: UsageRow[] }>(
      `query Usage($from: Date!, $to: Date!, $userId: ID, $byMember: Boolean) {
        usage(from: $from, to: $to, userId: $userId, byMember: $byMember) {
          day kind model promptTokens completionTokens calls userId
        }
      }`,
      range,
    );
    return usage;
  }

  /**
   * The automation, over REST rather than GraphQL.
   *
   * The one deliberate exception to "reads are GraphQL" in this client, and the
   * server's controller carries the argument: this is not a read of the
   * platform's own data but a question asked of another system that can be
   * down, and a GraphQL error in the middle of a query that also asked for
   * something real is the wrong shape for "n8n is not answering".
   */
  async workflows(): Promise<WorkflowSummary[]> {
    const { workflows } = await this.client.rest<{ workflows: WorkflowSummary[] }>(
      'GET',
      '/admin/workflows',
    );
    return workflows;
  }

  async setWorkflowActive(id: string, active: boolean): Promise<void> {
    await this.client.rest(
      'POST',
      `/admin/workflows/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`,
    );
  }

  async runWorkflow(id: string): Promise<{ executionId: string | null }> {
    return this.client.rest(
      'POST',
      `/admin/workflows/${encodeURIComponent(id)}/run`,
    );
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
