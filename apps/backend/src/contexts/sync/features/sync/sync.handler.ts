import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { newId } from '../../../../shared/cqrs/ids.js';
import { EVENT_SCHEMA_VERSION } from '../../../../shared/cqrs/domain-event.js';
import { OutboxWriter } from '../../../../shared/outbox/outbox-writer.js';
import type {
  Rejection,
  SyncChange,
} from '../../../../shared/persistence/ports/sync-change.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import {
  DeviceTouchPort,
  PendingAlertsPort,
  SYNCABLE_ENTITIES,
  SYNCABLE_PATCHES,
  type SyncableEntity,
  type SyncablePatch,
} from '../../domain/syncable-entity.port.js';

/**
 * The lag between `now` and the cursor handed back to the client.
 *
 * A transaction that commits a moment after the pull's read would otherwise
 * fall between two cursors and never be seen at all. Lagging the cursor makes
 * such a row arrive *twice* instead of never, and a duplicate costs nothing
 * because every apply on the client is an upsert by id.
 *
 * Five seconds is `contracts/sync.md`'s number. It has to exceed the longest
 * plausible gap between a transaction starting and becoming visible, which on
 * a single-node replica set is milliseconds — the margin is for a slow write
 * under load, not for the ordinary case.
 */
export const CURSOR_LAG_MS = 5_000;

export interface SyncRequest {
  installId: string;
  since: Date | null;
  entities: string[];
  push?: Record<string, unknown>;
}

export interface SyncResponse {
  now: Date;
  full: boolean;
  pull: Record<string, unknown>;
  accepted: Record<string, string[]>;
  rejections: Rejection[];
  pendingAlerts: unknown[];
}

/**
 * One round trip: the client's outbox up, everything that changed down.
 *
 * ## The shape of it
 *
 * The processing order is `contracts/sync.md`'s, and each step exists because
 * of a specific way the obvious version goes wrong:
 *
 * 1. **Apply pushes, parents before children.** A task carries a snapshot of
 *    its label, so applying tasks first would let one name a label the same
 *    request is about to create.
 * 2. **Compute the cursor as `now − 5s`.** See `CURSOR_LAG_MS`.
 * 3. **Decide `full`.** `since` is null, or older than the tombstone horizon.
 * 4. **Pull per entity**, tombstones included.
 * 5. **Touch the device** — through Identity, not by writing its row.
 * 6. **Nudge the member's other sockets**, but only if a push was accepted.
 *
 * ## `full` is not an optimisation
 *
 * A phone offline for longer than `reminders.tombstoneDays` has missed
 * deletions whose tombstones the sweep has since purged. A delta cannot tell
 * it about them — there is nothing left to send — so it must be given a
 * complete snapshot and told to run its delete sweep against it. Serving a
 * delta to such a device leaves rows on it that were deleted weeks ago and
 * nothing will ever remove them.
 *
 * That is also why the *same* settings key drives this rule and the sweep's
 * purge. Two keys would let the horizon a phone is judged against drift from
 * the horizon the tombstones are actually kept for, and the gap between them
 * would be exactly the window in which this goes wrong silently.
 */
@Injectable()
export class SyncHandler {
  private readonly logger = new Logger(SyncHandler.name);

  constructor(
    @Inject(SYNCABLE_ENTITIES) private readonly entities: SyncableEntity[],
    @Inject(SYNCABLE_PATCHES) private readonly patches: SyncablePatch[],
    private readonly devices: DeviceTouchPort,
    private readonly alerts: PendingAlertsPort,
    private readonly settings: SettingsService,
    private readonly outbox: OutboxWriter,
  ) {}

