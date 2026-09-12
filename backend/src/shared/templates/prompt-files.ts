import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The prompt templates, read from disk and filled in.
 *
 * ## Why the prompts are files rather than string constants
 *
 * Because they are the product. The coach's voice, the planner's refusals, the
 * extractor's grammar and now the summariser's instructions are all tuned by
 * reading a bad answer and editing a paragraph, and a paragraph inside a `.ts`
 * template literal is a paragraph nobody edits: it needs escaping, it breaks
 * the diff of every code review it touches, and a backtick in a prompt becomes
 * a syntax error in the build. They live in `ai/prompts/*.md`, beside the
 * model server's own setup, where the Owner can read them.
 *
 * ## Why this is in `shared/` and not in the context that wrote it first
 *
 * It was `contexts/conversations/application/prompt-files.ts` from P4 to P7.
 * Knowledge needs the same loader for its summariser and its suggestion
 * drafter, and a Mongo context reaching into another context's `application/`
 * layer is exactly what constitution IX refuses — `application/` is not a
 * published surface, a `*.query.ts` handler is.
 *
 * The three available answers were: duplicate it, publish it from
 * Conversations, or move it. Duplicating is what the constitution asks for on a
 * *second* copy, and it is wrong here for the reason the file itself explains
 * at length below — the directory walk was verified against a compiled tree,
 * and a second copy of a path resolution is a second thing to get wrong in a
 * way that only shows up inside the image. Publishing it from Conversations
 * would make every context that ever writes a prompt import the chat context,
 * which points the dependency backwards in exactly the way `LlmModule`'s own
 * note describes: *a shared client belongs in its own module, not in the first
 * module that needed it*.
 *
 * So it moved, and `delimitQuoted` — which is Conversations' own containment
 * rule about a member's pasted text, not a loader — stayed behind.
 *
 * ## How the directory is found, and how that was verified compiled
 *
 * It resolves by walking *up* from this module's own directory until a
 * `prompts` or an `ai/prompts` directory appears, rather than by counting `..`
 * segments. Two candidates because the templates and the code that reads them
 * no longer live in the same package: from a source tree the walk finds
 * `<repo>/ai/prompts`, and inside the image it finds `/app/prompts`, which the
 * Dockerfile puts there. Counting
 * works and is one line shorter, and it is exactly the line that breaks
 * silently: the source sits under `src/` and the compiled output under `dist/`,
 * so the count agrees today only because `tsconfig.build.json` roots the output
 * at `src/` and `nest build` mirrors the tree. Move this file one directory and
 * the compiled path is wrong while the spec, which runs from `src/`, still
 * passes. Walking up cannot develop that asymmetry — and this file moving from
 * a five-hop location to a three-hop one, with nothing to change, is the
 * argument made concrete.
 *
 * **And this directory is called `templates`, not `prompts`.** The move landed
 * in `shared/prompts/` first, and the walk promptly found *itself*: the first
 * candidate above the module's own directory is `shared/prompts`, which exists,
 * so every template read resolved to the folder holding this file and twenty-
 * five chat tests failed with `ENOENT … src/shared/prompts/coach.md`. A search
 * that stops at the first directory of a given name cannot be given a
 * same-named home, and renaming is the fix that keeps the search simple rather
 * than adding a rule about which match to ignore.
 *
 * Verified against a compiled tree rather than reasoned about. Compiled with
 * `npx tsc -p tsconfig.build.json --outDir dist-probe`, then run out of it:
 *
 *     node --input-type=module -e "
 *       const m = await import('./dist-probe/shared/templates/prompt-files.js');
 *       m.renderPrompt('chat.md', { profile: 'PROBE-PROFILE', today: '2026-09-10',
 *                                   now: '14:05', timezone: 'Africa/Cairo' });"
 *
 * — which read the templates, substituted, left no `{{var}}` behind, and threw
 * the expected "coach.md needs profile, today, now, timezone, day" when called
 * with nothing. In the image `/out` becomes `/app`, so the walk is
 * `/app/dist/shared/templates` → `/app/prompts`, found at the third hop.
 *
 * **That directory has to be in the image, and nothing else puts it there.**
 * `Dockerfile` copies `ai/prompts` into `/out/prompts` beside `dist`,
 * `migrations` and `prisma`. The templates are outside this package now, so
 * `pnpm deploy` does not carry them and that one `cp` is the only reason they
 * ship; without it every model call in the container throws on the first
 * template read while every test on a developer's machine passes.
 */

/** Read once per process. A prompt file does not change under a running API. */
const cache = new Map<string, string>();

let promptsDir: string | null = null;

function directory(): string {
  if (promptsDir) return promptsDir;

  let dir = dirname(fileURLToPath(import.meta.url));
  // Three hops to `/app/prompts` in the image, five to `<repo>/ai/prompts` from
  // either `src/` or `dist/`; eight leaves room for a directory being added
  // between here and the repository root without this becoming the thing that
  // broke. `prompts` is tested before `ai/prompts` at every hop, so the image —
  // which has the first and not the second — never walks past its own copy.
  for (let hop = 0; hop < 8; hop += 1) {
    for (const candidate of [join(dir, 'prompts'), join(dir, 'ai', 'prompts')]) {
      if (existsSync(candidate)) {
        promptsDir = candidate;
        return candidate;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    `no prompts/ or ai/prompts/ directory above ${dirname(fileURLToPath(import.meta.url))} — ` +
      'the build did not copy ai/prompts into the image',
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
 * expanded by `String.replace`. That second half matters more in P7 than it
 * did in P4: the text filled in here now includes whole articles fetched from
 * the open web.
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

/** Only for the specs: forget the cached templates. */
export function resetPromptCache(): void {
  cache.clear();
}
