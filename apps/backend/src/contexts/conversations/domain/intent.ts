/**
 * What the member asked for, as a typed structure.
 *
 * ## The model names an intent; it never performs one
 *
 * That separation is the whole safety story of this phase. The extractor is a
 * grammar-constrained call whose only possible outputs are the shapes below;
 * the executor turns one of those into a command in the owning context. So a
 * model that hallucinates cannot delete anything, and a pasted document that
 * says "cancel all reminders" cannot act, because acting requires a typed
 * structure and the document is never extracted from — only the member's own
 * keystrokes are.
 *
 * v1 asked one free-form call to both understand *and* act. It measured 528
 * seconds on a bad turn and there was no way to test what it would do.
 */

/**
 * Which of the member's two pinned chats a sentence belongs to, or neither.
 *
 * This is a *field*, not a judgement made later, and the reason is FR-008: an
 * off-topic message must be moved **before** it is answered, so nothing
 * off-topic is ever left in the Coach chat. A scope decided after the reply
 * streamed would be a scope decided too late.
 *
 * `coaching` and `planning` are both the member's own day, so neither moves a
 * turn out of a pinned chat: "remind me to call Dad" typed in Coach is carried
 * out in Coach. Bouncing every reminder into Planner would split one
 * conversation in half, which is worse than a slightly mixed transcript.
 */
export type IntentScope = 'coaching' | 'planning' | 'other';

/**
 * The actions the planner can take. `chat` is the absence of an action, and it
 * is a name in this list rather than a null so that every branch of the
 * executor is a case in one switch — the shape a reader can check for
 * completeness.
 *
 * `set_meeting` was here before P5 existed, deliberately: the model produces it
 * from "schedule a call with Sara at four", and while Meetings did not exist
 * the honest answer was "I cannot do that yet" rather than a silent misfile
 * into a task. That reasoning is still why the *extractor* has the name at all,
 * and it is worth keeping: without it the model files a meeting as a task and
 * Botvy quietly turns the member's diary into a to-do list. P5 built the
 * context, so the executor now carries it out instead of declining it.
 */
export type IntentName =
  | 'chat'
  | 'set_task'
  | 'set_reminder'
  | 'set_meeting'
  | 'cancel'
  | 'list'
  | 'record_metric'
  | 'update_profile'
  /**
   * P6's two. Both are `coaching`, because a training week is the member's
   * *body* and not their diary — the prompt's own body-or-schedule test.
   *
   * `set_slots` is a weekly rule and never a row: "gym Monday and Wednesday at
   * six" is a statement about their clock on two weekdays, so its arguments are
   * a sport, weekdays and one wall-clock time, and the sessions come from the
   * materialiser rather than from this turn. That is why there is no
   * `set_session` here: a member saying they train on Mondays has not asked for
   * one session, and filing it as one would give them a single practice and an
   * empty week after it.
   */
  | 'set_slots'
  | 'log_session';

/** What a `list` intent is a list of. Matches `chat.card`'s kinds. */
export type ListKind = 'tasks' | 'reminders' | 'meetings' | 'plan' | 'sessions';

/**
 * The arguments, all optional, because a missing field is the *normal* case and
 * the thing the executor must ask about rather than invent (FR-006).
 *
 * `when` is a **wall-clock string** (`YYYY-MM-DDTHH:mm`) and never an instant.
 * A model asked for an ISO timestamp produces one with an offset it guessed,
 * and the offset is the one thing it has no way to know. The wall clock is
 * resolved against the member's zone in code — principle XI — which is also
 * why `resolveRelativePhrase` runs over the member's own sentence before the
 * model's answer is trusted at all.
 */
