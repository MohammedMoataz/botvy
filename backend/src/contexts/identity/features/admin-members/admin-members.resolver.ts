import { Args, Field, Int, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Roles, UsersOnly } from '../../../../shared/auth/decorators.js';
import { Role, UserStatus, UserType } from '../me/me.resolver.js';
import { MembersQueryHandler } from './members.query.js';

/**
 * A page of members.
 *
 * Cursor rather than offset, and the cursor is the last id rather than a
 * position: a member banned while an administrator is on page three should not
 * shift every later row up by one, which is what an offset does and what makes
 * somebody get skipped entirely.
 */
@ObjectType('UserConnection')
export class UserConnectionType {
  @Field(() => [UserType])
  nodes!: UserType[];

  @Field(() => String, { nullable: true })
  endCursor!: string | null;

  @Field()
  hasNextPage!: boolean;
}

@Resolver(() => UserConnectionType)
export class AdminMembersResolver {
  constructor(private readonly members: MembersQueryHandler) {}

  @Query(() => UserConnectionType, {
    description: 'Every member. Administrators only.',
  })
  @UsersOnly()
  @Roles('admin')
  async users(
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('status', { type: () => UserStatus, nullable: true })
    status?: UserStatus,
    @Args('role', { type: () => Role, nullable: true }) role?: Role,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 50 })
    first?: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ): Promise<UserConnectionType> {
    // Clamped here rather than trusted from the argument. `first: 100000` is a
    // full table read dressed as a page, and the schema's default is a
    // suggestion to a well-behaved client, not a limit.
    const limit = Math.min(Math.max(first ?? 50, 1), 100);

    const page = await this.members.search({
      ...(search ? { query: search } : {}),
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
      limit,
      ...(after ? { cursor: after } : {}),
    });

    return {
      nodes: page.members as unknown as UserType[],
      endCursor: page.nextCursor,
      hasNextPage: page.nextCursor !== null,
    };
  }
}
