import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import { hashesMatch } from '../../../shared/auth/service-token.guard.js';
import { Device as DeviceAggregate } from '../domain/device.aggregate.js';
import {
  DeviceRepository,
  type Device,
} from '../domain/device.repository.js';
import {
  IdentityOutboxRepository,
  type PendingIdentityEvent,
} from '../domain/identity-outbox.repository.js';
import {
  RefreshTokenRepository,
  type IssueRefreshToken,
} from '../domain/refresh-token.repository.js';
import type { RefreshTokenRecord } from '../domain/session-chain.js';
import {
  ServiceClientRepository,
  type ServiceClient,
  type ServiceClientUpsert,
} from '../domain/service-client.repository.js';
import {
  UserRepository,
  type MemberPage,
  type MemberSearch,
} from '../domain/user.repository.js';
import type { User } from '../domain/user.aggregate.js';

/**
 * Identity's stores, in memory. The seeds and the `me`/`devices` handlers are
 * specified against these: the branches worth testing — is the seed a no-op on
 * the second boot, does a changed token rotate the hash — are about behaviour,
 * not about PostgreSQL.
 */
@Injectable()
export class InMemoryUserRepository extends UserRepository {
  readonly byId = new Map<string, User>();
  readonly events: DomainEvent[] = [];

  async findById(_userId: string, id: string): Promise<User | null> {
    return this.byId.get(id) ?? null;
  }

  async findByLogin(email: string): Promise<User | null> {
    for (const user of this.byId.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) return user;
    }
    return null;
  }

  async save(user: User): Promise<void> {
    this.events.push(...user.pullEvents());
    this.byId.set(user.id, user);
  }

  async remove(user: User): Promise<void> {
    this.events.push(...user.pullEvents());
    this.byId.delete(user.id);
  }

  async countAll(): Promise<number> {
    return this.byId.size;
  }

  async countAdminsExcept(userId: string): Promise<number> {
    let count = 0;
    for (const user of this.byId.values()) {
      if (user.id !== userId && user.role === 'admin' && user.isActive) count += 1;
    }
    return count;
  }

  async search(criteria: MemberSearch): Promise<MemberPage> {
    const needle = criteria.query?.toLowerCase();
    const matched = [...this.byId.values()]
      .filter((user) => user.deletedAt === null)
      .filter((user) => !criteria.status || user.status === criteria.status)
      .filter((user) => !criteria.role || user.role === criteria.role)
      .filter(
        (user) =>
          !needle ||
          user.email.toLowerCase().includes(needle) ||
          (user.displayName ?? '').toLowerCase().includes(needle),
      )
      // Descending by id, matching the Prisma adapter — the cursor only means
      // anything if both order the same way.
      .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .filter((user) => !criteria.cursor || user.id < criteria.cursor);

    const page = matched.slice(0, criteria.limit);
    return {
      members: page.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        deviceCount: 0,
      })),
      nextCursor: matched.length > criteria.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }
}

@Injectable()
export class InMemoryServiceClientRepository extends ServiceClientRepository {
  readonly byName = new Map<string, ServiceClient & { tokenHash: string }>();

  async findByName(name: string): Promise<ServiceClient | null> {
    return this.byName.get(name) ?? null;
  }

  async upsert(client: ServiceClientUpsert): Promise<ServiceClient> {
    const existing = this.byName.get(client.name);
    const row = {
      id: existing?.id ?? `svc-${this.byName.size + 1}`,
      name: client.name,
      tokenHash: client.tokenHash,
      scopes: client.scopes,
      createdAt: existing?.createdAt ?? new Date(),
      lastUsedAt: existing?.lastUsedAt ?? null,
      revokedAt: existing?.revokedAt ?? null,
    };
    this.byName.set(client.name, row);
    return row;
  }

  async verifyToken(presentedTokenHash: string): Promise<ServiceClient | null> {
    for (const row of this.byName.values()) {
      // Revoked clients are skipped, exactly as the Prisma adapter's `where`
      // does. Without this the two adapters disagree about whether a revoked
      // token still works, and a spec would pass against one and lie about the
      // other.
      if (row.revokedAt !== null) continue;
      if (hashesMatch(presentedTokenHash, row.tokenHash)) return row;
    }
    return null;
  }

  async touch(id: string, at: Date): Promise<void> {
    for (const row of this.byName.values()) {
      if (row.id === id) row.lastUsedAt = at;
    }
  }

