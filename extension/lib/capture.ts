import type { BotvyClient } from '@botvy/sdk';
import { db } from './db';

/**
 * Turning what the member is reading into something they will act on (FR-003).
 *
 * Four targets — a task, a reminder, a saved link, and a page as a task — and
 * one rule that applies to all of them: **the page's address goes into the
 * item's notes**. It is the one field every target already has, and without it
 * a captured sentence is a note with no way back to what it was about.
 */

export type CaptureKind = 'task' | 'reminder' | 'link';

/** A panel line, not a policy. `plan.md` fixes it as a constant. */
export const MAX_TITLE = 120;

/**
 * The first line of a capture, cut at a word.
 *
 * A member selecting three paragraphs means the first sentence as the title and
 * the rest as the note — a task list whose rows are paragraphs is unreadable,
 * and truncating mid-word ("reply to the invoi") reads like a bug.
 *
 * A single word longer than the limit is cut **hard** rather than dropped: a
 * URL or a German compound has no word boundary to cut at, and answering an
 * empty title would lose the capture entirely.
 */
export function captureTitle(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= MAX_TITLE) return flat;

  const cut = flat.slice(0, MAX_TITLE);
  const lastSpace = cut.lastIndexOf(' ');
  // A boundary in the last fifth of the window is a word break worth using; one
  // near the start means a very long first word, and cutting there would throw
  // away most of what the member selected.
  if (lastSpace > MAX_TITLE * 0.6) return cut.slice(0, lastSpace).trim();
  return cut.trim();
}

/** What the notes carry: the whole selection, then where it came from. */
export function captureNotes(text: string, url: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const parts = [];
  if (flat.length > MAX_TITLE) parts.push(flat);
  if (url) parts.push(url);
  return parts.join('\n\n');
}

/**
 * One capture the worker could not send as a synced row.
 *
 * A **task** is an entity this surface holds, so it goes on the ordinary sync
 * queue and the engine's rules apply to it unchanged. A **reminder** and a
 * **saved link** are not: neither is in the extension's sync subset, so they
 * are commands — and a command sent from a browser with no network has to wait
 * somewhere, or FR-005's "kept and sent exactly once" is not true of two of the
 * four capture targets.
 *
 * That somewhere is this table. The id is minted at capture and travels as the
 * idempotency key, so a flush that is retried after a dropped connection
 * creates nothing twice.
 */
export interface CaptureRow {
  id: string;
  kind: CaptureKind;
  title: string;
  notes: string;
  url: string;
  capturedAt: string;
  /**
   * When a reminder should fire, if the member said.
   *
   * Null for a capture from the context menu, where they chose a sentence and
   * not a moment — that case gets the hour's grace below. The Add form always
   * sets it, and the two must not be collapsed: a member who typed 18:00 and
   * got an hour from now would be told their reminder had been saved and then
   * be reminded at the wrong time.
   */
  remindAt?: string | null;
  attempts: number;
}

export interface CaptureInput {
  kind: CaptureKind;
  text: string;
  url: string;
  id: string;
  /** When this was captured. Defaults to now. */
  at?: Date;
  /** The moment a reminder should fire, when the member chose one. */
  remindAt?: Date;
}

/** Where a capture goes, given what it is. */
export async function queueCapture(input: CaptureInput): Promise<CaptureRow> {
  const at = input.at ?? new Date();
  const row: CaptureRow = {
    id: input.id,
    kind: input.kind,
    title: captureTitle(input.text) || 'Saved from the web',
    notes: captureNotes(input.text, input.url),
    url: input.url,
    capturedAt: at.toISOString(),
    remindAt: input.remindAt?.toISOString() ?? null,
    attempts: 0,
  };
  await db.captures.put(row);
  return row;
}

/**
 * Send what is waiting, once each.
 *
 * Called after a capture and on every pass. Each row carries its own id as the
 * idempotency key, so the failure this cannot avoid — a response lost after the
 * server committed — costs a duplicate request and never a duplicate item.
 *
 * A row is removed only when the server has answered. A refusal that will never
 * succeed would otherwise sit here for ever, so the attempt count is kept and
 * the panel shows anything past the cap as needing attention — the same five
 * the sync queue uses, because two different limits for "we tried" is one the
 * member would have to learn twice.
 */
export const MAX_CAPTURE_ATTEMPTS = 5;

export async function flushCaptures(client: BotvyClient): Promise<number> {
  const rows = await db.captures.toArray();
  let sent = 0;

  for (const row of rows) {
    if (row.attempts >= MAX_CAPTURE_ATTEMPTS) continue;
    try {
      await sendCapture(client, row);
      await db.captures.delete(row.id);
      sent += 1;
    } catch {
      await db.captures.update(row.id, { attempts: row.attempts + 1 });
    }
  }

  return sent;
}

async function sendCapture(client: BotvyClient, row: CaptureRow): Promise<void> {
  if (row.kind === 'link') {
    await client.command('/links', { id: row.id, url: row.url }, row.id);
    return;
  }

  if (row.kind === 'reminder') {
    /*
     * An hour from the capture, because a reminder needs a moment and the
     * member gave none.
     *
     * The alternative was to refuse the capture without a time, which turns a
     * one-click action into a form — and the panel's Add form is where a member
     * who wants a specific time already goes. An hour is late enough not to
     * fire while they are still reading and near enough to be about the thing
     * they were reading.
     */
    const remindAt =
      row.remindAt ??
      new Date(
        new Date(row.capturedAt).getTime() + 60 * 60 * 1000,
      ).toISOString();
    await client.command(
      '/reminders',
      { id: row.id, title: row.title, remindAt, notes: row.notes },
      row.id,
    );
    return;
  }

  await client.command(
    '/tasks',
    { id: row.id, title: row.title, notes: row.notes },
    row.id,
  );
}