export interface IntentArgs {
  title?: string;
  /** `YYYY-MM-DDTHH:mm` in the member's own zone. Never an instant. */
  when?: string;
  /** True when the member named a day but no time — an all-day task. */
  allDay?: boolean;
  /** 1 is highest, matching Planning's own scale. */
  priority?: number;
  label?: string;
  leadTimes?: string[];
  notes?: string;
  /** For `cancel`: what the member said, to match against their own items. */
  match?: string;
  /** For `list`. */
  listKind?: ListKind;
  /**
   * For `set_meeting`, and for `set_slots`: how long it runs, in minutes.
   *
   * One field for both, because "how long" is the same question and a second
   * `slotDurationMin` would be a second name the model has to choose between —
   * which is how a field comes back empty. The *bounds* differ (a slot is
   * capped at six hours by `MAX_SESSION_MIN`, a meeting at eight) and the
   * schema below carries the looser pair: each aggregate refuses what it will
   * not hold, and the executor reports a refusal rather than inventing a
   * length inside the range.
   *
   * An integer with bounds in the schema rather than a free number, for the
   * same reason `metric` is an enum: the grammar is enforced and the prose is
   * advice, and "half an hour" arriving as `0.5` or `"30 minutes"` is a
   * duration the aggregate would refuse. Absent is the normal case and means
   * the member's own default length (FR-001) — never a length this code
   * invented.
   */
  durationMin?: number;
  /**
   * For `set_meeting`: the two halves of a location, at least one of which
   * FR-001 requires.
   *
   * Two fields and not one, because a meeting held in a room that is also
   * dialled into is one meeting rather than two, and because the executor's
   * question when both are missing has to be answerable either way. Neither
   * can be constrained by the grammar — a link is a string and so is a street
   * — so the executor normalises what arrives instead: a model that puts the
   * room in `onlineLink` has still told us where the meeting is.
   */
  onlineLink?: string;
  address?: string;
  /**
   * For `record_metric`. A union, not a string, and the schema below carries
   * the same two values as an `enum`.
   *
   * Measured: with `metric` typed as a free string, `qwen2.5:3b-instruct`
   * returned `record_metric` for "I'm 178 cm tall" and left `args.metric`
   * empty — twice out of three metric cases in the corpus. A grammar-constrained
   * call can only produce what the schema admits, so an enum makes the model
   * pick one rather than hoping the prose persuades it. That is the whole
   * argument for constraining extraction rather than instructing it: the
   * schema is enforced and the prompt is advice.
   */
  metric?: 'weightKg' | 'heightCm';
  value?: number;
  /**
   * For `set_slots` and `log_session`: which sport.
   *
   * A free string and **not** an enum of `KNOWN_SPORTS`, which is the one place
   * in this file where the grammar is deliberately left loose. "other" in the
   * picker is a text field rather than a bucket — `AthleteProfile.chooseSports`
   * says so at length — so a member whose sport is padel must be able to say
   * "padel", and an enum of seven would have the model answer `other` and throw
   * the only useful word away. The cost is the usual one: the executor
   * normalises whitespace and the aggregate refuses an empty name.
   */
  sport?: string;
  /**
   * For `set_slots`: which days, as 1 (Monday) to 7 (Sunday).
   *
   * Integers and not names, and the schema below bounds them — the same
   * argument `metric` carries. A model asked for weekday *names* spells them in
   * two languages, abbreviates half of them and disagrees with itself about
   * whether the week starts on Sunday; `TrainingSlot.weekday` is ISO 8601 and
   * the conversion has exactly one home in Training. So the grammar asks for
   * the number the store holds, and the extractor drops anything outside the
   * range rather than clamping it: a 0 or an 8 is a model that has picked a
   * different convention, and pinning it to Monday or Sunday would set the
   * member's week on a day they never named.
   */
  weekdays?: number[];
  /** For `update_profile`: the fields the member stated about themselves. */
  goal?: string;
  foodLikes?: string[];
  foodDislikes?: string[];
  allergies?: string[];
  symptoms?: string[];
}

export interface Intent {
  name: IntentName;
  scope: IntentScope;
  args: IntentArgs;
  /**
   * The model's own confidence, when it offers one. Read only to log: a small
   * model's self-reported confidence is not calibrated, and branching on it
   * would be branching on a number nobody has validated.
   */
  confidence?: number;
}

/** Nothing to do but talk. The extractor's answer when it fails, too. */
export const PLAIN_CHAT: Intent = {
  name: 'chat',
  scope: 'coaching',
  args: {},
};