  async handle(userId: string, request: SyncRequest): Promise<SyncResponse> {
    const now = new Date();
    const horizonDays = await this.settings.get('reminders.tombstoneDays');

    const full =
      request.since === null ||
      request.since.getTime() < now.getTime() - horizonDays * 86_400_000;

    const wanted = new Set(request.entities);
    const accepted: Record<string, string[]> = {};
    const rejections: Rejection[] = [];

    // ------------------------------------------------------- 1. apply pushes
    const push = request.push ?? {};

    for (const adapter of [...this.entities].sort(
      (a, b) => a.applyOrder - b.applyOrder,
    )) {
      if (!wanted.has(adapter.entity)) continue;
      const rows = push[adapter.entity];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const acceptedIds: string[] = [];
      for (const raw of rows) {
        const change = toChange(raw);
        if (!change) {
          // A row the protocol cannot read. `invalid` rather than a 400 for the
          // whole request: one malformed row must not stop the other forty
          // being applied, and the client needs to know *which* one.
          rejections.push({
            entity: adapter.entity,
            id: String((raw as { id?: unknown })?.id ?? 'unknown'),
            reason: 'invalid',
          });
          continue;
        }

        try {
          const outcome = await adapter.apply(userId, change, now);
          if (outcome.applied) acceptedIds.push(outcome.id);
          else rejections.push(outcome.rejection);
        } catch (error) {
          // A domain rule refused it — an empty title, a moment in the past.
          // Retrying unchanged will fail again, so the client surfaces it to
          // the member rather than queueing it for ever.
          rejections.push({
            entity: adapter.entity,
            id: change.id,
            reason: 'invalid',
            server: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
      if (acceptedIds.length > 0) accepted[adapter.entity] = acceptedIds;
    }

    for (const adapter of [...this.patches].sort(
      (a, b) => a.applyOrder - b.applyOrder,
    )) {
      if (!wanted.has(adapter.entity)) continue;
      const patch = (
        push[adapter.entity] as { patch?: Record<string, unknown> } | undefined
      )?.patch;
      if (!patch) continue;

      try {
        const outcome = await adapter.applyPatch(userId, patch, now);
        if (outcome.applied) accepted[adapter.entity] = [outcome.id];
        else rejections.push(outcome.rejection);
      } catch (error) {
        rejections.push({
          entity: adapter.entity,
          id: userId,
          reason: 'invalid',
          server: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    // -------------------------------------------------------- 2. the cursor
    const cursor = new Date(now.getTime() - CURSOR_LAG_MS);
    const since = full ? null : request.since;

    // ----------------------------------------------------------- 3. the pull
    const pull: Record<string, unknown> = {};
    for (const adapter of this.entities) {
      if (!wanted.has(adapter.entity)) continue;
      pull[adapter.entity] = await adapter.pull(userId, since);
    }
    for (const adapter of this.patches) {
      if (!wanted.has(adapter.entity)) continue;
      // A patch entity is one object and is always sent whole. There is no
      // useful delta of a single row, and a client that had missed the one
      // change would have no way to ask for it again.
      pull[adapter.entity] = await adapter.pull(userId);
    }

    // ------------------------------------------------ 4. touch, and nudge
    //
    // The device is touched *after* the pull, and that ordering is the sweep's
    // correctness rather than a detail. `lastSeenAt` is the claim "this device
    // holds every alarm planned before now"; stamping it before the pull would
    // make the claim true a moment early, and a crash in between would leave a
    // device the sweep skips holding nothing.
    const deviceId = await this.devices.touch(request.installId, now);
    if (!deviceId) {
      this.logger.warn(
        `sync from an unknown install ${request.installId}: the round trip served, ` +
          'but no device row was touched, so the sweep will keep pushing to it',
      );
    }

    const pendingAlerts = await this.alerts.forMember(userId, now);

    if (Object.keys(accepted).length > 0) {
      // Through the outbox, in no transaction of its own — the writes above
      // each committed in theirs. This event is what nudges the member's
      // *other* sockets, and losing it costs a delay rather than data, which is
      // why it does not need to be transactional with anything.
      await this.outbox.write([
        this.changesApplied(userId, request.installId, accepted, now),
      ]);
    }

    return { now: cursor, full, pull, accepted, rejections, pendingAlerts };
  }

  private changesApplied(
    userId: string,
    installId: string,
    accepted: Record<string, string[]>,
    at: Date,
  ): DomainEvent {
    return {
      eventId: newId(),
      name: 'sync.ChangesApplied',
      context: 'sync',
      aggregate: { type: 'sync', id: installId },
      userId,
      occurredAt: at,
      payload: { installId, entities: Object.keys(accepted) },
      schemaVersion: EVENT_SCHEMA_VERSION,
    };
  }
}

/**
 * A pushed row from the wire into a `SyncChange`, or null if it is not one.
 *
 * Strict about the two timestamps, because they are the whole conflict rule and
 * they are easy to conflate: `updatedAt` is when *this device* last edited the
 * row, `baseUpdatedAt` is the server's own value for the version this device
 * last pulled. A client that sent its local time in `baseUpdatedAt` would turn
 * every offline edit into a clock comparison, which a slow handset loses.
 *
 * `baseUpdatedAt` is allowed to be null — that is a create — but it is never
 * *inferred* from `updatedAt`. Filling it in here would silently manufacture
 * the fast path for a client that had not earned it.
 */
function toChange(raw: unknown): SyncChange | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const id = row.id;
  const op = row.op;
  if (typeof id !== 'string' || id === '') return null;
  if (
    op !== 'create' &&
    op !== 'update' &&
    op !== 'delete' &&
    op !== 'restore' &&
    op !== 'purge'
  ) {
    return null;
  }

  const updatedAt = asDate(row.updatedAt);
  if (!updatedAt) return null;

  const baseUpdatedAt =
    row.baseUpdatedAt === null || row.baseUpdatedAt === undefined
      ? null
      : asDate(row.baseUpdatedAt);
  // Present but unreadable is a refusal, not a null: treating a garbled base as
  // "this is a create" would hand the client the no-conflict fast path.
  if (
    row.baseUpdatedAt !== null &&
    row.baseUpdatedAt !== undefined &&
    !baseUpdatedAt
  )
    return null;

  return {
    id,
    op,
    updatedAt,
    baseUpdatedAt,
    fields: (row.data as Record<string, unknown>) ?? {},
  };
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
