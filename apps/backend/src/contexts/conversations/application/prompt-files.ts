import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The prompt templates, read from disk and filled in.
 *
 * ## Why the prompts are files rather than string constants
 *
 * Because they are the product. The coach's voice, the planner's refusals and
 * the extractor's grammar are all tuned by reading a bad answer and editing a
 * paragraph, and a paragraph inside a `.ts` template literal is a paragraph
 * nobody edits: it needs escaping, it breaks the diff of every code review it
 * touches, and a backtick in a prompt becomes a syntax error in the build. They
 * live in `apps/backend/prompts/*.md`, where the Owner can read them.
 *
 * ## How the directory is found, and how that was verified compiled
 *
 * Nothing else in this backend reads a non-TS asset of its own — `push.service.ts`
 * is handed a path from the environment, which is a credential rather than an
 * asset — so there was no pattern to copy and this one has to be right on its
 * own.
 *
 * It resolves by walking *up* from this module's own directory until a `prompts`
 * directory appears, rather than by counting `..` segments. Counting works and
 * is one line shorter, and it is exactly the line that breaks silently: the
 * source sits at `src/contexts/conversations/application/` and the compiled
 * output at `dist/contexts/conversations/application/`, so the count agrees
 * today only because `tsconfig.build.json` roots the output at `src/` and
 * `nest build` mirrors the tree. Move this file one directory and the compiled
 * path is wrong while the spec, which runs from `src/`, still passes. Walking
 * up cannot develop that asymmetry.
 *
 * Verified against a compiled tree rather than reasoned about. Compiled with
 * `npx tsc -p tsconfig.build.json --outDir dist-probe`, then run out of it:
 *
 *     node --input-type=module -e "
 *       const m = await import('./dist-probe/contexts/conversations/application/prompt-files.js');
 *       m.renderPrompt('chat.md', { profile: 'PROBE-PROFILE', today: '2026-09-10',
 *                                   now: '14:05', timezone: 'Africa/Cairo' });"
 *
 * — which read `apps/backend/prompts/chat.md`, substituted, left no `{{var}}`
 * behind, and threw the expected "coach.md needs profile, today, now, timezone,
 * day" when called with nothing. Five hops up from the compiled file, the same
 * five as from the source, which is the asymmetry the walk removes. In the
 * image `/out` becomes `/app`, so the walk is
 * `/app/dist/contexts/conversations/application` → `/app/prompts`.
 *
 * **That directory has to be in the image.** `Dockerfile`'s build stage copies
 * `dist`, `migrations`, `migrate-mongo-config.cjs` and `prisma` into `/out` and
 * did not copy `prompts`, which would have made every chat turn in the
 * container throw on the first template read while every test on a developer's
 * machine passed. The `cp -r apps/backend/prompts /out/prompts` line beside the
 * others is part of this change, and it is the kind of defect the phase that
 * finds it fixes.
 */

/** Read once per process. A prompt file does not change under a running API. */
const cache = new Map<string, string>();

let promptsDir: string | null = null;