/**
 * Which intents actually do something.
 *
 * A set rather than `name !== 'chat'`, because an intent the executor answers
 * with a *question* — a `set_meeting` with no location, a `cancel` with two
 * matches — must not fall through to a plain reply. The member asked for
 * something to be done and the answer is about doing it.
 */
const ACTIONS = new Set<IntentName>([
  'set_task',
  'set_reminder',
  'set_meeting',
  'cancel',
  'list',
  'record_metric',
  'update_profile',
  'set_slots',
  'log_session',
]);

export function isAction(intent: Intent): boolean {
  return ACTIONS.has(intent.name);
}

/**
 * The JSON schema handed to Ollama's `format`, which is the extractor's
 * grammar rather than a hint.
 *
 * Exported from `domain/` so the schema and the TypeScript type sit in one
 * file and cannot drift: a field added to `IntentArgs` and not to the schema is
 * a field the model can never produce, and a field in the schema that the type
 * does not carry is one no branch will ever read. Both fail silently.
 *
 * `additionalProperties: false` on the envelope and not on `args`: the envelope
 * is a closed shape this code owns, and `args` is where a later phase adds a
 * field — refusing an unknown one there would make a model trained on a newer
 * prompt produce nothing at all rather than something usable.
 */
export const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      enum: [
        'chat',
        'set_task',
        'set_reminder',
        'set_meeting',
        'cancel',
        'list',
        'record_metric',
        'update_profile',
        'set_slots',
        'log_session',
      ],
    },
    scope: { type: 'string', enum: ['coaching', 'planning', 'other'] },
    args: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        when: { type: 'string' },
        allDay: { type: 'boolean' },
        priority: { type: 'integer', minimum: 1, maximum: 4 },
        label: { type: 'string' },
        leadTimes: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
        match: { type: 'string' },
        listKind: {
          type: 'string',
          enum: ['tasks', 'reminders', 'meetings', 'plan', 'sessions'],
        },
        /*
         * Bounded here as well as typed, because this is the half that is
         * enforced. The floor is five minutes and the ceiling eight hours —
         * `Meeting`'s own `MAX_DURATION_MIN`, duplicated rather than imported
         * because `domain/` may not reach into another context (constitution
         * IX). The aggregate remains the authority: this only stops the model
         * offering something it would refuse.
         */
        durationMin: { type: 'integer', minimum: 5, maximum: 480 },
        onlineLink: { type: 'string' },
        address: { type: 'string' },
        metric: { type: 'string', enum: ['weightKg', 'heightCm'] },
        sport: { type: 'string' },
        /*
         * Bounded here as well as typed, and this is the half that is enforced.
         * 1 is Monday and 7 is Sunday — `TrainingSlot.weekday`'s convention,
         * duplicated rather than imported because `domain/` may not reach into
         * another context (constitution IX). The aggregate remains the
         * authority; this stops the model offering a day it would refuse.
         */
        weekdays: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 7 },
        },
        value: { type: 'number' },
        goal: { type: 'string' },
        foodLikes: { type: 'array', items: { type: 'string' } },
        foodDislikes: { type: 'array', items: { type: 'string' } },
        allergies: { type: 'array', items: { type: 'string' } },
        symptoms: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  required: ['name', 'scope'],
  additionalProperties: false,
} as const;

/**
 * A title for a conversation an off-topic message was moved into: the member's
 * first six words.
 *
 * Their own words rather than a model-written summary, for three reasons — it
 * costs no second call on a turn that is already slow, it cannot hallucinate a
 * subject, and the member recognises the chat in a list because they wrote the
 * words. Trimmed to 60 characters, which is what a list row holds.
 */
export function titleFromMessage(text: string): string {
  const words = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 6);
  const title = words.join(' ').slice(0, 60).trim();
  // A message of pure punctuation or emoji leaves nothing to name it with. A
  // fixed fallback beats an empty row, and `rename` refuses an empty title
  // anyway.
  return title.length > 0 ? title : 'New chat';
}
