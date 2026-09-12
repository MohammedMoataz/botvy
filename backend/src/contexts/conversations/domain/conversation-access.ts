import type { Conversation } from './conversation.aggregate.js';
import type { ConversationRepository } from './conversations.repositories.js';

/**
 * "There is no such conversation of yours", and that is the *only* thing it
 * ever says.
 *
 * ## Why one error for two situations, and why the endpoint answers 403
 *
 * FR-020: a request naming somebody else's conversation is refused **without
 * revealing anything about it**. The difference between `404 not_found` and
 * `403 forbidden` is exactly the bit an attacker wants — walk a list of ids,
 * and the one that answers "forbidden" while the rest answer "not found" is a
 * conversation that exists and whose owner you now know something about.
 *
 * So both answers are `forbidden`, and they are indistinguishable *by
 * construction* rather than by a controller remembering to flatten them: every
 * read in this context goes through `ConversationRepository.findById(userId,
 * id)`, which filters on the owner in both adapters. A conversation belonging
 * to another member and a conversation that never existed both come back null,
 * and there is nowhere in the code that holds the information needed to tell
 * them apart. That is deliberate and it must stay that way — a "does this id
 * exist anywhere" lookup added for a friendlier message would recreate the
 * oracle in the same breath as the message.
 *
 * The message carries no id either. Echoing the id back is harmless on its own,
 * but it is how a log or an error-reporting screen ends up holding a list of
 * ids somebody probed with.
 */
export class ConversationForbidden extends Error {
  constructor() {
    super('No such conversation.');
    this.name = 'ConversationForbidden';
  }
}

/**
 * The client is editing a version of the row that has moved on.
 *
 * `contracts/rest-commands.md` gives `PATCH /conversations/:id` a
 * `baseUpdatedAt`, and this is what that field buys: the member renamed the
 * chat on their phone while a browser tab had the old title in a text box, and
 * the tab's save must not silently win. It is `stale` and a 409 — the same
 * vocabulary `contracts/sync.md` uses, because the phone already branches on
 * that word and two names for one verdict is one more thing to translate at an
 * edge.
 *
 * Distinct from `ProtectedConversationError`, and the distinction matters in
 * the direction that bites: a protected row must **never** be reported as
 * stale, because a stale verdict tells a client to take the server's copy and
 * retry — and against a rule that will never accept the write, it retries for
 * ever. `conversation.aggregate.ts` says the same thing about the sync path.
 */
export class ConversationStale extends Error {
  constructor(readonly serverUpdatedAt: Date) {
    super('This conversation has changed since you loaded it.');
    this.name = 'ConversationStale';
  }
}

/**
 * Loads one of the member's own conversations, or refuses.
 *
 * A function rather than six copies of the same three lines in six handlers.
 * The constitution's rule is that a helper is duplicated until the third copy —
 * this is the sixth on the day it is written, and every one of them is the
 * ownership check FR-020 turns on, which is not a check to have six versions
 * of. It stays inside this context's `domain/`: it takes the port, not a store,
 * and it knows nothing another slice does not.
 *
 * Tombstoned rows are refused too, and by the same error. A conversation the
 * member deleted is not one they can rename, pin or clear, and answering
 * `forbidden` rather than "it is deleted" keeps the one-answer rule above
 * intact — a deleted chat is exactly the sort of row a probe would like
 * confirmation of.
 *
 * `expectedUpdatedAt` is the optional `baseUpdatedAt` from the request. Absent
 * means the caller is not claiming to have a particular version and no clock is
 * consulted at all, which is the same shape as the sync conflict rule's fast
 * path: only a client that *says* which version it held has its claim checked.
 */
export async function loadOwn(
  conversations: ConversationRepository,
  userId: string,
  id: string,
  expectedUpdatedAt?: Date | null,
): Promise<Conversation> {
  const conversation = await conversations.findById(userId, id);
  if (!conversation || conversation.deletedAt !== null) {
    throw new ConversationForbidden();
  }
  if (
    expectedUpdatedAt &&
    conversation.updatedAt.getTime() !== expectedUpdatedAt.getTime()
  ) {
    throw new ConversationStale(conversation.updatedAt);
  }
  return conversation;
}
