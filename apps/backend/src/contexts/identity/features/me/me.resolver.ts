import { NotFoundException } from '@nestjs/common';
import {
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
import { MeQueryHandler } from './me.query.js';

export enum Role {
  user = 'user',
  admin = 'admin',
}
registerEnumType(Role, { name: 'Role' });

export enum UserStatus {
  active = 'active',
  banned = 'banned',
}
registerEnumType(UserStatus, { name: 'UserStatus' });

/**
 * A member, as themselves or as an administrator sees them.
 *
 * One type for both, because it is one thing. The blueprint's schema has a
 * single `User` with `deviceCount` noted as admin-only; that note is about who
 * may run the *query*, which the guards decide, not about there being two
 * shapes of member.
 */
@ObjectType('User')
export class UserType {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field(() => String, { nullable: true })
  displayName!: string | null;

  @Field(() => Role)
  role!: Role;

  @Field(() => UserStatus)
  status!: UserStatus;

  @Field(() => DateTimeScalar)
  createdAt!: Date;

  @Field(() => DateTimeScalar, { nullable: true })
  lastLoginAt!: Date | null;

  @Field(() => Int)
  deviceCount!: number;
}

/**
 * `me`.
 *
 * `@UsersOnly()` and nothing else: authentication is global, and a service
 * principal asking who it is has no answer here — machine callers have no
 * profile, no devices and no member row. P0 marked this query done and shipped
 * no resolver at all, so every surface's first call had nothing to reach.
 */
@Resolver(() => UserType)
export class MeResolver {
  constructor(private readonly query: MeQueryHandler) {}

  @Query(() => UserType, { description: 'The authenticated member.' })
  @UsersOnly()
  async me(@CurrentPrincipal() principal: Principal): Promise<UserType> {
    const view = await this.query.forUser(principal.id);
    if (!view) throw new NotFoundException('no such account');
    return view as UserType;
  }
}
