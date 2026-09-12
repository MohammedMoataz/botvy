import { Field, ID, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Roles, UsersOnly } from '../../../../shared/auth/decorators.js';
import { DateTimeScalar } from '../../../../graphql/scalars.js';
import { AdminServiceClientsHandler } from './admin-service-clients.handler.js';

/**
 * A machine caller: n8n today, anything the Owner registers later.
 *
 * No token and no hash. The secret is returned exactly once, by the REST
 * command that mints it, and never again — a read edge that could hand it back
 * would turn "list the clients" into "recover every credential", which is the
 * one thing a hash is stored for.
 *
 * `revokedAt` rather than a boolean, because *when* is what an operator wants
 * from this table.
 */
@ObjectType('ServiceClient')
export class ServiceClientType {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => [String])
  scopes!: string[];

  @Field(() => DateTimeScalar)
  createdAt!: Date;

  @Field(() => DateTimeScalar, { nullable: true })
  lastUsedAt!: Date | null;

  @Field(() => DateTimeScalar, { nullable: true })
  revokedAt!: Date | null;
}

/**
 * The registered machine callers, read.
 *
 * The last of P1's reads to reach this edge, and the reason it was last: the
 * other four had a query handler to wrap, and this one had only a command
 * handler with a `list` method on it. Wrapping that is honest — it reads
 * through Identity's own repository port — but if a second reader ever appears
 * it wants a `*.query.ts` slice of its own.
 */
@Resolver(() => ServiceClientType)
export class AdminServiceClientsResolver {
  constructor(private readonly clients: AdminServiceClientsHandler) {}

  @Query(() => [ServiceClientType], {
    description: 'Registered machine callers. Administrators only.',
  })
  @UsersOnly()
  @Roles('admin')
  async serviceClients(): Promise<ServiceClientType[]> {
    return this.clients.list();
  }
}
