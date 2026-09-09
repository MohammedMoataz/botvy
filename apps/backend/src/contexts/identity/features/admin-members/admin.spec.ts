import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditAdapter } from '../../../operations/infrastructure/mongo-operations.adapters.js';
import { User } from '../../domain/user.aggregate.js';
import {
  InMemoryRefreshTokenRepository,
  InMemoryServiceClientRepository,
  InMemoryUserRepository,
} from '../../infrastructure/in-memory-identity.repositories.js';
import { hashToken } from '../../../../shared/auth/service-token.guard.js';
import {
  AdminServiceClientsHandler,
  ServiceClientNameTaken,
  ServiceClientNotFound,
} from '../admin-service-clients/admin-service-clients.handler.js';
import {
  AdminMembersHandler,
  CannotActOnSelf,
  LastAdminProtected,
  MemberNotFound,
} from './admin-members.handler.js';

import { InMemoryUnitOfWork } from '../../../../shared/persistence/memory/in-memory-unit-of-work.js';

let uow: InMemoryUnitOfWork;

const NOW = new Date('2026-09-09T10:00:00.000Z');
const OWNER = { kind: 'user', id: 'admin-1', role: 'admin' } as const;

function account(id: string, overrides: Record<string, unknown> = {}) {
  return User.rehydrate({
    id,
    email: `${id}@example.test`,
    displayName: null,
    passwordHash: 'hashed',
    googleSub: null,
    role: 'user',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
    lastLoginAt: null,
    deletedAt: null,
    ...overrides,
  } as never);
}

