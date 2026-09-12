import type { Model } from 'mongoose';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from '../../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import {
  MealSuggestion,
  suggestionId,
  type ChosenMeal,
  type MealMode,
  type MealSuggestionState,
  type WithheldReason,
} from '../domain/meal-suggestion.aggregate.js';
import {
  Meal,
  type MealKind,
  type MealState,
} from '../domain/meal.aggregate.js';
import {
  MealRepository,
  MealSuggestionRepository,
} from '../domain/nutrition.repositories.js';

export interface MealDoc extends Omit<MealState, 'id'> {
  _id: string;
  schemaVersion: number;
}

export interface MealSuggestionDoc extends Omit<MealSuggestionState, 'id'> {
  _id: string;
  schemaVersion: number;
}

/**
 * Document to aggregate and back.
 *
 * The `?? []` and `?? null` defaults are the upcast: at `schemaVersion` 1 there
 * is nothing to translate, but a document written before a field existed comes
 * back without it, and both aggregates spread and `.map` these arrays without
 * asking. Settled here once rather than in each aggregate.
 */
const mealMapper: Mapper<Meal, MealDoc> = {
  toDomain(doc) {
    return Meal.rehydrate({
      id: doc._id,
      userId: doc.userId,
      name: doc.name,
      kind: (doc.kind ?? 'any') as MealKind,
      ingredients: doc.ingredients ?? [],
      tags: doc.tags ?? [],
      createdAt: asDate(doc.createdAt),
      updatedAt: asDate(doc.updatedAt),
      deletedAt: doc.deletedAt ? asDate(doc.deletedAt) : null,
    });
  },
  toPersistence(meal) {
    return {
      _id: meal.id,
      userId: meal.userId,
      name: meal.name,
      kind: meal.kind,
      ingredients: meal.ingredients,
      tags: meal.tags,
      createdAt: meal.createdAt,
      updatedAt: meal.updatedAt,
      deletedAt: meal.deletedAt,
      schemaVersion: meal.schemaVersion,
    };
  },
};

const suggestionMapper: Mapper<MealSuggestion, MealSuggestionDoc> = {
  toDomain(doc) {
    return MealSuggestion.rehydrate({
      id: doc._id,
      userId: doc.userId,
      date: doc.date,
      mode: (doc.mode ?? 'llm') as MealMode,
      meals: (doc.meals ?? []).map(normaliseChosen),
      line: doc.line ?? null,
      withheldReason: (doc.withheldReason ?? null) as WithheldReason | null,
      model: doc.model ?? null,
      causeEventId: doc.causeEventId ?? null,
      createdAt: asDate(doc.createdAt),
      updatedAt: asDate(doc.updatedAt),
    });
  },
  toPersistence(suggestion) {
    return {
      _id: suggestion.id,
      userId: suggestion.userId,
      date: suggestion.date,
      mode: suggestion.mode,
      meals: suggestion.meals,
      line: suggestion.line,
      withheldReason: suggestion.withheldReason,
      model: suggestion.model,
      causeEventId: suggestion.causeEventId,
      createdAt: suggestion.createdAt,
      updatedAt: suggestion.updatedAt,
      schemaVersion: suggestion.schemaVersion,
    };
  },
};

/**
 * A chosen meal as the document holds it.
 *
 * `mealId` defaults to null rather than to the row being dropped: a day written
 * in suggestion mode has no library row behind any of its meals, and that is
 * the ordinary case rather than a damaged one.
 */
function normaliseChosen(raw: Partial<ChosenMeal>): ChosenMeal {
  return {
    kind: (raw.kind ?? 'any') as MealKind,
    name: raw.name ?? '',
    mealId: raw.mealId ?? null,
  };
}

function asDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

class InnerMealRepository extends MongoRepositoryBase<Meal, MealDoc> {
  protected readonly mapper = mealMapper;

  constructor(
    protected readonly model: Model<MealDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

export class MongoMealRepository extends MealRepository {
  readonly #inner: InnerMealRepository;

  constructor(
    private readonly model: Model<MealDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerMealRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Meal | null> {
    return this.#inner.findById(userId, id);
  }

  async save(meal: Meal): Promise<void> {
    await this.#inner.save(meal);
  }

  async remove(meal: Meal): Promise<void> {
    await this.#inner.remove(meal);
  }

  /** Tombstones included — a delta that hid them would never delete anything. */
  async pullSince(userId: string, since: Date | null): Promise<Meal[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1, _id: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<MealDoc[]>()
      .exec();
    return docs.map((doc) => mealMapper.toDomain(doc));
  }

  /**
   * The live library, optionally of one kind.
   *
   * A `kind` filter has to admit `any` as well as the kind asked for, because
   * `any` is a real answer and not an absence — a member whose lunch and dinner
   * are the same four dishes entered each once. The aggregate's `fits` says the
   * same thing for a meal already in hand; this is the version the index can
   * run, and the two agree by construction because both treat `any` as
   * eligible everywhere.
   *
   * Ordered by name rather than by `updatedAt`: the rotator wants a *stable*
   * order, since its whole promise is that the same member on the same date
   * gets the same meals (FR-009). Ordering by recency would reshuffle the
   * library every time a member edited a meal, and the day's answer would move
   * with it.
   */
  async listFor(userId: string, kind?: MealKind): Promise<Meal[]> {
    const filter: Record<string, unknown> = { userId, deletedAt: null };
    if (kind && kind !== 'any') filter.kind = { $in: [kind, 'any'] };
    const docs = await this.model
      .find(filter)
      .sort({ name: 1, _id: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<MealDoc[]>()
      .exec();
    return docs.map((doc) => mealMapper.toDomain(doc));
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

class InnerSuggestionRepository extends MongoRepositoryBase<
  MealSuggestion,
  MealSuggestionDoc
> {
  protected readonly mapper = suggestionMapper;

  constructor(
    protected readonly model: Model<MealSuggestionDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

export class MongoMealSuggestionRepository extends MealSuggestionRepository {
  readonly #inner: InnerSuggestionRepository;

  constructor(
    private readonly model: Model<MealSuggestionDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerSuggestionRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<MealSuggestion | null> {
    return this.#inner.findById(userId, id);
  }

  async save(suggestion: MealSuggestion): Promise<void> {
    await this.#inner.save(suggestion);
  }

  async remove(suggestion: MealSuggestion): Promise<void> {
    await this.#inner.remove(suggestion);
  }

  /**
   * The day's row, composed through the key so no caller holds a copy of the
   * format. It goes through the base's `findById`, which filters on `_id` *and*
   * `userId` — a caller passing somebody else's date gets null rather than
   * somebody else's day.
   */
  async forDate(userId: string, date: string): Promise<MealSuggestion | null> {
    return this.#inner.findById(userId, suggestionId(userId, date));
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
