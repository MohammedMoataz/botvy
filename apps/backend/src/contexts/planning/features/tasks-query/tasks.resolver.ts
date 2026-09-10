import {
  Args,
  Field,
  ID,
  Int,
  ObjectType,
  Query,
  Resolver,
  registerEnumType,
} from '@nestjs/graphql';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { DateTimeScalar } from '../../../../graphql/scalars.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import type { TaskListView } from '../../domain/task-read.repository.js';
import { TasksQueryHandler } from './tasks.query.js';

/**
 * The six lists, as an enum rather than a string.
 *
 * GraphQL refusing `view: "todya"` at the edge is worth more than the type
 * safety: each view is a different query with a different index behind it, and
 * a typo that fell through to a default would quietly serve the wrong list.
 */
export enum TaskViewName {
  today = 'today',
  upcoming = 'upcoming',
  overdue = 'overdue',
  label = 'label',
  completed = 'completed',
  deleted = 'deleted',
}

registerEnumType(TaskViewName, {
  name: 'TaskViewName',
  description: 'The six task lists, named as the member sees them.',
});

@ObjectType('LabelSnapshot')
export class LabelSnapshotType {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  color!: string;
}

/**
 * A task, as a screen reads it.
 *
 * Note what is here that the *sync pull* does not send, and the reverse: this
 * carries `recurrenceText` — "every 2 weeks on Tuesday", rendered server-side
 * so three surfaces need not each carry an RRULE parser — and does not carry
 * the rule itself. The pull sends the rule, because a client holding a local
 * copy has to advance a repeating series offline and plan its own alarms, and
 * neither is possible from a sentence.
 *
 * Two readers, two shapes, on purpose. Conflating them is what left the SDK's
 * row type declaring three fields that were never populated.
 */
@ObjectType('Task')
export class TaskType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => DateTimeScalar, { nullable: true })
  dueAt!: Date | null;

  @Field(() => Boolean)
  allDay!: boolean;

  @Field(() => Int)
  priority!: number;

  @Field(() => ID, { nullable: true })
  labelId!: string | null;

  @Field(() => LabelSnapshotType, { nullable: true })
  label!: { name: string; color: string } | null;

  @Field(() => String)
  status!: string;

  @Field(() => DateTimeScalar, { nullable: true })
  completedAt!: Date | null;

  @Field(() => Boolean)
  repeats!: boolean;

  @Field(() => String, { nullable: true })
  recurrenceMode!: string | null;

  @Field(() => String, { nullable: true })
  recurrenceText!: string | null;

  @Field(() => Int, { nullable: true })
  estimatedMinutes!: number | null;

  /** How many times this has been carried over. The evening prompt says so. */
  @Field(() => Int)
  deferCount!: number;

  @Field(() => String)
  source!: string;

  @Field(() => DateTimeScalar)
  updatedAt!: Date;

  @Field(() => DateTimeScalar, { nullable: true })
  deletedAt!: Date | null;
}

@ObjectType('TaskPage')
export class TaskPageType {
  @Field(() => [TaskType])
  nodes!: TaskType[];

  /**
   * Opaque. It encodes a position in the view's own sort order, and the only
   * correct thing a client can do with it is hand it back — reading a timestamp
   * out of it and doing arithmetic is what the keyset cursor exists to stop.
   */
  @Field(() => String, { nullable: true })
  nextCursor!: string | null;
}

@ObjectType('Label')
export class LabelType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  color!: string;

  @Field(() => Int)
  sortOrder!: number;

  /** Open tasks under this label. What the list shows beside the name. */
  @Field(() => Int)
  openTaskCount!: number;

  @Field(() => DateTimeScalar)
  updatedAt!: Date;

  @Field(() => DateTimeScalar, { nullable: true })
  deletedAt!: Date | null;
}

/**
 * Planning's read surface.
 *
 * Principle X: commands are REST and reads are GraphQL, and until this file
 * existed P2 had only half of that — the query handlers were written and
 * provided and nothing could call them, so the six views the member's screens
 * are built from were unreachable over the transport the constitution
 * designates for reads. The handlers had specs, which is exactly why the gap
 * was invisible.
 *
 * Every resolver takes the member from the principal and never from an
 * argument. A `userId` parameter here would be a way to read somebody else's
 * tasks that no amount of scoping inside the handler could close.
 */
@Resolver()
@UsersOnly()
export class TasksResolver {
  constructor(
    private readonly tasks: TasksQueryHandler,
    private readonly settings: SettingsService,
  ) {}

  @Query(() => TaskPageType, { name: 'tasks' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Args('view', { type: () => TaskViewName }) view: TaskViewName,
    @Args('labelId', { type: () => ID, nullable: true }) labelId?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('cursor', { type: () => String, nullable: true }) cursor?: string,
  ): Promise<TaskPageType> {
    const page = await this.tasks.page(principal.id, {
      view: view as TaskListView,
      labelId,
      limit: limit ?? undefined,
      cursor: cursor ?? undefined,
    });
    return page as unknown as TaskPageType;
  }

  @Query(() => TaskType, { name: 'task', nullable: true })
  async byId(
    @CurrentPrincipal() principal: Principal,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<TaskType | null> {
    const task = await this.tasks.byId(principal.id, id);
    return (task as unknown as TaskType) ?? null;
  }

  @Query(() => [LabelType], { name: 'labels' })
  async labels(
    @CurrentPrincipal() principal: Principal,
    @Args('includeDeleted', { type: () => Boolean, nullable: true })
    includeDeleted?: boolean,
  ): Promise<LabelType[]> {
    const labels = await this.tasks.labels(
      principal.id,
      includeDeleted ?? false,
    );
    return labels as unknown as LabelType[];
  }

  /**
   * The colours the label picker offers.
   *
   * A member-readable projection of `labels.palette`, which is an *operator*
   * setting — so this is deliberately one field and not a door into the
   * registry: the admin `settings` query stays admin-only, and a member can
   * read this one key because their own picker is built from it.
   *
   * It exists because the phone had no way to reach it. The mobile track found
   * that while building the picker, and its only alternatives were to
   * hard-code the list — which constitution XII calls a bug outright — or to
   * offer no palette at all. Neither is the operator's setting being honoured.
   */
  @Query(() => [String], { name: 'labelPalette' })
  async palette(): Promise<string[]> {
    return this.settings.get('labels.palette');
  }
}
