import { Injectable, Logger } from '@nestjs/common';
import { OllamaClient } from '../../../shared/llm/ollama.client.js';
import { renderPrompt } from '../../../shared/templates/prompt-files.js';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import {
  SuggestionDrafterPort,
  type DraftAttempt,
  type DraftSource,
} from '../domain/knowledge.ports.js';
import type { SuggestionDraft } from '../domain/suggestion.aggregate.js';

/**
 * The grammar for a session draft.
 *
 * Every measure is its own nullable number rather than a free `target` string,
 * which is the lesson P4 wrote down about `record_metric`: as a free string the
 * field came back empty two times in three, and as a constrained one the model
 * filled it. A schema is enforced; a prompt is advice.
 *
 * `exercises` may legitimately be empty — that is how the model says the
 * sources do not support a session of this sport, and the saga discards the
 * draft rather than showing the member something invented (story 3 scenario 3).
 */
const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    focus: { type: ['string', 'null'] },
    rationale: { type: 'string' },
    exercises: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          notes: { type: ['string', 'null'] },
          sets: {
            type: 'array',
            maxItems: 12,
            items: {
              type: 'object',
              properties: {
                targetReps: { type: ['integer', 'null'] },
                targetWeightKg: { type: ['number', 'null'] },
                targetDurationSec: { type: ['integer', 'null'] },
                targetDistanceM: { type: ['integer', 'null'] },
              },
              required: [
                'targetReps',
                'targetWeightKg',
                'targetDurationSec',
                'targetDistanceM',
              ],
            },
          },
        },
        required: ['name', 'sets'],
      },
    },
  },
  required: ['title', 'exercises', 'rationale'],
} as const;

/** How much of each source's summary goes into the prompt. */
const SOURCE_BUDGET = 1_200;

/**
 * A session drawn from the member's own readings (FR-009).
 *
 * ## The containment is structural, not a paragraph
 *
 * `session-suggestion.md` does tell the model that the sources are subject
 * matter, and that sentence is the second layer. The first is that **the only
 * thing this call can produce is a session draft**: the schema has no field for
 * an action, the caller stores the result and nothing else, and the P4 intent
 * extractor — the one component in this product that turns text into commands —
 * never sees a fetched document. An article ending "cancel all reminders"
 * therefore cannot cancel a reminder, whatever the model makes of it.
 *
 * What goes into the prompt is also narrower than what was read: the
 * **summaries**, not the extracted text. That is a cost decision first — a
 * five-source prompt of full articles would not fit in any context this
 * installation runs — and a containment decision second, because a summary has
 * already been through a pass that was told to report instructions rather than
 * follow them.
 *
 * ## Null is a real answer
 *
 * A draft that does not decode returns `draft: null` **and the model's plain
 * words**, because the constitution's fallback for a failed grammar-constrained
 * call is a plain reply and there is nowhere honest to put a half-parsed
 * suggestion. `generate-suggestion` delivers those words as a coach message
 * instead, which is the decision this phase's plan takes and states.
 */
@Injectable()
export class LlmSuggestionDrafter extends SuggestionDrafterPort {
  private readonly logger = new Logger(LlmSuggestionDrafter.name);

  constructor(
    private readonly llm: OllamaClient,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async draft(input: {
    sport: string;
    focus: string | null;
    forDate: string;
    durationMin: number | null;
    sources: DraftSource[];
  }): Promise<DraftAttempt> {
    const [model, numCtx] = await Promise.all([
      this.settings.get('llm.extractModel'),
      this.settings.get('llm.numCtx'),
    ]);

    const prompt = renderPrompt('session-suggestion.md', {
      sport: input.sport,
      forDate: input.forDate,
      focusLine: input.focus ? `, focused on ${input.focus}` : '',
      durationLine: input.durationMin
        ? `, and about ${input.durationMin} minutes long`
        : '',
      sources: input.sources.map(asBlock).join('\n\n'),
    });

    const decoded = await this.llm.extract<RawDraft>(
      [{ role: 'user', content: prompt }],
      DRAFT_SCHEMA,
      { model, numCtx },
    );

    if (!decoded || !Array.isArray(decoded.exercises)) {
      this.logger.debug('the session draft did not decode; falling back to prose');
      return {
        draft: null,
        rationale: '',
        plainReply: await this.plainly(prompt, model, numCtx),
        model,
        tokens: 0,
      };
    }

    const exercises = decoded.exercises
      .filter((exercise) => typeof exercise?.name === 'string')
      .map((exercise) => ({
        name: String(exercise.name),
        notes: typeof exercise.notes === 'string' ? exercise.notes : null,
        sets: (Array.isArray(exercise.sets) ? exercise.sets : []).map((set) => ({
          targetReps: asNumber(set?.targetReps),
          targetWeightKg: asNumber(set?.targetWeightKg),
          targetDurationSec: asNumber(set?.targetDurationSec),
          targetDistanceM: asNumber(set?.targetDistanceM),
        })),
      }));

    // The model saying "these sources do not support a session" is a decoded
    // answer rather than a failed one, so it comes back as a null draft with no
    // plain reply — there is nothing to tell the member, because there is
    // nothing to tell them about.
    if (exercises.length === 0) {
      return { draft: null, rationale: '', plainReply: null, model, tokens: 0 };
    }

    const draft: SuggestionDraft = {
      title: typeof decoded.title === 'string' ? decoded.title : 'Suggested session',
      focus: typeof decoded.focus === 'string' ? decoded.focus : input.focus,
      exercises,
    };

    return {
      draft,
      rationale: typeof decoded.rationale === 'string' ? decoded.rationale : '',
      plainReply: null,
      model,
      tokens: 0,
    };
  }

  /** The same question, unconstrained, for the member to read as prose. */
  private async plainly(
    prompt: string,
    model: string,
    numCtx: number,
  ): Promise<string | null> {
    try {
      const stream = this.llm.chat([{ role: 'user', content: prompt }], {
        model,
        numCtx,
      });
      let text = '';
      let next = await stream.next();
      while (!next.done) {
        text += next.value;
        next = await stream.next();
      }
      return text.trim() === '' ? null : text.trim();
    } catch (error) {
      // A model that would not answer the structured call and will not answer
      // the plain one either. Nothing is delivered, which is correct: the
      // member is not owed a message about a suggestion that was never made.
      this.logger.debug(`no plain reply either: ${(error as Error).message}`);
      return null;
    }
  }
}

interface RawDraft {
  title?: unknown;
  focus?: unknown;
  rationale?: unknown;
  exercises?: Array<{
    name?: unknown;
    notes?: unknown;
    sets?: Array<Record<string, unknown>>;
  }>;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * One source, as the prompt shows it.
 *
 * The link id is in the block so the model can cite it in its rationale, and it
 * is **not** trusted as the citation: `sourceLinkIds` on the stored suggestion
 * is the list the saga selected, not a list the model returned. A model that
 * invented an id would otherwise put a citation on a suggestion pointing at
 * somebody's else's reading, or at nothing.
 */
function asBlock(source: DraftSource): string {
  const points = source.keyPoints.map((point) => `- ${point}`).join('\n');
  return [
    `[${source.linkId}] ${source.title ?? source.url}`,
    source.summary.slice(0, SOURCE_BUDGET),
    points,
  ]
    .filter((part) => part.trim() !== '')
    .join('\n');
}
