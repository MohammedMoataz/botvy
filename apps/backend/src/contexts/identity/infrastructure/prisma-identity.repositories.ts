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
import { Device as DeviceAggregate } from '../domain/device.aggregate.js';
import { DeviceRepository, type Device, type DeviceKind } from '../domain/device.repository.js';
import {
  RefreshTokenRepository,
  type IssueRefreshToken,
} from '../domain/refresh-token.repository.js';
import type { RefreshTokenRecord } from '../domain/session-chain.js';
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
import {
  UserRepository,
  type MemberPage,
  type MemberSearch,
  type MemberSummary,
} from '../domain/user.repository.js';

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

  async countAdminsExcept(userId: string): Promise<number> {
    return client(this.prisma).user.count({
      where: { role: 'admin', status: 'active', deletedAt: null, id: { not: userId } },
    });
  }

  async search(criteria: MemberSearch): Promise<MemberPage> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (criteria.status) where.status = criteria.status;
    if (criteria.role) where.role = criteria.role;
    if (criteria.query) {
      where.OR = [
        { email: { contains: criteria.query, mode: 'insensitive' } },
        { displayName: { contains: criteria.query, mode: 'insensitive' } },
      ];
    }
    if (criteria.cursor) where.id = { lt: criteria.cursor };

    // One extra row, to learn whether there is another page without counting
    // the whole table.
    const rows = await client(this.prisma).user.findMany({
      where,
      orderBy: { id: 'desc' },
      take: criteria.limit + 1,
      include: { _count: { select: { devices: true } } },
    });

    const page = rows.slice(0, criteria.limit);
    return {
      members: page.map(toMemberSummary),
      nextCursor: rows.length > criteria.limit ? (page.at(-1)?.id ?? null) : null,
    };
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

  async listAll(): Promise<ServiceClient[]> {
    const rows = await client(this.prisma).serviceClient.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toServiceClient);
  }

  async revoke(id: string): Promise<boolean> {
    const result = await client(this.prisma).serviceClient.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }
}

@Injectable()
export class PrismaDeviceRepository extends DeviceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: IdentityOutboxRepository,
  ) {
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

  async findById(userId: string, id: string): Promise<DeviceAggregate | null> {
    const row = await client(this.prisma).device.findFirst({ where: { id, userId } });
    return row ? toDeviceAggregate(row) : null;
  }

  async findByInstallId(installId: string): Promise<DeviceAggregate | null> {
    const row = await client(this.prisma).device.findUnique({ where: { installId } });
    return row ? toDeviceAggregate(row) : null;
  }

  async save(device: DeviceAggregate): Promise<void> {
    const events = device.pullEvents();
    const data = {
      name: device.name,
      kind: device.kind,
      fcmToken: device.pushToken,
      lastSeenAt: device.lastSeenAt,
    };

    await client(this.prisma).device.upsert({
      where: { id: device.id },
      create: {
        id: device.id,
        userId: device.userId,
        installId: device.installId,
        // v1's column, still non-null. `kind` is what this codebase reads; this
        // keeps the old one populated rather than leaving a NOT NULL to fail.
        platform: device.kind,
        createdAt: device.createdAt,
        ...data,
      },
      update: data,
    });

    await this.outbox.append(events);
  }

  async remove(device: DeviceAggregate): Promise<void> {
    const events = device.pullEvents();
    await client(this.prisma).device.delete({ where: { id: device.id } });
    await this.outbox.append(events);
  }
}

/**
 * The refresh chain.
 *
 * `rotate` is a single transaction, and that is the whole reason it is one
 * method: marking the old token exchanged without writing its successor signs
 * the member out, and writing the successor without marking the old one leaves
 * two live tokens in a family whose entire purpose is that there is only ever
 * one — which is exactly the state a replay check reads as a theft.
 */
@Injectable()
export class PrismaRefreshTokenRepository extends RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = await client(this.prisma).refreshToken.findFirst({ where: { tokenHash } });
    return row ? toRefreshRecord(row) : null;
  }

  async issue(token: IssueRefreshToken): Promise<RefreshTokenRecord> {
    const row = await client(this.prisma).refreshToken.create({
      data: {
        userId: token.userId,
        familyId: token.familyId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        deviceId: token.deviceId,
      },
    });
    return toRefreshRecord(row);
  }

  async rotate(previousId: string, next: IssueRefreshToken): Promise<RefreshTokenRecord> {
    const run = async (tx: PrismaTransaction | PrismaService): Promise<RefreshTokenRecord> => {
      const issued = await tx.refreshToken.create({
        data: {
          userId: next.userId,
          familyId: next.familyId,
          tokenHash: next.tokenHash,
          expiresAt: next.expiresAt,
          deviceId: next.deviceId,
        },
      });
      await tx.refreshToken.update({
        where: { id: previousId },
        data: { replacedBy: issued.id, revokedAt: new Date() },
      });
      return toRefreshRecord(issued);
    };

    // Joins the caller's transaction when there is one, rather than opening a
    // nested one — Prisma refuses those, and a handler that already has a unit
    // of work open is the normal case here.
    const existing = PrismaUnitOfWork.currentTx();
    if (existing) return run(existing);
    return this.prisma.$transaction((tx) => run(tx as PrismaTransaction));
  }

  async revoke(tokenId: string): Promise<boolean> {
    const result = await client(this.prisma).refreshToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeFamily(familyId: string): Promise<number> {
    const result = await client(this.prisma).refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await client(this.prisma).refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async deleteExpired(before: Date): Promise<number> {
    const result = await client(this.prisma).refreshToken.deleteMany({
      where: { expiresAt: { lt: before } },
    });
    return result.count;
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

function toMemberSummary(row: Record<string, unknown>): MemberSummary {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: (row.displayName as string | null) ?? null,
    role: row.role === 'admin' ? 'admin' : 'user',
    status: row.status === 'banned' ? 'banned' : 'active',
    createdAt: row.createdAt as Date,
    lastLoginAt: (row.lastLoginAt as Date | null) ?? null,
    deviceCount: ((row._count as { devices?: number } | undefined)?.devices) ?? 0,
  };
}

function toDeviceAggregate(row: Record<string, unknown>): DeviceAggregate {
  const view = toDevice(row);
  const createdAt = (row.createdAt as Date | null) ?? new Date(0);
  return DeviceAggregate.rehydrate({
    ...view,
    createdAt,
    // The table has no updatedAt of its own; last seen is the closest true
    // answer, and inventing one would make a synced row look edited.
    updatedAt: view.lastSeenAt ?? createdAt,
  });
}

function toRefreshRecord(row: Record<string, unknown>): RefreshTokenRecord {
  return {
    id: String(row.id),
    userId: String(row.userId),
    familyId: String(row.familyId),
    tokenHash: String(row.tokenHash),
    expiresAt: row.expiresAt as Date,
    revokedAt: (row.revokedAt as Date | null) ?? null,
    replacedBy: (row.replacedBy as string | null) ?? null,
    deviceId: (row.deviceId as string | null) ?? null,
    createdAt: (row.createdAt as Date | null) ?? new Date(0),
  };
}
