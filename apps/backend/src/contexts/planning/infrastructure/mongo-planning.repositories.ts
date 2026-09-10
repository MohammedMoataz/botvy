import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from '../../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import { Label, type LabelState } from '../domain/label.aggregate.js';
import { LabelRepository } from '../domain/label.repository.js';
import type { RecurrenceRule } from '../domain/recurrence.js';
import {
  Task,
  type LabelSnapshot,
  type TaskState,
} from '../domain/task.aggregate.js';
import { TaskRepository } from '../domain/task.repository.js';

export interface TaskDoc extends Omit<TaskState, 'id'> {
  _id: string;
  schemaVersion: number;
}

export interface LabelDoc extends Omit<LabelState, 'id'> {
  _id: string;
  /** Absent on a tombstone. See `Label.nameLower` for why that is the design. */
  nameLower?: string;
  schemaVersion: number;
}

/**
 * Document to aggregate and back.
 *
 * `toDomain` upcasts by `schemaVersion`, which is what lets a document written
 * by an older build still be read: migrations only go forward, and a row that
 * has not been rewritten yet is upcast on read rather than left unreadable. At
 * version 1 there is nothing to upcast, so the defaults below are doing that
 * job in advance — a field added in P5 gets its `?? default` here and every
 * existing row keeps working.
 */
const taskMapper: Mapper<Task, TaskDoc> = {
  toDomain(doc) {
    return Task.rehydrate({
      id: doc._id,
      userId: doc.userId,
      title: doc.title,
      notes: doc.notes ?? null,
      dueAt: doc.dueAt ?? null,
      allDay: doc.allDay ?? true,
      priority: doc.priority ?? 4,
      labelId: doc.labelId ?? null,
      label: doc.label ?? null,
      status: doc.status ?? 'open',
      completedAt: doc.completedAt ?? null,
      recurrence: normaliseRecurrence(doc.recurrence),
      estimatedMinutes: doc.estimatedMinutes ?? null,
      deferCount: doc.deferCount ?? 0,
      deferredFrom: doc.deferredFrom ?? null,
      source: doc.source ?? 'app',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      deletedAt: doc.deletedAt ?? null,
    });
  },
  toPersistence(task) {
    return {
      _id: task.id,
      userId: task.userId,
      title: task.title,
      notes: task.notes,
      dueAt: task.dueAt,
      allDay: task.allDay,
      priority: task.priority,
      labelId: task.labelId,
      label: task.label,
      status: task.status,
      completedAt: task.completedAt,
      recurrence: task.recurrence,
      estimatedMinutes: task.estimatedMinutes,
      deferCount: task.deferCount,
      deferredFrom: task.deferredFrom,
      source: task.source,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      deletedAt: task.deletedAt,
      schemaVersion: task.schemaVersion,
    };
  },
};

/**
 * Mongo hands back `exdates` as whatever the driver made of the array, and a
 * missing one as undefined. The aggregate's rules assume an array it can spread,
 * so the shape is settled here rather than defended at four call sites.
 */
function normaliseRecurrence(
  recurrence: RecurrenceRule | null | undefined,
): RecurrenceRule | null {
  if (!recurrence) return null;
  return { ...recurrence, exdates: recurrence.exdates ?? [] };
}

const labelMapper: Mapper<Label, LabelDoc> = {
  toDomain(doc) {
    return Label.rehydrate({
      id: doc._id,
      userId: doc.userId,
      name: doc.name,
      color: doc.color,
      sortOrder: doc.sortOrder ?? 0,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      deletedAt: doc.deletedAt ?? null,
    });
  },
  toPersistence(label) {
    const doc: LabelDoc = {
      _id: label.id,
      userId: label.userId,
      name: label.name,
      color: label.color,
      sortOrder: label.sortOrder,
      createdAt: label.createdAt,
      updatedAt: label.updatedAt,
      deletedAt: label.deletedAt,
      schemaVersion: label.schemaVersion,
    };
    // Present only when the label is live. The unique index is partial on this
    // field existing, so *omitting* it is what frees the name for reuse — and
    // writing `null` instead would make every tombstone collide with every
    // other one, because to Mongo a null is a value like any other.
    const nameLower = label.nameLower;
    if (nameLower !== undefined) doc.nameLower = nameLower;
    return doc;
  },
};

@Injectable()
export class MongoTaskRepository extends TaskRepository {
  readonly #inner: InnerTaskRepository;

