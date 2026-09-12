import {
  Args,
  Field,
  Float,
  ID,
  Int,
  ObjectType,
  Query,
  Resolver,
  registerEnumType,
} from '@nestjs/graphql';
import {
  CurrentPrincipal,
  Roles,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { DateScalar, DateTimeScalar } from '../../../../graphql/scalars.js';
import type { LinkStatus } from '../../domain/link.aggregate.js';
import type { SuggestionStatus } from '../../domain/suggestion.aggregate.js';
import { SuggestionsQueryHandler } from '../suggestions/suggestions.query.js';
import { LinksQueryHandler } from './links.query.js';

/**
 * The two enums the schema publishes, registered once.
 *
 * As string unions in the domain and as GraphQL enums here, which is the split
 * every context in this codebase makes: the domain's union is checked by the
 * compiler and the schema's enum is checked at the edge, and a client sending
 * `LinkStatus.pending` gets a validation error rather than an empty list.
 */
export enum LinkStatusEnum {
  queued = 'queued',
  fetching = 'fetching',
  extracting = 'extracting',
  summarising = 'summarising',
  done = 'done',
  failed = 'failed',
}
registerEnumType(LinkStatusEnum, { name: 'LinkStatus' });

export enum LinkKindEnum {
  article = 'article',
  website = 'website',
  video = 'video',
  playlist = 'playlist',
}
registerEnumType(LinkKindEnum, { name: 'LinkKind' });

export enum SuggestionStatusEnum {
  pending = 'pending',
  accepted = 'accepted',
  dismissed = 'dismissed',
}
registerEnumType(SuggestionStatusEnum, { name: 'SuggestionStatus' });

/** A picture found in a source, served through Botvy (FR-008). */
@ObjectType('SourceMedia')
export class SourceMediaType {
  @Field(() => String)
  type!: string;

  /**
   * The proxied path, or null when this installation has no signing secret.
   *
   * Nullable rather than falling back to the source's own URL: a fallback would
   * quietly defeat FR-008 on exactly the installation whose Owner had not
   * finished configuring it, and a missing picture is a visible absence where a
   * leaked request is not.
   */
  @Field(() => String, { nullable: true })
  url!: string | null;

  @Field(() => String, { nullable: true })
  caption!: string | null;
}

/**
 * What Botvy read, as the member sees it (FR-006, SC-006).
 *
 * `lengthChars` and `durationSec` are the "is this worth my time" half of
 * SC-006 — a 150-word summary is only useful beside a sense of what it stands
 * in for. The extracted text itself is **not** on this type and never should
 * be: it is up to sixty thousand characters, no screen shows it, and a field
 * that large on a list type is a mistake waiting for somebody to select it.
 */
@ObjectType('KnowledgeDoc')
export class KnowledgeDocType {
  @Field(() => String, { nullable: true })
  title!: string | null;

  @Field(() => String, { nullable: true })
  author!: string | null;

  @Field(() => DateTimeScalar, { nullable: true })
  publishedAt!: Date | null;

  @Field(() => String)
  summary!: string;

  @Field(() => [String])
  keyPoints!: string[];

  @Field(() => [SourceMediaType])
  media!: SourceMediaType[];

  @Field(() => Int, { nullable: true })
  durationSec!: number | null;

  @Field(() => Int)
  lengthChars!: number;

  /**
   * False for a video whose captions were not available; **null** for anything
   * that is not a video.
   *
   * Three states rather than a boolean, for the reason this codebase already
   * wrote down about `adhered`: "no" and "the question does not arise" are
   * different answers, and collapsing them puts a line saying "no transcript"
   * under every article ever written.
   */
  @Field(() => Boolean, { nullable: true })
  hadTranscript!: boolean | null;

  @Field(() => DateTimeScalar)
  readAt!: Date;
}

@ObjectType('Link')
export class LinkType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  url!: string;

  @Field(() => LinkKindEnum)
  kind!: string;

  @Field(() => String, { nullable: true })
  title!: string | null;

  @Field(() => [String])
  tags!: string[];

  @Field(() => LinkStatusEnum)
  status!: string;

  @Field(() => String, { nullable: true })
  failReason!: string | null;

  @Field(() => Int)
  attempts!: number;

  @Field(() => ID, { nullable: true })
  parentId!: string | null;

  /** Videos of a playlist the Owner's limit left behind (FR-002's edge case). */
  @Field(() => Int, { nullable: true })
  skippedCount!: number | null;

  @Field(() => DateTimeScalar)
  addedAt!: Date;

  @Field(() => DateTimeScalar, { nullable: true })
  processedAt!: Date | null;

  /**
   * A playlist's videos. Empty on the list read and filled on the detail one.
   *
   * Not a resolved field with a DataLoader, deliberately: the only type that
   * ever has children is a playlist, the only screen that wants them is the
   * detail screen, and a loader would be machinery for one caller.
   */
  @Field(() => [LinkType])
  children!: LinkType[];

  @Field(() => KnowledgeDocType, { nullable: true })
  doc!: KnowledgeDocType | null;
}

@ObjectType('LinkConnection')
export class LinkConnectionType {
  @Field(() => [LinkType])
  nodes!: LinkType[];

  @Field(() => String, { nullable: true })
  endCursor!: string | null;

  @Field(() => Boolean)
  hasNextPage!: boolean;
}

@ObjectType('SuggestedSet')
export class SuggestedSetType {
  @Field(() => Int, { nullable: true })
  targetReps!: number | null;

