import { Module } from '@nestjs/common';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule as NestGraphQLModule } from '@nestjs/graphql';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { IdentityModule } from '../contexts/identity/identity.module.js';
import { MeResolver } from '../contexts/identity/features/me/me.resolver.js';
import { MyDevicesResolver } from '../contexts/identity/features/devices/devices.resolver.js';
import { AdminMembersResolver } from '../contexts/identity/features/admin-members/admin-members.resolver.js';
import { AdminServiceClientsResolver } from '../contexts/identity/features/admin-service-clients/admin-service-clients.resolver.js';
import { OperationsModule } from '../contexts/operations/operations.module.js';
import { AdminSettingsResolver } from '../contexts/operations/features/patch-setting/settings.resolver.js';
import { ProfileModule } from '../contexts/profile/profile.module.js';
import { ProfileResolver } from '../contexts/profile/features/profile-query/profile.resolver.js';
import { PlanningModule } from '../contexts/planning/planning.module.js';
import { TasksResolver } from '../contexts/planning/features/tasks-query/tasks.resolver.js';
import { RemindersModule } from '../contexts/reminders/reminders.module.js';
import { RemindersResolver } from '../contexts/reminders/features/reminders-query/reminders.resolver.js';
import { RhythmModule } from '../contexts/rhythm/rhythm.module.js';
import { RhythmResolver } from '../contexts/rhythm/features/today-plan/rhythm.resolver.js';
import { ConversationsModule } from '../contexts/conversations/conversations.module.js';
import { ConversationsResolver } from '../contexts/conversations/features/conversations/conversations.resolver.js';
import { MeetingsModule } from '../contexts/meetings/meetings.module.js';
import { CalendarResolver } from '../contexts/meetings/features/agenda/calendar.resolver.js';
import { TrainingModule } from '../contexts/training/training.module.js';
import { TrainingResolver } from '../contexts/training/features/sessions/training.resolver.js';
import { KnowledgeModule } from '../contexts/knowledge/knowledge.module.js';
import { KnowledgeResolver } from '../contexts/knowledge/features/links/knowledge.resolver.js';

/**
 * The read edge.
 *
 * Constitution X splits the surfaces by what they do rather than by what is
 * convenient: commands are REST, because a command is a request to change
 * something and an HTTP verb says so; reads are GraphQL, because every client
 * wants a different subset of the same graph and four REST endpoints per screen
 * is how v1 ended up with the domain written three times.
 *
 * Code-first, so the schema is generated from the same classes the resolvers
 * return. A hand-written SDL beside hand-written resolvers is two places for one
 * shape, and the one that drifts is the one nobody is testing.
 *
 * Every resolver here is a thin adapter over the query handler the REST read
 * already uses. That is deliberate: two transports over one handler is CQRS
 * with two edges, where two handlers answering the same question would be the
 * duplication this whole rewrite exists to remove.
 */
@Module({
  imports: [
    NestGraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,

      // In memory, never a file. Generation mode reads the built schema off
      // `GraphQLSchemaHost` and hands it to `writeContracts`, which is the only
      // thing that publishes it - the driver writes its file as a side effect of
      // serving, and generation mode never listens, so a path here produced no
      // file at all and no error either.
      autoSchemaFile: true,
      sortSchema: true,

      // No playground and no introspection in production. The shape of every
      // query is not something to publish from a tunnelled host, and the admin
      // portal is public.
      playground: false,
      introspection: process.env.NODE_ENV !== 'production',

      // The guards read the principal off `context.req`; `principalFrom` and
      // `CurrentPrincipal` both look there. Apollo's default context already
      // carries it, and this makes that dependency explicit rather than
      // inherited from a driver default that could change under us.
      context: ({ req }: { req: unknown }) => ({ req }),

      formatError,
    }),
  ],
})
export class GraphQLEdgeModule {}

