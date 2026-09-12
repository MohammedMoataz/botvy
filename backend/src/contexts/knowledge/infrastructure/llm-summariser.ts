import { Injectable, Logger } from '@nestjs/common';
import { OllamaClient } from '../../../shared/llm/ollama.client.js';
import { renderPrompt } from '../../../shared/templates/prompt-files.js';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import {
  SourceUnavailable,
  SummariserPort,
  type Summarised,
} from '../domain/knowledge.ports.js';

/**
 * Roughly how many characters one token is worth for the prose this reads.
 *
 * Four is the usual English figure and it is deliberately conservative: Arabic
 * and code both run shorter, so a chunk sized by this rule is under budget for
 * them rather than over. Being under budget costs an extra map pass; being over
 * it silently truncates the *front* of the prompt, which is where the
 * instructions are.
 */
const CHARS_PER_TOKEN = 4;

/** What the template itself costs, before any source text goes into it. */
const FRAME_TOKENS = 400;

/** What the model is allowed to write back for one chunk. */
const REPLY_TOKENS = 400;

/** Never chunk smaller than this, however small `llm.numCtx` is set. */
const MIN_CHUNK_CHARS = 1_000;

/** Map passes past this and the reduce prompt stops fitting in one context. */
const MAX_CHUNKS = 12;

/**
 * How many characters of source one model call may carry.
 *
 * Exported and pure because it is the whole of T713's first assertion: the
 * chunk size is **derived from `llm.numCtx`** rather than written down, so an
 * Owner who moves to a model with a larger context gets larger chunks and fewer
 * passes without anybody editing this file — and a chunk can never exceed the
 * budget when that key changes, because there is no second number to forget.
 *
 * Ollama keys a loaded model by its context size, so this pipeline uses the one
 * configured `numCtx` for every call it makes. Two sizes anywhere would reload
 * the model between them, measured at thirty-nine seconds to first token in v1.
 */
export function chunkBudget(numCtx: number): number {
  const available = numCtx - FRAME_TOKENS - REPLY_TOKENS;
  return Math.max(MIN_CHUNK_CHARS, available * CHARS_PER_TOKEN);
}

/**
 * The text in pieces no larger than the budget, split at paragraph breaks.
 *
 * At paragraphs rather than at a fixed offset, because a chunk that starts
 * mid-sentence starts with half a thought and the model spends its first
 * sentence guessing at it. A single paragraph longer than the whole budget —
 * a transcript with no line breaks is the usual case — is cut hard, which is
 * the honest fallback rather than a sentence splitter that would have to know
 * about abbreviations in two languages.
 */
export function chunk(text: string, budget: number): string[] {
  if (text.length <= budget) return text.trim() === '' ? [] : [text];

  const out: string[] = [];
  let current = '';

  for (const paragraph of text.split(/\n{2,}/)) {
    if (paragraph.length > budget) {
      if (current !== '') {
        out.push(current);
        current = '';
      }
      for (let at = 0; at < paragraph.length; at += budget) {
        out.push(paragraph.slice(at, at + budget));
      }
      continue;
    }
    if (current.length + paragraph.length + 2 > budget) {
      out.push(current);
      current = paragraph;
    } else {
      current = current === '' ? paragraph : `${current}\n\n${paragraph}`;
    }
  }

  if (current !== '') out.push(current);
  return out.slice(0, MAX_CHUNKS);
}

/** The grammar for the key-points pass. An enum of nothing; a list of strings. */
const KEY_POINTS_SCHEMA = {
  type: 'object',
  properties: {
    points: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 6,
    },
  },
  required: ['points'],
} as const;

/**
 * Map-reduce over the local model (FR-006, SC-006).
 *
 * ## Two passes and one grammar
 *
 * The summary is prose, so it is produced by an ordinary completion: asking for
 * a schema-constrained paragraph buys nothing, because there is nothing to
 * parse. The **key points** are a list, so they are asked for with a JSON
 * schema — `format` is enforced where a prompt is advice, and a small model
 * asked for "bullet points" as free text returns a paragraph about bullet
 * points roughly a third of the time.
 *
 * ## The key-points fallback leaves the summary standing
 *
 * The constitution requires a plain-reply exit from every grammar-constrained
 * call, and here it is the thinner reading rather than the failure: when the
 * points do not decode, the entry still reaches `done` with the summary and an
 * empty list. Failing the whole ingestion because a secondary list would not
 * parse would throw away a perfectly good summary the member is waiting for.
 *
 * ## An unreachable model is not a failed link
 *
 * Every call is wrapped so that an outage comes back as `SourceUnavailable`,
 * which leaves the row where it is for the sweep and spends no attempt
 * (FR-016). The source was fine; we were not.
 */