function directory(): string {
  if (promptsDir) return promptsDir;

  let dir = dirname(fileURLToPath(import.meta.url));
  // Five hops is the real distance from both `src/` and `dist/`; eight leaves
  // room for a directory being added between here and the package root without
  // this becoming the thing that broke.
  for (let hop = 0; hop < 8; hop += 1) {
    const candidate = join(dir, 'prompts');
    if (existsSync(candidate)) {
      promptsDir = candidate;
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    `no prompts/ directory above ${dirname(fileURLToPath(import.meta.url))} — ` +
      'the build did not copy apps/backend/prompts into the image',
  );
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * One prompt, with every `{{var}}` replaced.
 *
 * **Throws when the template asks for a variable the caller did not pass.** A
 * prompt shipped with a literal `{{profile}}` in it is not a prompt with a gap;
 * it is a prompt whose first instruction to the model is a sentence about
 * braces, and a 3-billion-parameter model answers it. Failing loudly on the
 * first turn after a template gains a variable is the cheapest possible way to
 * find out — a missing member fact is a *value* problem the caller decides
 * about (an unrecorded field is absent, never "unknown" — FR-006), and it
 * reaches here as an empty or explanatory string, never as a missing key.
 *
 * The check runs over the **template** rather than over the filled result, and
 * that is not a stylistic choice: a member can type `{{profile}}` into the
 * chat, and scanning the output would let them make every one of their own
 * turns throw. Their braces are inserted verbatim and mean nothing. The
 * replacement uses a function rather than a replacement string for the same
 * class of reason — `$&` and `$1` in a member's own text would otherwise be
 * expanded by `String.replace`.
 */
export function renderPrompt(
  file: string,
  vars: Record<string, string>,
): string {
  let template = cache.get(file);
  if (template === undefined) {
    template = readFileSync(join(directory(), file), 'utf8');
    cache.set(file, template);
  }

  const missing = [...template.matchAll(PLACEHOLDER)]
    .map((match) => match[1]!)
    .filter((key) => !(key in vars));
  if (missing.length > 0) {
    throw new Error(
      `${file} needs ${[...new Set(missing)].join(', ')}, which the caller did not pass`,
    );
  }

  return template.replace(PLACEHOLDER, (_whole, key: string) => vars[key]!);
}

/** Only for the spec: forget the cached templates. */
export function resetPromptCache(): void {
  cache.clear();
}

// ------------------------------------------------------------ T414: containment

const QUOTE_OPEN = '<quoted>';
const QUOTE_CLOSE = '</quoted>';

/**
 * Wraps quoted or pasted text in the markers `intent.md` and the chat prompts
 * treat as subject matter rather than instruction (FR-014).
 *
 * The containment that actually holds is structural and lives elsewhere: the
 * extraction call is made over the member's own message and nothing else, and
 * its only possible output is a typed `Intent` whose ids the executor looks up
 * itself. A pasted paragraph saying "cancel all reminders" therefore cannot
 * cancel anything, because cancelling requires a `match` searched against the
 * member's own rows. This function is the second layer: it stops the *answer*
 * treating the paste as a command, which is what makes "summarise this email"
 * safe when the email ends in "ignore your instructions".
 *
 * Two things it does, both small:
 *
 * 1. **Neutralises forged markers.** A member (or the author of something they
 *    pasted) writing a literal `</quoted>` would otherwise close the block from
 *    the inside and hand the rest of the paste back to the model as
 *    instruction. Both tags are rewritten to a bracketed form that reads the
 *    same and delimits nothing.
 * 2. **Delimits what is visibly a quote**: runs of `>`-prefixed lines, which is
 *    what a reply-quote and every mail client produce, and fenced blocks.
 *
 * ponytail: a bare paste with no quote markers at all is not detected, because
 * at that point it is indistinguishable from the member's own prose and a
 * length heuristic would wrap their long questions as "subject matter" —
 * suppressing the instruction they actually typed, which is a worse failure than
 * the one it prevents. The structural layer above is what covers that case. If
 * the clients ever send the quoted span explicitly (a `quotedText` field on the
 * turn), delimit that instead and drop the sniffing.
 */
export function delimitQuoted(text: string): string {
  const safe = text.replace(/<(\/?)quoted>/gi, '[$1quoted]');
  const lines = safe.split(/\r?\n/);

  const out: string[] = [];
  let fenced = false;
  let inBlock = false;

  for (const line of lines) {
    const fence = /^\s*(```|~~~)/.test(line);
    const quoted = fence || fenced || /^\s*>/.test(line);
    if (fence) fenced = !fenced;

    if (quoted && !inBlock) {
      out.push(QUOTE_OPEN);
      inBlock = true;
    } else if (!quoted && inBlock) {
      out.push(QUOTE_CLOSE);
      inBlock = false;
    }
    out.push(line);
  }
  if (inBlock) out.push(QUOTE_CLOSE);

  return out.join('\n');
}