/**
 * Turns an error into something a client can branch on.
 *
 * A GraphQL error's `message` is for a person; the code is for the client, and
 * the surfaces already branch on the REST equivalents (`token_expired` sends the
 * SDK to refresh rather than to a sign-in screen). Losing that on this transport
 * would mean an expired token signs the member out on a query and refreshes on a
 * command, which is the sort of difference nobody debugs twice.
 */
export function formatError(
  formatted: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  const original =
    error instanceof GraphQLError ? error.originalError : undefined;
  const status = (original as { status?: number } | undefined)?.status;
  const response = (original as { response?: unknown } | undefined)?.response;
  const message =
    typeof response === 'object' && response !== null && 'message' in response
      ? String((response as { message: unknown }).message)
      : original?.message;

  if (status === 401) {
    return {
      ...formatted,
      message: message ?? 'unauthorized',
      extensions: {
        ...formatted.extensions,
        code: message === 'token_expired' ? 'token_expired' : 'unauthorized',
      },
    };
  }
  if (status === 403) {
    return {
      ...formatted,
      extensions: { ...formatted.extensions, code: 'forbidden' },
    };
  }
  if (status === 404) {
    return {
      ...formatted,
      extensions: { ...formatted.extensions, code: 'not_found' },
    };
  }

  // An unrecognised error keeps its own extensions rather than being relabelled
  // `internal`: Apollo already reports a thrown error that way, and overwriting
  // a validation code with `internal` is how a fixable client bug becomes an
  // unexplained 500 in a log nobody reads.
  return formatted;
}

/**
 * The resolvers, declared apart from `forRoot` so the module that configures the
 * driver is not also the module that knows every context.
 *
 * They live here rather than in their own context modules for the same reason
 * the controllers live in `AppModule`: the worker imports every context module
 * for its services, and a resolver registered inside one would make the worker
 * try to build a schema it has no HTTP surface to serve.
 */
/**
 * Every resolver, as a list.
 *
 * Named rather than inlined below because generation needs it: the schema is
 * built from these classes with `GraphQLSchemaFactory`, which reads their
 * decorators and never instantiates them - so `pnpm gen:contracts` produces a
 * schema without a database, which is the whole point of that mode.
 *
 * A resolver added to the module and not to this list would serve at runtime
 * and be missing from the published schema, so there is one list and the module
 * spreads it.
 */
export const RESOLVERS = [
  MeResolver,
  MyDevicesResolver,
  AdminMembersResolver,
  AdminServiceClientsResolver,
  ProfileResolver,
  AdminSettingsResolver,
  TasksResolver,
  RemindersResolver,
  RhythmResolver,
  ConversationsResolver,
  /*
   * P5's five reads, and the reason this line matters more than it looks.
   *
   * "A read that a client cannot reach is a read that does not exist" — a query
   * handler with a spec and no resolver has shipped twice in this codebase
   * (P2, and P4's `quickQuestions`). Adding a slice means adding it here *and*
   * checking it appears in the regenerated `packages/contracts/schema.graphql`,
   * which is the proof.
   */
  CalendarResolver,
  /*
   * P6's eight reads — the next-practice card, the week, one session, the
   * athlete profile, the programs, one program, the workouts. Same rule as the
   * line above: adding a slice means adding it here **and** checking it appears
   * in the regenerated `packages/contracts/schema.graphql`, which is the proof.
   */
  TrainingResolver,
  /*
   * P7's four reads — the member's links, one link with its summary and its
   * videos, their suggestions inbox, and the Owner's queue across members.
   * Same rule as the two lines above, and it has been broken twice in this
   * codebase: adding a slice means adding it here **and** checking it appears
   * in the regenerated `packages/contracts/schema.graphql`, which is the
   * proof.
   */
  KnowledgeResolver,
] as const;

@Module({
  imports: [
    GraphQLEdgeModule,
    IdentityModule,
    ProfileModule,
    OperationsModule,
    PlanningModule,
    RemindersModule,
    RhythmModule,
    ConversationsModule,
    MeetingsModule,
    TrainingModule,
    KnowledgeModule,
  ],
  providers: [...RESOLVERS],
})
export class GraphQLModule {}