@Injectable()
export class LlmSummariser extends SummariserPort {
  private readonly logger = new Logger(LlmSummariser.name);

  constructor(
    private readonly llm: OllamaClient,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async summarise(input: {
    title: string | null;
    text: string;
    hadTranscript: boolean | null;
    sourceUrl: string;
  }): Promise<Summarised> {
    const [model, numCtx] = await Promise.all([
      this.settings.get('llm.summarizeModel'),
      this.settings.get('llm.numCtx'),
    ]);

    const pieces = chunk(input.text, chunkBudget(numCtx));
    if (pieces.length === 0) {
      // Unreachable through the pipeline — the extractors refuse a document
      // with too little text — and answered rather than thrown, because a
      // caller that got here has a link that genuinely has nothing in it and
      // deserves a row saying so rather than a stack trace.
      return {
        summary: 'There was nothing readable at this link.',
        keyPoints: [],
        model,
        tokens: 0,
      };
    }

    let tokens = 0;
    const title = input.title ?? input.sourceUrl;

    // One map pass per chunk. Sequential rather than parallel: the model is the
    // bottleneck and a single Ollama instance serialises anyway, so firing
    // three at once would only move the queue from here to there — and it would
    // make `knowledge.concurrency`, which the Owner sets, a lie about how many
    // requests are in flight.
    const partials: string[] = [];
    for (const [index, piece] of pieces.entries()) {
      const answer = await this.complete(
        renderPrompt('summarise-chunk.md', {
          title,
          index: String(index + 1),
          total: String(pieces.length),
          chunk: piece,
        }),
        model,
        numCtx,
      );
      tokens += answer.tokens;
      if (answer.text.trim() !== '') partials.push(answer.text.trim());
    }

    /*
     * The reduce pass runs even when there was only one chunk.
     *
     * It reads like a wasted call and it is not: the map prompt asks for "3 to 6
     * sentences saying what this part contains" and the reduce prompt asks for
     * "at most 150 words, instead of the original". SC-006 measures the second
     * one. Skipping the reduce for a short article would give that member a
     * different kind of summary from everybody else's, which is the sort of
     * inconsistency nobody traces back to a branch.
     */
    const context =
      input.hadTranscript === false
        ? 'This is a video whose captions were not available, so only its title and description were read.'
        : '';
    const reduced = await this.complete(
      renderPrompt('summarise-reduce.md', {
        context,
        summaries: partials.join('\n\n'),
      }),
      model,
      numCtx,
    );
    tokens += reduced.tokens;

    const summary =
      reduced.text.trim() === '' ? partials.join(' ').slice(0, 1_000) : reduced.text.trim();

    return {
      summary,
      keyPoints: await this.keyPoints(summary, model, numCtx),
      model,
      tokens,
    };
  }

  /** The list, or nothing at all. See the class note on the fallback. */
  private async keyPoints(
    summary: string,
    model: string,
    numCtx: number,
  ): Promise<string[]> {
    try {
      const decoded = await this.llm.extract<{ points?: unknown }>(
        [{ role: 'user', content: renderPrompt('key-points.md', { summary }) }],
        KEY_POINTS_SCHEMA,
        { model, numCtx },
      );
      const points = decoded?.points;
      if (!Array.isArray(points)) {
        this.logger.debug('key points did not decode; keeping the summary alone');
        return [];
      }
      return points
        .filter((point): point is string => typeof point === 'string')
        .map((point) => point.trim())
        .filter((point) => point !== '')
        .slice(0, 6);
    } catch (error) {
      // Deliberately swallowed rather than propagated. An outage during the
      // *summary* leaves the row for the sweep; an outage during this secondary
      // pass would otherwise throw away a summary that already exists.
      this.logger.debug(`key points unavailable: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * One plain completion, collected from the stream.
   *
   * `OllamaClient` streams because the chat needs it to; there is nobody
   * watching this one, so the pieces are joined. Using the streaming call
   * anyway rather than adding a second method keeps one place where this
   * product talks to a model — which is what makes "every call uses the one
   * `numCtx`" a thing somebody can check rather than hope for.
   */
  private async complete(
    prompt: string,
    model: string,
    numCtx: number,
  ): Promise<{ text: string; tokens: number }> {
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
      const usage = next.value;
      return {
        text,
        tokens: (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
      };
    } catch (error) {
      throw new SourceUnavailable(
        `The model did not answer: ${(error as Error).message}`,
      );
    }
  }
}