describe('admin member actions', () => {
  let users: InMemoryUserRepository;
  let tokens: InMemoryRefreshTokenRepository;
  let audit: InMemoryAuditAdapter;
  let handler: AdminMembersHandler;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    users = new InMemoryUserRepository(uow);
    tokens = new InMemoryRefreshTokenRepository();
    audit = new InMemoryAuditAdapter();
    handler = new AdminMembersHandler(uow, users, tokens, audit);

    await users.save(account('admin-1', { role: 'admin' }));
    await users.save(account('admin-2', { role: 'admin' }));
    await users.save(account('member-1'));
  });

  const issueFor = async (userId: string, familyId: string) =>
    tokens.issue({
      userId,
      familyId,
      tokenHash: `hash-${familyId}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      deviceId: null,
    });

  const actions = () => audit.entries.map((row) => row.action);

  it('promotes a member and records who did it', async () => {
    await handler.setRole(OWNER, 'member-1', 'admin');

    expect((await users.findById('member-1', 'member-1'))?.role).toBe('admin');
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'admin.setRole',
      target: { type: 'user', id: 'member-1' },
    });
    expect(audit.entries.at(-1)?.actor.id).toBe('admin-1');
  });

  /**
   * The ban is only as good as the sessions it ends. An access token lasts
   * fifteen minutes but a refresh token lasts thirty days, so without revoking
   * the families a banned member keeps working for a month.
   */
  it('ends every session when a member is banned', async () => {
    await issueFor('member-1', 'fam-1');
    await issueFor('member-1', 'fam-2');

    const result = await handler.ban(OWNER, 'member-1', 'spam');

    expect(result.sessionsEnded).toBe(2);
    expect(tokens.rows.every((row) => row.revokedAt !== null)).toBe(true);
    expect((await users.findById('member-1', 'member-1'))?.isActive).toBe(false);
  });

  it('leaves another member\'s sessions alone', async () => {
    await issueFor('member-1', 'fam-1');
    await issueFor('admin-2', 'fam-9');

    await handler.ban(OWNER, 'member-1', null);

    expect(tokens.rows.find((row) => row.userId === 'admin-2')?.revokedAt).toBeNull();
  });

  /** A session that survived a ban is a session the ban did not end. */
  it('does not restore the revoked sessions on unban', async () => {
    await issueFor('member-1', 'fam-1');
    await handler.ban(OWNER, 'member-1', null);

    await handler.unban(OWNER, 'member-1');

    expect((await users.findById('member-1', 'member-1'))?.isActive).toBe(true);
    expect(tokens.rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  /** Both of these are one click from an installation nobody can administer. */
  it('refuses to let an administrator ban themselves', async () => {
    await expect(handler.ban(OWNER, 'admin-1', null)).rejects.toBeInstanceOf(CannotActOnSelf);
  });

  it('refuses to let an administrator demote themselves', async () => {
    await expect(handler.setRole(OWNER, 'admin-1', 'user')).rejects.toBeInstanceOf(
      CannotActOnSelf,
    );
  });

  /**
   * There is no recovery path from an installation with no administrator other
   * than editing the database by hand.
   */
  it('refuses to demote the last administrator', async () => {
    await handler.setRole(OWNER, 'admin-2', 'user');

    const refused = await handler
      .setRole({ ...OWNER, id: 'admin-2' }, 'admin-1', 'user')
      .catch((error: Error) => error);

    expect(refused).toBeInstanceOf(LastAdminProtected);
    expect((await users.findById('admin-1', 'admin-1'))?.role).toBe('admin');
  });

  it('refuses to ban the last administrator', async () => {
    await handler.setRole(OWNER, 'admin-2', 'user');

    await expect(
      handler.ban({ ...OWNER, id: 'admin-2' }, 'admin-1', null),
    ).rejects.toBeInstanceOf(LastAdminProtected);
  });

  it('allows demoting an administrator while another remains', async () => {
    await expect(handler.setRole(OWNER, 'admin-2', 'user')).resolves.toMatchObject({
      role: 'user',
    });
  });

  it('reports an unknown member as not found', async () => {
    await expect(handler.ban(OWNER, 'nobody', null)).rejects.toBeInstanceOf(MemberNotFound);
  });

  it('treats a deleted member as gone', async () => {
    const member = await users.findById('member-1', 'member-1');
    member?.softDelete();
    if (member) await uow.run(() => users.save(member));

    await expect(handler.setRole(OWNER, 'member-1', 'admin')).rejects.toBeInstanceOf(
      MemberNotFound,
    );
  });

  /**
   * An attempt that was refused is exactly what an Owner wants to find
   * afterwards — a trail that records only successes cannot show it.
   */
  it('records a refused action, not only a successful one', async () => {
    await handler.ban(OWNER, 'admin-1', null).catch(() => undefined);

    expect(actions()).toContain('admin.ban');
    expect(audit.entries.at(-1)?.meta).toMatchObject({ outcome: 'refused', reason: 'self_ban' });
  });

  it('records a refusal for a member that does not exist', async () => {
    await handler.unban(OWNER, 'nobody').catch(() => undefined);

    expect(audit.entries.at(-1)?.meta).toMatchObject({ reason: 'not_found' });
  });
});

describe('admin member listing', () => {
  let users: InMemoryUserRepository;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    users = new InMemoryUserRepository(uow);
    await users.save(account('user-a', { email: 'alice@example.test', displayName: 'Alice' }));
    await users.save(account('user-b', { email: 'bob@example.test', status: 'banned' }));
    await users.save(account('user-c', { email: 'carol@example.test', role: 'admin' }));
  });

  it('finds a member by part of their address, case-insensitively', async () => {
    const page = await users.search({ query: 'ALICE', limit: 10 });

    expect(page.members.map((member) => member.id)).toEqual(['user-a']);
  });

  it('finds a member by display name', async () => {
    const page = await users.search({ query: 'alic', limit: 10 });

    expect(page.members).toHaveLength(1);
  });

  it('filters by status and by role', async () => {
    expect((await users.search({ status: 'banned', limit: 10 })).members).toHaveLength(1);
    expect((await users.search({ role: 'admin', limit: 10 })).members).toHaveLength(1);
  });

  it('omits deleted members', async () => {
    const member = await users.findById('user-a', 'user-a');
    member?.softDelete();
    if (member) await uow.run(() => users.save(member));

    expect((await users.search({ limit: 10 })).members).toHaveLength(2);
  });

  /** The cursor is only meaningful if a page reports whether more exists. */
  it('pages with a cursor, and says when there is nothing more', async () => {
    const first = await users.search({ limit: 2 });
    expect(first.members).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    const second = await users.search({ limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.members).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });

  it('does not repeat a member across pages', async () => {
    const first = await users.search({ limit: 2 });
    const second = await users.search({ limit: 2, cursor: first.nextCursor ?? undefined });

    const ids = [...first.members, ...second.members].map((member) => member.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('admin service clients', () => {
  let clients: InMemoryServiceClientRepository;
  let audit: InMemoryAuditAdapter;
  let handler: AdminServiceClientsHandler;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    clients = new InMemoryServiceClientRepository();
    audit = new InMemoryAuditAdapter();
    handler = new AdminServiceClientsHandler(clients, audit);
  });

  it('returns the secret once, and records the creation', async () => {
    const created = await handler.create(OWNER, 'zapier', ['internal:alerts']);

    expect(created.secret).toBeTypeOf('string');
    expect(audit.entries.at(-1)).toMatchObject({ action: 'admin.createServiceClient' });
  });

  /** A dump of the table must not hand over anyone's integration credentials. */
  it('stores only a hash, and never shows the secret again', async () => {
    const created = await handler.create(OWNER, 'zapier', []);

    const listed = await handler.list();
    expect(JSON.stringify(listed)).not.toContain(created.secret);
    const stored = clients.byName.get('zapier');
    expect(stored?.tokenHash).toBe(hashToken(created.secret));
  });

  /** The audit row is read by more people than the response is. */
  it('keeps the secret out of the audit trail', async () => {
    const created = await handler.create(OWNER, 'zapier', ['internal:ops']);

    expect(JSON.stringify(audit.entries)).not.toContain(created.secret);
    expect(audit.entries.at(-1)?.meta).toMatchObject({ scopes: ['internal:ops'] });
  });

  /**
   * Refused rather than rotated: an admin creating a client that silently
   * replaced an existing one's secret would break whichever integration held
   * it, with nothing to say why.
   */
  it('refuses a name that is already taken', async () => {
    await handler.create(OWNER, 'zapier', []);

    await expect(handler.create(OWNER, 'zapier', [])).rejects.toBeInstanceOf(
      ServiceClientNameTaken,
    );
  });

  it('revokes a client and records it', async () => {
    await handler.create(OWNER, 'zapier', []);

    await handler.revoke(OWNER, 'zapier');

    expect(clients.byName.get('zapier')?.revokedAt).toBeInstanceOf(Date);
    expect(audit.entries.at(-1)).toMatchObject({ action: 'admin.revokeServiceClient' });
  });

  /** The point of revoking. Both adapters must agree on this. */
  it('refuses a revoked client\'s token afterwards', async () => {
    const created = await handler.create(OWNER, 'zapier', []);
    expect(await clients.verifyToken(hashToken(created.secret))).not.toBeNull();

    await handler.revoke(OWNER, 'zapier');

    expect(await clients.verifyToken(hashToken(created.secret))).toBeNull();
  });

  it('reports an unknown client as not found', async () => {
    await expect(handler.revoke(OWNER, 'nobody')).rejects.toBeInstanceOf(ServiceClientNotFound);
  });

  it('refuses to revoke the same client twice', async () => {
    await handler.create(OWNER, 'zapier', []);
    await handler.revoke(OWNER, 'zapier');

    await expect(handler.revoke(OWNER, 'zapier')).rejects.toBeInstanceOf(ServiceClientNotFound);
  });
});
