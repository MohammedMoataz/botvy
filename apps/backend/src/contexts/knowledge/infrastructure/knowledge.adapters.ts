import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import { AppendMessageHandler } from '../../conversations/features/append-message/append-message.handler.js';
import { ProfileQueryHandler } from '../../profile/features/profile-query/profile.query.js';
import {
  AiSuggestionsPort,
  KnowledgeTranscriptPort,
} from '../domain/knowledge.ports.js';

/**
 * Where this context is allowed to know another exists.
 *
 * `infrastructure/` is the one layer constitution IX exempts, because binding a
 * local port to somebody else's *published* surface is exactly its job — the
 * pattern P0 established with `admin-device.lookup.ts` and every phase since
 * has repeated. Nothing in `domain/` or `features/` imports any of this, and
 * `no-restricted-imports` refuses it anywhere else: `knowledge` was added to
 * that rule's pattern list in this phase, and the rule was probed by writing a
 * file that should fail and watching it do so.
 */

/**
 * Whether this member wants suggestions (FR-011, SC-003).
 *
 * `preferencesFor` rather than the preferences collection, and **never**
 * `SettingsService.get('defaults.aiSuggestions')` as the primary read. That key
 * seeds a `user_preferences` field, so reading the registry gives the
 * *installation* value and a member who turned suggestions off would keep
 * getting them — silently, because the two agree for everybody who has not
 * changed it. This is the fourth time this project has had that decision in
 * front of it, after the lead times in P2, the meeting duration in P5 and the
 * practice cut-off in P6, and the fourth identical adapter.
 *
 * Why the fourth copy still does not move to `shared/`: what would move is not
 * the logic — it is four lines — but a widened shared port, and
 * `MemberContextPort`'s own note asks that adding a field there feel like a
 * decision rather than a convenience, because every field widens what several
 * contexts can see of one. What could reasonably be shared one day is a
 * `MemberPreferencesPort` exposing the whole preferences view, and that is a
 * decision about coupling rather than about duplication. Recorded in
 * `enhancements/` rather than taken here.
 *
 * The fallback is the installation default, for a member whose preferences row
 * the registration bootstrap has not written yet. That window is real — the
 * relay is eventual — and a null would push a "what now" branch into a saga
 * whose whole job is to decide whether to do anything at all.
 */
@Injectable()
export class ProfileAiSuggestions extends AiSuggestionsPort {
  constructor(
    private readonly profiles: ProfileQueryHandler,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async enabledFor(userId: string): Promise<boolean> {
    const preferences = await this.profiles.preferencesFor(userId);
    return (
      preferences?.aiSuggestions ??
      (await this.settings.get('defaults.aiSuggestions'))
    );
  }
}

/**
 * The plain-reply fallback, written into the member's coach chat.
 *
 * Bound to Conversations' `append-message` command, exactly as the rhythm's
 * identical port is, and for the same reasons its comment gives: this context
 * does not open a message repository, does not know how a `seq` is issued, and
 * does not know the conversation's id — it hands over a sentence and
 * Conversations decides the rest. A second writer minting its own sequence
 * numbers would leave gaps, and a gap in that sequence is a message no device
 * will ever pull.
 *
 * The role is fixed to `assistant`. Nothing in Knowledge ever writes a member's
 * own turn.
 *
 * Used on **one** path: a suggestion draft that would not decode. The ordinary
 * path raises `knowledge.SuggestionReady` and lets Conversations write the
 * message from it — a context that both raised an event about a thing and also
 * wrote the message about it would give the member two.
 */
@Injectable()
export class ConversationsKnowledgeTranscript extends KnowledgeTranscriptPort {
  constructor(private readonly messages: AppendMessageHandler) {
    super();
  }

  async append(input: {
    userId: string;
    content: string;
    at: Date;
  }): Promise<{ seq: number } | null> {
    return this.messages.handle({
      userId: input.userId,
      kind: 'coach',
      role: 'assistant',
      content: input.content,
      at: input.at,
    });
  }
}