  constructor(
    private readonly model: Model<TaskDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerTaskRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Task | null> {
    return this.#inner.findById(userId, id);
  }

  async save(task: Task): Promise<void> {
    await this.#inner.save(task);
  }

  async remove(task: Task): Promise<void> {
    await this.#inner.remove(task);
  }

  async findMany(userId: string, ids: string[]): Promise<Task[]> {
    if (ids.length === 0) return [];
    const docs = await this.model
      .find({ userId, _id: { $in: ids } })
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc[]>()
      .exec();
    return docs.map((doc) => taskMapper.toDomain(doc));
  }

  /**
   * Tombstones included, and that is the contract rather than an oversight: the
   * client's delete sweep runs only on a full snapshot, so on a *delta* the
   * only way a deletion reaches the phone is as a tombstone row in the pull.
   * Filter them out here and a task deleted on one device stays for ever on
   * every other one.
   */
  async pullSince(userId: string, since: Date | null): Promise<Task[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc[]>()
      .exec();
    return docs.map((doc) => taskMapper.toDomain(doc));
  }

  /**
   * One bulk write, because a member who renames a label they put on 400 tasks
   * should not cost 400 read-modify-write round trips — and because those 400
   * saves would each raise an event, waking the alert saga to re-plan an
   * identical set 400 times.
   *
   * It writes `label` and `updatedAt` and touches nothing else. `updatedAt`
   * *must* move: these rows have changed as far as the phone is concerned, and a
   * refresh that left the cursor alone would rename the label on the server and
   * nowhere else.
   */
  async refreshLabelSnapshots(
    userId: string,
    labelId: string,
    snapshot: LabelSnapshot | null,
    at: Date,
  ): Promise<number> {
    const result = await this.model
      .updateMany(
        { userId, labelId },
        snapshot
          ? { $set: { label: snapshot, updatedAt: at } }
          : { $set: { label: null, labelId: null, updatedAt: at } },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.modifiedCount;
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    const filter: Record<string, unknown> = {
      deletedAt: { $ne: null, $lt: before },
    };
    if (userId) filter.userId = userId;
    const result = await this.model
      .deleteMany(filter, {
        session: MongoUnitOfWork.currentSession() ?? undefined,
      })
      .exec();
    return result.deletedCount;
  }

  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model
      .deleteMany(
        { userId },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }
}

class InnerTaskRepository extends MongoRepositoryBase<Task, TaskDoc> {
  protected readonly mapper = taskMapper;

  constructor(
    protected readonly model: Model<TaskDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

@Injectable()
export class MongoLabelRepository extends LabelRepository {
  readonly #inner: InnerLabelRepository;

  constructor(
    private readonly model: Model<LabelDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerLabelRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Label | null> {
    return this.#inner.findById(userId, id);
  }

  async save(label: Label): Promise<void> {
    await this.#inner.save(label);
  }

  async remove(label: Label): Promise<void> {
    await this.#inner.remove(label);
  }

  /**
   * Matched on the stored lower-cased copy, which is the same field the unique
   * index is built over. Comparing on `name` with a case-insensitive collation
   * would answer the question correctly and disagree with the index in exactly
   * the cases that matter.
   */
  async findByName(userId: string, name: string): Promise<Label | null> {
    const doc = await this.model
      .findOne({ userId, nameLower: name.trim().toLowerCase() })
      .session(MongoUnitOfWork.currentSession())
      .lean<LabelDoc>()
      .exec();
    return doc ? labelMapper.toDomain(doc) : null;
  }

  async findAll(userId: string, includeDeleted = false): Promise<Label[]> {
    const filter: Record<string, unknown> = { userId };
    if (!includeDeleted) filter.deletedAt = null;
    const docs = await this.model
      .find(filter)
      .sort({ sortOrder: 1, name: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<LabelDoc[]>()
      .exec();
    return docs.map((doc) => labelMapper.toDomain(doc));
  }

  async pullSince(userId: string, since: Date | null): Promise<Label[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<LabelDoc[]>()
      .exec();
    return docs.map((doc) => labelMapper.toDomain(doc));
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    const filter: Record<string, unknown> = {
      deletedAt: { $ne: null, $lt: before },
    };
    if (userId) filter.userId = userId;
    const result = await this.model
      .deleteMany(filter, {
        session: MongoUnitOfWork.currentSession() ?? undefined,
      })
      .exec();
    return result.deletedCount;
  }

  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model
      .deleteMany(
        { userId },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }
}

class InnerLabelRepository extends MongoRepositoryBase<Label, LabelDoc> {
  protected readonly mapper = labelMapper;

  constructor(
    protected readonly model: Model<LabelDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}
