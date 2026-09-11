/**
 * Conversations' own containment rule for a member's pasted text.
 *
 * The prompt *loader* that used to live here — `renderPrompt` and
 * `resetPromptCache` — moved to `shared/templates/prompt-files.ts` in P7, when
 * Knowledge's summariser became its second caller and a Mongo context reaching
 * into this one's `application/` layer turned out to be the only other way to
 * get it. That file carries the argument, and the directory walk it describes
 * survived the move with nothing changed, which is the argument's own evidence.
 *
 * What stayed is the part that is about *this* context: quoting is a rule about
 * what the coach treats as instruction, not a way of reading a file.
 */

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
