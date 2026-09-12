import {
  Args,
  Field,
  ID,
  Int,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { Roles, UsersOnly } from '../../../../shared/auth/decorators.js';
import { DateScalar, DateTimeScalar, JSONScalar } from '../../../../graphql/scalars.js';
import { UsageQueryHandler } from '../usage/usage.query.js';
import { AuditQueryHandler } from './audit.query.js';

/**
 * One recorded act (FR-005).
 *
 * `meta` is `JSON` because what is worth recording differs per act — the role a
 * member was moved to, the reason a link was cleared, the key a setting
 * changed. A typed union of every act's payload would be a schema change on
 * every new administrative command, and the audit row would be the thing
 * stopping somebody from adding one.
 */
@ObjectType('AuditEntry')
export class AuditEntryType {
  @Field(() => ID)
  id!: string;

  @Field(() => DateTimeScalar)
  at!: Date;

  /** `user`, `admin` or `service`. */
  @Field(() => String)
  actorType!: string;

  @Field(() => ID)
  actorId!: string;

  /**
   * Who that was, in words — resolved when the page is drawn, never stored.
   *
   * A deleted member's acts stay in the trail, so this falls back to the id
   * rather than to an empty string: a row that named nobody would be a row the
   * Owner cannot act on.
   */
  @Field(() => String)
  actorLabel!: string;

  @Field(() => String)
  action!: string;

  @Field(() => String)
  targetType!: string;

  @Field(() => ID, { nullable: true })
  targetId!: string | null;

  @Field(() => JSONScalar, { nullable: true })
  meta!: Record<string, unknown> | null;
}

@ObjectType('AuditConnection')
export class AuditConnectionType {
  @Field(() => [AuditEntryType])
  nodes!: AuditEntryType[];

  /**
   * Where to continue from, or null at the end.
   *
   * A cursor and not a page number: rows arrive while the Owner is reading, and
   * an offset over a collection that is being appended to shows one row twice
   * and hides another — which for an audit trail is the failure that matters.
   */
  @Field(() => String, { nullable: true })
  endCursor!: string | null;

  @Field(() => Boolean)
  hasNextPage!: boolean;
}

/** One group of model calls: a day, a kind, a model, and maybe a member. */
@ObjectType('UsageRow')
export class UsageRowType {
  /** `YYYY-MM-DD`, **UTC** — the operator's day across every member. */
  @Field(() => DateScalar)
  day!: string;

  @Field(() => String)
  kind!: string;

  @Field(() => String)
  model!: string;

  @Field(() => Int)
  promptTokens!: number;

  @Field(() => Int)
  completionTokens!: number;

  @Field(() => Int)
  calls!: number;

  /** Non-null only when the query grouped by member. */
  @Field(() => ID, { nullable: true })
  userId!: string | null;
}

/**
 * The two reads P10 adds for the Owner.
 *
 * Both are `@Roles('admin')` on the method rather than on the class, matching
 * every other admin read in this codebase — and both are reads, so they are
 * here rather than on a controller (constitution X).
 */
@Resolver()
@UsersOnly()
export class OperationsAdminResolver {
  constructor(
    private readonly audit: AuditQueryHandler,
    private readonly usage: UsageQueryHandler,
  ) {}

  @Query(() => AuditConnectionType, {
    name: 'audit',
    description: 'Who did what, and when. Administrators only.',
  })
  @Roles('admin')
  async trail(
    @Args('actor', { type: () => ID, nullable: true }) actor?: string,
    @Args('action', { type: () => String, nullable: true }) action?: string,
    @Args('targetType', { type: () => String, nullable: true })
    targetType?: string,
    @Args('from', { type: () => DateTimeScalar, nullable: true }) from?: Date,
    @Args('to', { type: () => DateTimeScalar, nullable: true }) to?: Date,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 50 })
    first?: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ): Promise<AuditConnectionType> {
    return (await this.audit.list({
      actor: actor ?? null,
      action: action ?? null,
      targetType: targetType ?? null,
      from: from ?? null,
      to: to ?? null,
      first: first ?? 50,
      after: after ?? null,
    })) as unknown as AuditConnectionType;
  }

  @Query(() => [UsageRowType], {
    name: 'usage',
    description:
      'Model use by day, kind and model — and by member when asked. Administrators only.',
  })
  @Roles('admin')
  async modelUsage(
    @Args('from', { type: () => DateScalar }) from: string,
    @Args('to', { type: () => DateScalar }) to: string,
    @Args('userId', { type: () => ID, nullable: true }) userId?: string,
    @Args('byMember', {
      type: () => Boolean,
      nullable: true,
      defaultValue: false,
    })
    byMember?: boolean,
  ): Promise<UsageRowType[]> {
    return (await this.usage.between({
      from,
      to,
      userId: userId ?? null,
      byMember: byMember ?? false,
    })) as unknown as UsageRowType[];
  }
}
