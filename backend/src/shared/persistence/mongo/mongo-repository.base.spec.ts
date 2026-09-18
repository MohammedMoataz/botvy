import { describe, expect, it } from 'vitest';
import type { Model } from 'mongoose';
import { AggregateRoot } from '../ports/aggregate-root.js';
import { StaleWriteError } from '../ports/errors.js';
import { versioned, type Mapper } from '../ports/mapper.js';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from './mongo-repository.base.js';

/**
 * The filter, asserted directly.
 *
 * `adapters.contract.spec.ts` runs the shared contract against the in-memory
 * adapter only — the store-backed halves are `todo` — so nothing else in the
 * suite ever sees the query this class actually builds. That is the same blind
 * spot that let `AlertSchema` and `MessageSchema` ship without `updatedAt`, and
 * E-006 lives entirely inside that query: the difference between
 * `updatedAt: { $lte: … }` and `version: 3` is invisible to every handler spec.
 *
 * So this binds a stub `Model` that records what it was asked, and asserts the
 * two clauses `optimisticClause` can produce plus the version the save writes.
 */

interface WidgetDoc {
  _id: string;
  userId: string;
  label: string;
  updatedAt: Date;
  version?: number;
}

class Widget extends AggregateRoot<string> {
  constructor(
    readonly id: string,
    readonly userId: string,
    public label: string,
  ) {
    super();
  }
}

const widgetMapper: Mapper<Widget, WidgetDoc> = versioned({
  toDomain(doc) {
    const widget = new Widget(doc._id, doc.userId, doc.label);
    widget.updatedAt = doc.updatedAt;
    return widget;
  },
  toPersistence(widget) {
    return {
      _id: widget.id,
      userId: widget.userId,
      label: widget.label,
      updatedAt: widget.updatedAt,
    };
  },
});

/** Records every call and answers with whatever the test queued. */
class StubModel {
  readonly filters: Array<Record<string, unknown>> = [];
  readonly updates: Array<Record<string, unknown>> = [];
  matched = 1;
  upserted = 0;

  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
    this.filters.push(filter);
    this.updates.push(update);
    return {
      exec: async () => ({
        matchedCount: this.matched,
        upsertedCount: this.upserted,
      }),
    };
  }
}

class StubOutbox {
  readonly rows: unknown[] = [];
  async insertMany(rows: unknown[]): Promise<void> {
    this.rows.push(...rows);
  }
}

class WidgetRepository extends MongoRepositoryBase<Widget, WidgetDoc> {
  protected readonly mapper = widgetMapper;
  constructor(
    protected readonly model: Model<WidgetDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

function makeRepository(): { repository: WidgetRepository; model: StubModel } {
  const model = new StubModel();
  const repository = new WidgetRepository(
    model as unknown as Model<WidgetDoc>,
    new StubOutbox() as unknown as Model<OutboxInsert>,
  );
  return { repository, model };
}

const at = new Date('2026-02-03T10:00:00.000Z');

function storedDoc(version: number | undefined): WidgetDoc {
  return {
    _id: 'w-1',
    userId: 'user-1',
    label: 'stored',
    updatedAt: at,
    ...(version === undefined ? {} : { version }),
  };
}

describe('the Mongo optimistic filter', () => {
  it('matches the version the copy was loaded at, and writes the next one', async () => {
    const { repository, model } = makeRepository();
    const loaded = widgetMapper.toDomain(storedDoc(4));
    expect(loaded.version).toBe(4);

    await repository.save(loaded);

    expect(model.filters[0]).toEqual({
      _id: 'w-1',
      userId: 'user-1',
      version: 4,
    });
    expect((model.updates[0]!.$set as WidgetDoc).version).toBe(5);
    // And the copy in hand now knows, so a second save in the same unit of work
    // is not refused for a write it made itself.
    expect(loaded.version).toBe(5);
  });

  it('falls back to updatedAt for a row written before the column existed', async () => {
    const { repository, model } = makeRepository();
    const loaded = widgetMapper.toDomain(storedDoc(undefined));
    // No `version` in the document means no loaded version, which is the one
    // signal both adapters read as "judge this the way it is judged today".
    expect(loaded.version).toBeNull();

    await repository.save(loaded);

    expect(model.filters[0]).toEqual({
      _id: 'w-1',
      userId: 'user-1',
      $or: [{ updatedAt: { $lte: at } }, { updatedAt: { $exists: false } }],
    });
    // It saves — that is the whole of "no migration" — and the row it writes
    // carries a version, so the fallback closes itself on the first write.
    expect((model.updates[0]!.$set as WidgetDoc).version).toBe(1);
  });

  it('keeps userId in the filter in both cases', async () => {
    // A filter of `{ _id, version }` alone reintroduces the foreign-row hole
    // that was live from P2 to P4: `$set` would write this member's fields over
    // somebody else's row. The ownership half is not negotiable for either
    // clause.
    const { repository, model } = makeRepository();
    await repository.save(widgetMapper.toDomain(storedDoc(4)));
    await repository.save(widgetMapper.toDomain(storedDoc(undefined)));

    for (const filter of model.filters) {
      expect(filter.userId).toBe('user-1');
      expect(filter._id).toBe('w-1');
    }
  });

  it('still reports a missed filter as a stale write', async () => {
    const { repository, model } = makeRepository();
    model.matched = 0;
    model.upserted = 0;

    await expect(
      repository.save(widgetMapper.toDomain(storedDoc(4))),
    ).rejects.toBeInstanceOf(StaleWriteError);
  });

  it('a fresh aggregate creates: no loaded version, version 1 written', async () => {
    const { repository, model } = makeRepository();
    const fresh = new Widget('w-2', 'user-1', 'new');
    expect(fresh.version).toBeNull();
    model.matched = 0;
    model.upserted = 1;

    await repository.save(fresh);

    expect(model.filters[0]).toMatchObject({ _id: 'w-2', userId: 'user-1' });
    expect((model.updates[0]!.$set as WidgetDoc).version).toBe(1);
  });
});