  async listAll(): Promise<ServiceClient[]> {
    return [...this.byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async revoke(id: string): Promise<boolean> {
    for (const row of this.byName.values()) {
      if (row.id === id && row.revokedAt === null) {
        row.revokedAt = new Date();
        return true;
      }
    }
    return false;
  }
}

@Injectable()
export class InMemoryDeviceRepository extends DeviceRepository {
  readonly rows: Device[] = [];
  readonly events: DomainEvent[] = [];

  async listByUser(userId: string): Promise<Device[]> {
    return this.rows.filter((row) => row.userId === userId);
  }

  async listByUsers(userIds: string[]): Promise<Device[]> {
    return this.rows.filter((row) => userIds.includes(row.userId));
  }

  async findById(userId: string, id: string): Promise<DeviceAggregate | null> {
    const row = this.rows.find((candidate) => candidate.id === id && candidate.userId === userId);
    return row ? this.#hydrate(row) : null;
  }

  async findByInstallId(installId: string): Promise<DeviceAggregate | null> {
    const row = this.rows.find((candidate) => candidate.installId === installId);
    return row ? this.#hydrate(row) : null;
  }

  async save(device: DeviceAggregate): Promise<void> {
    this.events.push(...device.pullEvents());
    const row: Device = {
      id: device.id,
      userId: device.userId,
      installId: device.installId,
      kind: device.kind,
      name: device.name,
      pushToken: device.pushToken,
      lastSeenAt: device.lastSeenAt,
    };
    const at = this.rows.findIndex((candidate) => candidate.id === device.id);
    if (at === -1) this.rows.push(row);
    else this.rows[at] = row;
  }

  async remove(device: DeviceAggregate): Promise<void> {
    this.events.push(...device.pullEvents());
    const at = this.rows.findIndex((candidate) => candidate.id === device.id);
    if (at !== -1) this.rows.splice(at, 1);
  }

  // The read model carries no timestamps; the aggregate needs them, and for an
  // in-memory adapter the created time is only ever compared against itself.
  #hydrate(row: Device): DeviceAggregate {
    return DeviceAggregate.rehydrate({
      ...row,
      createdAt: row.lastSeenAt ?? new Date(0),
      updatedAt: row.lastSeenAt ?? new Date(0),
    });
  }
}

/**
 * The refresh chain, in memory.
 *
 * `rotate` marks and inserts in one call because the port says so, and the port
 * says so because in PostgreSQL it is one transaction — an adapter that split it
 * would pass a handler spec and lose sessions against a real database.
 */
@Injectable()
export class InMemoryRefreshTokenRepository extends RefreshTokenRepository {
  readonly rows: RefreshTokenRecord[] = [];
  #next = 0;

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.rows.find((row) => row.tokenHash === tokenHash) ?? null;
  }

  async issue(token: IssueRefreshToken): Promise<RefreshTokenRecord> {
    this.#next += 1;
    const row: RefreshTokenRecord = {
      id: `rt-${this.#next}`,
      ...token,
      revokedAt: null,
      replacedBy: null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }

  async rotate(
    previousId: string,
    next: IssueRefreshToken,
  ): Promise<RefreshTokenRecord | null> {
    const previous = this.rows.find((row) => row.id === previousId);
    // The same claim the Prisma adapter makes. An in-memory adapter that
    // rotated unconditionally would let a handler spec pass while the real
    // store handed out two live tokens — which is the whole reason the
    // contract test exists.
    if (!previous || previous.revokedAt !== null || previous.replacedBy !== null) {
      return null;
    }
    previous.revokedAt = new Date();

    const issued = await this.issue(next);
    previous.replacedBy = issued.id;
    return issued;
  }

  async revoke(tokenId: string): Promise<boolean> {
    const row = this.rows.find((candidate) => candidate.id === tokenId);
    if (!row || row.revokedAt !== null) return false;
    row.revokedAt = new Date();
    return true;
  }

  async revokeFamily(familyId: string): Promise<number> {
    return this.#revokeWhere((row) => row.familyId === familyId);
  }

  async revokeAllForUser(userId: string): Promise<number> {
    return this.#revokeWhere((row) => row.userId === userId);
  }

  async deleteExpired(before: Date): Promise<number> {
    const doomed = this.rows.filter((row) => row.expiresAt.getTime() < before.getTime());
    for (const row of doomed) this.rows.splice(this.rows.indexOf(row), 1);
    return doomed.length;
  }

  #revokeWhere(matches: (row: RefreshTokenRecord) => boolean): number {
    let revoked = 0;
    const at = new Date();
    for (const row of this.rows) {
      if (matches(row) && row.revokedAt === null) {
        row.revokedAt = at;
        revoked += 1;
      }
    }
    return revoked;
  }
}

@Injectable()
export class InMemoryIdentityOutboxRepository extends IdentityOutboxRepository {
  readonly rows: Array<PendingIdentityEvent & { forwardedAt: Date | null }> = [];

  async append(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      this.rows.push({
        id: event.eventId,
        name: event.name,
        aggregate: event.aggregate,
        userId: event.userId,
        payload: event.payload,
        schemaVersion: event.schemaVersion,
        occurredAt: event.occurredAt,
        forwardedAt: null,
      });
    }
  }

  async listPending(limit: number): Promise<PendingIdentityEvent[]> {
    return this.rows
      .filter((row) => row.forwardedAt === null)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .slice(0, limit);
  }

  async markForwarded(ids: string[]): Promise<void> {
    for (const row of this.rows) {
      if (ids.includes(row.id)) row.forwardedAt = new Date();
    }
  }
}
