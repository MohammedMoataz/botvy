import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hashesMatch } from '../../../shared/auth/service-token.guard.js';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import {
  PrismaService,
  type PrismaTransaction,
} from '../../../shared/persistence/prisma/prisma.service.js';
import {
  PrismaUnitOfWork,
  toIdentityOutboxRow,
} from '../../../shared/persistence/prisma/prisma-unit-of-work.js';
import { DeviceRepository, type Device, type DeviceKind } from '../domain/device.repository.js';
import {
  IdentityOutboxRepository,
  type PendingIdentityEvent,
} from '../domain/identity-outbox.repository.js';
import {
  ServiceClientRepository,
  type ServiceClient,
  type ServiceClientUpsert,
} from '../domain/service-client.repository.js';
import { User, type UserState } from '../domain/user.aggregate.js';
import { UserRepository } from '../domain/user.repository.js';

/** The transaction if one is in force, otherwise the base client. */
function client(prisma: PrismaService): PrismaTransaction | PrismaService {
  return PrismaUnitOfWork.currentTx() ?? prisma;
}

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: IdentityOutboxRepository,
  ) {
    super();
  }

  async findById(_userId: string, id: string): Promise<User | null> {
    const row = await client(this.prisma).user.findUnique({ where: { id } });
    return row ? User.rehydrate(toUserState(row)) : null;
  }

  async findByLogin(email: string): Promise<User | null> {
    const row = await client(this.prisma).user.findUnique({ where: { email } });
    return row ? User.rehydrate(toUserState(row)) : null;
  }

  async save(user: User): Promise<void> {
    const events = user.pullEvents();
    const data = {
      email: user.email,
      passwordHash: user.passwordHash ?? '',
      displayName: user.displayName,
      googleSub: user.googleSub,
      role: user.role,
      status: user.status,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      deletedAt: user.deletedAt,
    };

    await client(this.prisma).user.upsert({
      where: { id: user.id },
      create: { id: user.id, createdAt: user.createdAt, ...data },
      update: data,
    });

    // In the same transaction as the change above. That is the whole point of
    // the table: a post-commit write to Mongo would be at-most-once.
    await this.outbox.append(events);
  }

  async remove(user: User): Promise<void> {
    const events = user.pullEvents();
    await client(this.prisma).user.delete({ where: { id: user.id } });
    await this.outbox.append(events);
  }

  async countAll(): Promise<number> {
    return client(this.prisma).user.count();
  }
}

@Injectable()
export class PrismaServiceClientRepository extends ServiceClientRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByName(name: string): Promise<ServiceClient | null> {
    const row = await client(this.prisma).serviceClient.findUnique({ where: { name } });
    return row ? toServiceClient(row) : null;
  }

  async upsert(input: ServiceClientUpsert): Promise<ServiceClient> {
    const row = await client(this.prisma).serviceClient.upsert({
      where: { name: input.name },
      create: {
        id: randomUUID(),
        name: input.name,
        tokenHash: input.tokenHash,
        scopes: input.scopes,
      },
      update: { tokenHash: input.tokenHash, scopes: input.scopes },
    });
    return toServiceClient(row);
  }

  /**
   * Every non-revoked client is compared in constant time. Selecting by hash
   * would be faster and would leak: the database's own index comparison is not
   * constant-time, and a timing difference is how a token gets guessed.
   */
  async verifyToken(presentedTokenHash: string): Promise<ServiceClient | null> {
    const rows = await client(this.prisma).serviceClient.findMany({
      where: { revokedAt: null },
    });
    for (const row of rows) {
      if (hashesMatch(presentedTokenHash, row.tokenHash)) return toServiceClient(row);
    }
    return null;
  }

  async touch(id: string, at: Date): Promise<void> {
    await client(this.prisma).serviceClient.update({
      where: { id },
      data: { lastUsedAt: at },
    });
  }
}

@Injectable()
export class PrismaDeviceRepository extends DeviceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listByUser(userId: string): Promise<Device[]> {
    const rows = await client(this.prisma).device.findMany({ where: { userId } });
    return rows.map(toDevice);
  }

  async listByUsers(userIds: string[]): Promise<Device[]> {
    if (userIds.length === 0) return [];
    const rows = await client(this.prisma).device.findMany({
      where: { userId: { in: userIds } },
    });
    return rows.map(toDevice);
  }
}

@Injectable()
export class PrismaIdentityOutboxRepository extends IdentityOutboxRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async append(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    // The envelope types the payload as `unknown` because a payload is whatever
    // the raising context decided. It becomes JSON exactly here, at the store
    // boundary, which is the one place that is true.
    const data = events.map((event) => {
      const row = toIdentityOutboxRow(event);
      return {
        ...row,
        aggregate: row.aggregate as object,
        payload: (row.payload ?? {}) as object,
      };
    });
    await client(this.prisma).identityOutbox.createMany({ data });
  }

  async listPending(limit: number): Promise<PendingIdentityEvent[]> {
    const rows = await client(this.prisma).identityOutbox.findMany({
      where: { forwardedAt: null },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      aggregate: row.aggregate as { type: string; id: string },
      userId: row.userId,
      payload: row.payload,
      schemaVersion: row.schemaVersion,
      occurredAt: row.occurredAt,
    }));
  }

  async markForwarded(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await client(this.prisma).identityOutbox.updateMany({
      where: { id: { in: ids } },
      data: { forwardedAt: new Date() },
    });
  }
}

function toUserState(row: Record<string, unknown>): UserState {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: (row.displayName as string | null) ?? null,
    passwordHash: (row.passwordHash as string | null) ?? null,
    googleSub: (row.googleSub as string | null) ?? null,
    role: row.role === 'admin' ? 'admin' : 'user',
    status: row.status === 'banned' ? 'banned' : 'active',
    createdAt: row.createdAt as Date,
    updatedAt: (row.updatedAt as Date | undefined) ?? (row.createdAt as Date),
    lastLoginAt: (row.lastLoginAt as Date | null) ?? null,
    deletedAt: (row.deletedAt as Date | null) ?? null,
  };
}

function toServiceClient(row: Record<string, unknown>): ServiceClient {
  return {
    id: String(row.id),
    name: String(row.name),
    scopes: (row.scopes as string[]) ?? [],
    createdAt: row.createdAt as Date,
    lastUsedAt: (row.lastUsedAt as Date | null) ?? null,
    revokedAt: (row.revokedAt as Date | null) ?? null,
  };
}

function toDevice(row: Record<string, unknown>): Device {
  return {
    id: String(row.id),
    userId: String(row.userId),
    installId: String(row.installId),
    kind: (row.kind as DeviceKind) ?? 'android',
    name: (row.name as string | null) ?? null,
    pushToken: (row.fcmToken as string | null) ?? null,
    lastSeenAt: (row.lastSeenAt as Date | null) ?? null,
  };
}
