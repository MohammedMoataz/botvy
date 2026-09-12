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
import type { ReminderListView } from '../../domain/reminder.repository.js';
import { RemindersQueryHandler } from './reminders.query.js';

export enum ReminderViewName {
  upcoming = 'upcoming',
  overdue = 'overdue',
  done = 'done',
  deleted = 'deleted',
}

registerEnumType(ReminderViewName, {
  name: 'ReminderViewName',
  description: 'The four reminder lists. `done` carries cancelled ones too.',
});

/**
 * A reminder, as a screen reads it.
 *
 * Both moments are here, and both are needed. `remindAt` is what the member
 * originally asked for and is the truth about their intention; `effectiveAt`
 * is when they will actually be told, which is the snooze when there is one.
 * A list that showed only the first would tell a member 09:00 about a reminder
 * they had pushed to 09:40 themselves.
 */
@ObjectType('Reminder')
export class ReminderType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  title!: string;

  @Field(() => DateTimeScalar)
  remindAt!: Date;

  @Field(() => DateTimeScalar)
  effectiveAt!: Date;

  @Field(() => [String])
  leadTimes!: string[];

  @Field(() => String)
  status!: string;

  @Field(() => DateTimeScalar, { nullable: true })
  snoozedUntil!: Date | null;

  @Field(() => String)
  source!: string;

  @Field(() => DateTimeScalar)
  updatedAt!: Date;

  @Field(() => DateTimeScalar, { nullable: true })
  deletedAt!: Date | null;
}

@ObjectType('ReminderPage')
export class ReminderPageType {
  @Field(() => [ReminderType])
  nodes!: ReminderType[];

  @Field(() => String, { nullable: true })
  nextCursor!: string | null;
}

/**
 * Reminders' read surface — the other half of principle X for this context.
 *
 * Like Planning's, this did not exist while the query handler did, so the four
 * lists were unreachable over the transport reads are supposed to use. The
 * handler's spec passed throughout.
 */
@Resolver()
@UsersOnly()
export class RemindersResolver {
  constructor(private readonly reminders: RemindersQueryHandler) {}

  @Query(() => ReminderPageType, { name: 'reminders' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Args('view', { type: () => ReminderViewName }) view: ReminderViewName,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('cursor', { type: () => String, nullable: true }) cursor?: string,
  ): Promise<ReminderPageType> {
    const page = await this.reminders.page(principal.id, {
      view: view as ReminderListView,
      limit: limit ?? undefined,
      cursor: cursor ?? undefined,
    });
    return page as unknown as ReminderPageType;
  }

  @Query(() => ReminderType, { name: 'reminder', nullable: true })
  async byId(
    @CurrentPrincipal() principal: Principal,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ReminderType | null> {
    const reminder = await this.reminders.byId(principal.id, id);
    return (reminder as unknown as ReminderType) ?? null;
  }
}
