import type { ChatAction, ItemChange, TargetItem } from './chat.ports.js';

/**
 * A change the chat has offered and the member has not yet answered (032).
 *
 * An edit, a cancel or a delete — and completing a meeting or a session — is
 * never carried out on the sentence alone. The executor finds the row, works
 * out the change, and stores it here; the member's Yes (a tap, or "yes" typed
 * in the same chat) applies it. The row the member is shown is the stored one,
 * so they confirm what will actually change rather than what the model
 * understood.
 *
 * `item` is the row **as it was when proposed**. Applying re-reads it and
 * refuses if it moved since — another device edited it, or the reminder
 * fired — because a Yes given to "move Dentist from 17:00" is not a Yes to
 * moving a meeting somebody has since put at 15:00.
 */
export interface Proposal {
  id: string;
  userId: string;
  conversationId: string;
  action: ChatAction;
  item: TargetItem;
  change: ItemChange;
  /** Which language the confirmation is answered in, decided when proposed. */
  arabic: boolean;
  /** The member's zone when proposed, for rendering the confirmation's times. */
  timezone: string;
  status: 'open' | 'applied' | 'declined';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class ProposalRepository {
  abstract create(proposal: Proposal): Promise<void>;

  /** Scoped to the member, so a foreign id and a missing one look the same. */
  abstract find(userId: string, id: string): Promise<Proposal | null>;

  /**
   * Open → applied, atomically, if it is still open and unexpired.
   *
   * The claim comes **before** the write, the same rule the alert sweep and the
   * rhythm's claim dates follow: two taps, or a tap and a typed "yes", must not
   * apply one change twice. The loser gets null.
   */
  abstract claim(
    userId: string,
    id: string,
    now: Date,
  ): Promise<Proposal | null>;

  /** Open → declined. Null when it was not open. */
  abstract decline(
    userId: string,
    id: string,
    now: Date,
  ): Promise<Proposal | null>;

  /** The newest open, unexpired proposal in a conversation, for a typed answer. */
  abstract openIn(
    userId: string,
    conversationId: string,
    now: Date,
  ): Promise<Proposal | null>;

  /** Account deletion. */
  abstract removeAllFor(userId: string): Promise<number>;
}
