import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import { SettingsStore, type StoredSetting } from '../../../shared/settings/settings.store.js';
import { AuditPort, type AuditEntry } from '../../../shared/audit/audit.port.js';
import { HeartbeatRepository, type Heartbeat } from '../domain/heartbeat.repository.js';

/**
 * The audit trail's only writer. Append-only by construction: the port has one
 * method and this adapter offers no other, so there is no update or delete for
 * a caller to reach for. A record that can be edited is not a record.
 */
@Injectable()
export class MongoAuditAdapter extends AuditPort {
  constructor(private readonly model: Model<Record<string, unknown>>) {
    super();
  }

  async record(entry: AuditEntry): Promise<void> {
    const session = MongoUnitOfWork.currentSession();
    await this.model.create(
      [
        {
          actor: entry.actor,
          action: entry.action,
          target: entry.target,
          at: entry.at,
          meta: entry.meta ?? null,
        },
      ],
      session ? { session } : {},
    );
  }
}

@Injectable()
export class MongoHeartbeatRepository extends HeartbeatRepository {
  constructor(private readonly model: Model<Record<string, unknown>>) {
    super();
  }

  async stamp(heartbeat: Heartbeat): Promise<void> {
    // lastOkAt is only ever advanced, never cleared by a failure: "when did
    // this last work" has to survive the run that did not.
    const set: Record<string, unknown> = {
      lastRunAt: heartbeat.lastRunAt,
      lastDurationMs: heartbeat.lastDurationMs,
      lastError: heartbeat.lastError,
    };
    if (heartbeat.lastOkAt) set.lastOkAt = heartbeat.lastOkAt;

    await this.model.updateOne({ _id: heartbeat.job }, { $set: set }, { upsert: true });
  }

  async listAll(): Promise<Heartbeat[]> {
    const rows = await this.model.find().lean<Array<Record<string, unknown>>>().exec();
    return rows.map((row) => ({
      job: String(row._id),
      lastRunAt: row.lastRunAt as Date,
      lastOkAt: (row.lastOkAt as Date | undefined) ?? null,
      lastDurationMs: (row.lastDurationMs as number | undefined) ?? null,
      lastError: (row.lastError as string | undefined) ?? null,
    }));
  }
}

@Injectable()
export class MongoSettingsStore extends SettingsStore {
  constructor(private readonly model: Model<Record<string, unknown>>) {
    super();
  }

  async get(key: string): Promise<StoredSetting | null> {
    const row = await this.model.findById(key).lean<Record<string, unknown>>().exec();
    return row ? toStoredSetting(row) : null;
  }

  async getMany(keys: string[]): Promise<StoredSetting[]> {
    const rows = await this.model
      .find({ _id: { $in: keys } })
      .lean<Array<Record<string, unknown>>>()
      .exec();
    return rows.map(toStoredSetting);
  }

  async set(key: string, value: unknown, updatedBy: string | null): Promise<StoredSetting> {
    const updatedAt = new Date();
    await this.model.updateOne(
      { _id: key },
      { $set: { value, updatedAt, updatedBy } },
      { upsert: true },
    );
    return { key, value, updatedAt, updatedBy };
  }
}

function toStoredSetting(row: Record<string, unknown>): StoredSetting {
  return {
    key: String(row._id),
    value: row.value,
    updatedAt: (row.updatedAt as Date | undefined) ?? new Date(0),
    updatedBy: (row.updatedBy as string | undefined) ?? null,
  };
}
