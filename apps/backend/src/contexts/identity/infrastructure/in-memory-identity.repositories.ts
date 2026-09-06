import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import { hashesMatch } from '../../../shared/auth/service-token.guard.js';
import {
  DeviceRepository,
  type Device,
} from '../domain/device.repository.js';
import {
  IdentityOutboxRepository,
  type PendingIdentityEvent,
} from '../domain/identity-outbox.repository.js';
import {
  ServiceClientRepository,
  type ServiceClient,
  type ServiceClientUpsert,
} from '../domain/service-client.repository.js';
import { UserRepository } from '../domain/user.repository.js';
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
      if (hashesMatch(presentedTokenHash, row.tokenHash)) return row;
    }
    return null;
  }

  async touch(id: string, at: Date): Promise<void> {
    for (const row of this.byName.values()) {
      if (row.id === id) row.lastUsedAt = at;
    }
  }
}

@Injectable()
export class InMemoryDeviceRepository extends DeviceRepository {
  readonly rows: Device[] = [];

  async listByUser(userId: string): Promise<Device[]> {
    return this.rows.filter((row) => row.userId === userId);
  }

  async listByUsers(userIds: string[]): Promise<Device[]> {
    return this.rows.filter((row) => userIds.includes(row.userId));
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
