import { Injectable, Logger } from '@nestjs/common';
import { OllamaClient } from '../../../shared/llm/ollama.client.js';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import { renderPrompt } from '../../../shared/templates/prompt-files.js';
import type { MealKind } from '../domain/meal.aggregate.js';
import {
  MealDrafterPort,
  type MealDraft,
} from '../domain/nutrition.ports.js';

/**
 * The grammar for a day's meals.
 *
 * `kind` is an **enum** rather than a free string, which is the lesson P4 wrote
 * down about `record_metric`: as a free string the field came back empty two
 * times in three, and constrained to the values the store actually holds the
 * model fills it. A schema is enforced; a prompt is advice.
 *
 * There is no field for a quantity, a calorie, a macronutrient or a reason, and
 * that is the containment rather than an omission — FR-005 puts all of them out
 * of scope, and a model has nowhere to put a clinical claim when the only
 * writable fields are a name and a part of the day. The prompt says so as well,
 * and the prompt is the second layer.
 */
const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    meals: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['breakfast', 'lunch', 'dinner', 'snack'],
          },
        },
        required: ['name', 'kind'],
      },
    },
  },
  required: ['meals'],
} as const;

const MAX_MEAL_NAME = 120;

/**
 * The four parts of a day the model may name.
 *
 * `any` is absent on purpose, though it is a `MealKind`: it is the *member's*
 * word for a dish that fits anywhere in their own library, and nothing the model
 * proposes is a library row. A draft coming back as `any` would put a value in
 * the day's row that no slot means.
 */
const DRAFTABLE_KINDS: readonly MealKind[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
];

/**
 * Ordinary food ideas for one day (FR-003, FR-005).
 *
 * ## Null is the model being unavailable, and it is not a failure
 *
 * The plan is never delayed for food. Every failure here — the daemon down, the
 * model not pulled, a body the schema refuses, an empty list — comes back as
 * `null`, and the caller stores `model_unavailable` and lets the briefing go out
 * with the workout alone. There is no throw and therefore no `try` around the
 * call site, which is what keeps "the plan always arrives" in one place.
 *
 * There is deliberately **no plain-prose fallback** here, which is the one way
 * this differs from `LlmSuggestionDrafter`. A suggestion that does not decode
 * still has something to tell the member — the model's own words about their
 * reading. A meal list that does not decode has nothing: unstructured prose
 * about food is exactly the output this phase refuses, because it is where the
 * portions and the health claims live. Withholding the day says something true;
 * a paragraph would say something unchecked.
 *
 * ## The member's own words go in, never out
 *
 * `likes`, `dislikes` and `prohibitions` are lists the member typed. They are
 * rendered into the prompt as plain lines and nothing the model returns is
 * trusted back into them — what comes out is checked by the allergen gate in
 * the handler, and the gate reads the *result*, not the request. A prohibition
 * honoured in the prompt and broken in the answer is precisely the case the
 * retry exists for.
 */
@Injectable()
export class LlmMealDrafter extends MealDrafterPort {
  private readonly logger = new Logger(LlmMealDrafter.name);

  constructor(
    private readonly llm: OllamaClient,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async draft(input: {
    trainingFocus: string | null;
    likes: string[];
    dislikes: string[];
    prohibitions: string[];
    perDay: number;
  }): Promise<MealDraft | null> {
    const [model, numCtx] = await Promise.all([
      this.settings.get('llm.extractModel'),
      this.settings.get('llm.numCtx'),
    ]);

    const prompt = renderPrompt('meal-suggestion.md', {
      perDay: String(input.perDay),
      // A rest day is a stated fact rather than an absence, because "given a
      // hard training day, the suggestion reflects it in plain terms" needs the
      // model to know which kind of day it is — and a null it has to interpret
      // is a null it will interpret differently next month.
      trainingLine: input.trainingFocus
        ? `a training day: ${input.trainingFocus}`
        : 'a rest day — no training',
      likesLine: asList(input.likes, 'Nothing in particular.'),
      avoidLine: asList(
        // The dislikes and the gate's matches arrive as one list: to the model
        // they are the same instruction, and the difference between "they do
        // not like this" and "this would harm them" is the caller's to keep.
        [...input.dislikes, ...input.prohibitions],
        'Nothing in particular.',
      ),
    });

    const decoded = await this.llm.extract<RawDraft>(
      [{ role: 'user', content: prompt }],
      MEAL_SCHEMA,
      { model, numCtx },
    );

    if (!decoded || !Array.isArray(decoded.meals)) {
      this.logger.debug('the meal draft did not decode; the day is unavailable');
      return null;
    }

    const meals = decoded.meals
      .map((meal) => ({
        name: asName(meal?.name),
        kind: asKind(meal?.kind),
      }))
      .filter((meal): meal is { name: string; kind: MealKind } =>
        Boolean(meal.name),
      )
      .slice(0, input.perDay);

    // An empty list decodes cleanly and says nothing, so it is treated as the
    // model having failed rather than as a day with no food in it. A member
    // whose plan said "Meals:" followed by nothing would read it as a bug, and
    // it would be one.
    if (meals.length === 0) return null;

    return { meals, model };
  }
}

interface RawDraft {
  meals?: Array<{ name?: unknown; kind?: unknown }>;
}

function asName(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Trailing punctuation trimmed: the names are joined with commas into one
  // line, and a full stop in the middle of it reads as the sentence ending.
  return value.trim().replace(/[.;,]+$/, '').slice(0, MAX_MEAL_NAME).trim();
}

/**
 * The model's `kind`, or `snack`.
 *
 * The schema constrains this to four values and it is still normalised here,
 * because the schema is enforced by the *server*: a different backend, or an
 * older Ollama, may not enforce it at all. `snack` is the fallback rather than
 * `any` — `any` is the member's word for a meal that fits anywhere, and nothing
 * the model proposes is a member's library row.
 */
function asKind(value: unknown): MealKind {
  return typeof value === 'string' && DRAFTABLE_KINDS.includes(value as MealKind)
    ? (value as MealKind)
    : 'snack';
}

function asList(values: string[], fallback: string): string {
  const lines = values
    .map((value) => value.trim())
    .filter((value) => value !== '')
    .map((value) => `- ${value}`);
  return lines.length === 0 ? fallback : lines.join('\n');
}