  @Field(() => Float, { nullable: true })
  targetWeightKg!: number | null;

  @Field(() => Int, { nullable: true })
  targetDurationSec!: number | null;

  @Field(() => Int, { nullable: true })
  targetDistanceM!: number | null;
}

/**
 * A suggested exercise, and **not** Training's `Exercise`.
 *
 * The blueprint's SDL types `SuggestionDraft.exercises` as `[Exercise!]!`, and
 * that cannot be served: `Exercise` is Training's type, and a `features/` file
 * here declaring it is precisely what `no-restricted-imports` refuses. It is
 * the same correction P6 made to `Program.sourceLinks`, in the other direction,
 * and the blueprint is corrected rather than the rule bent — the generated
 * `packages/contracts/schema.graphql` is the truth, and when the blueprint
 * disagrees with it the blueprint is what was wrong.
 *
 * The shapes differ anyway: a suggestion has targets and can never have
 * actuals, because it is a proposal about a session that has not happened.
 */
@ObjectType('SuggestedExercise')
export class SuggestedExerciseType {
  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => [SuggestedSetType])
  sets!: SuggestedSetType[];
}

@ObjectType('SuggestionDraft')
export class SuggestionDraftType {
  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  focus!: string | null;

  @Field(() => [SuggestedExerciseType])
  exercises!: SuggestedExerciseType[];
}

@ObjectType('SuggestionSource')
export class SuggestionSourceType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  url!: string;

  @Field(() => String, { nullable: true })
  title!: string | null;
}

@ObjectType('Suggestion')
export class SuggestionType {
  @Field(() => ID)
  id!: string;

  /** The member's own local date, which is why it is a `Date` and not a `DateTime`. */
  @Field(() => DateScalar)
  forDate!: string;

  @Field(() => String)
  sport!: string;

  @Field(() => SuggestionDraftType)
  draft!: SuggestionDraftType;

  @Field(() => [SuggestionSourceType])
  sources!: SuggestionSourceType[];

  @Field(() => String)
  rationale!: string;

  @Field(() => SuggestionStatusEnum)
  status!: string;

  /** The session it was suggested for. */
  @Field(() => ID, { nullable: true })
  sessionId!: string | null;

  /** The session it went into, once accepted. */
  @Field(() => ID, { nullable: true })
  acceptedSessionId!: string | null;

  @Field(() => String, { nullable: true })
  outcome!: string | null;

  @Field(() => DateTimeScalar)
  createdAt!: Date;
}

/**
 * Knowledge's reads.
 *
 * Commands stay on REST — saving, retrying, removing, accepting and dismissing
 * are all requests to change something and constitution X puts those on an HTTP
 * verb. This is the read half, and it is the proof of the rule this codebase
 * has broken twice: *a read a client cannot reach is a read that does not
 * exist*. Adding a slice means adding it to `RESOLVERS` in
 * `graphql/graphql.module.ts` **and** checking it appears in the regenerated
 * `packages/contracts/schema.graphql`.
 */
@Resolver()
@UsersOnly()
export class KnowledgeResolver {
  constructor(
    private readonly links: LinksQueryHandler,
    private readonly suggestions: SuggestionsQueryHandler,
  ) {}

  @Query(() => LinkConnectionType, {
    name: 'links',
    description: 'The member’s saved links, newest first.',
  })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Args('status', { type: () => LinkStatusEnum, nullable: true })
    status?: LinkStatusEnum,
    @Args('kind', { type: () => LinkKindEnum, nullable: true })
    kind?: LinkKindEnum,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 50 })
    first?: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ): Promise<LinkConnectionType> {
    return (await this.links.list(principal.id, {
      status: status as LinkStatus | undefined,
      kind,
      first,
      after,
    })) as unknown as LinkConnectionType;
  }

  @Query(() => LinkType, {
    name: 'link',
    nullable: true,
    description: 'One saved link with its summary and, for a playlist, its videos.',
  })
  async one(
    @CurrentPrincipal() principal: Principal,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<LinkType | null> {
    return (await this.links.one(principal.id, id)) as unknown as LinkType | null;
  }

  @Query(() => [SuggestionType], {
    name: 'suggestions',
    description: 'Session suggestions drawn from the member’s own saved sources.',
  })
  async inbox(
    @CurrentPrincipal() principal: Principal,
    @Args('status', {
      type: () => SuggestionStatusEnum,
      nullable: true,
      defaultValue: SuggestionStatusEnum.pending,
    })
    status?: SuggestionStatusEnum,
  ): Promise<SuggestionType[]> {
    return (await this.suggestions.list(
      principal.id,
      status as SuggestionStatus,
    )) as unknown as SuggestionType[];
  }

  /**
   * The whole installation's queue (FR-014).
   *
   * Admin-only, and it is the one read in this context that crosses members —
   * which is what the Owner's queue *is*. `@Roles('admin')` on the method
   * rather than on the class, because the three above are every member's.
   */
  @Query(() => [LinkType], {
    name: 'ingestionQueue',
    description: 'Every member’s unfinished links. Administrators only.',
  })
  @Roles('admin')
  async queue(
    @Args('status', { type: () => LinkStatusEnum, nullable: true })
    status?: LinkStatusEnum,
  ): Promise<LinkType[]> {
    return (await this.links.queue(
      status as LinkStatus | undefined,
    )) as unknown as LinkType[];
  }
}
