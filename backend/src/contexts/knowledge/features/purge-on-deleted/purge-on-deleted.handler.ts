import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  LinkRepository,
  ReadingRepository,
  SuggestionRepository,
} from '../../domain/knowledge.repositories.js';

/**
 * Removes everything a deleted member ever saved to read (T753).
 *
 * Reacts to `identity.UserDeleted`, which crosses two stores — Identity is on
 * PostgreSQL and this context is on MongoDB, so no transaction can span them
 * and the event is the only way across. The shape is the fifth copy of the same
 * handler, deliberately identical to Meetings' and Training's: a member asking
 * to be erased should not be erased differently depending on which collection
 * they are in.
 *
 * **Hard deletes, not tombstones.** A tombstone exists to tell the member's
 * other devices about a deletion and to fill the Deleted view; neither reason
 * survives the account going away.
 *
 * **`knowledge_docs` is the one that matters most here.** It is the only place
 * in this platform that holds text fetched from somebody else's server on a
 * member's behalf — whole articles, whole transcripts. It is invisible to every
 * screen and to `/sync`, which is exactly why a purge that forgot it would be
 * invisible too. That is E-005's argument in its most literal form: a context
 * added to this table late leaves a deleted member's data on disk for ever, and
 * nothing fails.
 *
 * Idempotent, because the relay delivers at least once: two deliveries collapse
 * to one purge and the second reports nothing rather than failing.
 */
@Injectable()
export class KnowledgePurgeOnDeletedHandler {
  private readonly logger = new Logger(KnowledgePurgeOnDeletedHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
    private readonly readings: ReadingRepository,
    private readonly suggestions: SuggestionRepository,
  ) {}

  async handle(event: DomainEvent): Promise<'purged' | 'nothing-to-do'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to purge`,
      );
      return 'nothing-to-do';
    }

    /*
     * The documents first, then the suggestions, then the links.
     *
     * The links last is the same reasoning Training's handler gives for the
     * athlete profile: they are the index of everything else, so a pass that
     * fails half way through leaves them as the record of what still needs
     * clearing, and the next delivery finishes the job. Erasing the index first
     * would leave orphaned documents that nothing could ever find again.
     */
    const counts = await this.uow.run(async () => {
      const documents = await this.readings.removeAllFor(userId);
      const suggestions = await this.suggestions.removeAllFor(userId);
      const links = await this.links.removeAllFor(userId);
      return { documents, suggestions, links };
    });

    const total = counts.documents + counts.suggestions + counts.links;
    if (total === 0) return 'nothing-to-do';

    this.logger.log(
      `purged ${counts.links} link(s), ${counts.documents} document(s) and ` +
        `${counts.suggestions} suggestion(s) for ${userId}`,
    );
    return 'purged';
  }
}

/**
 * Erasing Knowledge's tombstones once they are past the horizon.
 *
 * Same slice-level distinction Training draws: this is neither the member's own
 * purge of one row nor a deleted account's everything, but a sweep over every
 * member's rows by *age*, run on a timer, reached through `TombstonePurgePort`.
 *
 * **It takes the documents with the links**, which the member's own delete
 * deliberately does not. A tombstone past the horizon is unrecoverable by
 * definition — the phone's full-snapshot rule reads the same key, so no device
 * can still be holding it — and keeping a sixty-thousand-character extraction
 * for a row nobody can restore is holding data for no reader.
 *
 * The horizon is `reminders.tombstoneDays`, passed in as a date by the sweep.
 * That the whole platform shares one key is load-bearing for the clients:
 * `/sync`'s full-snapshot rule reads the same value, and a per-context horizon
 * would make "how long may a device be away" a question with five answers.
 */
@Injectable()
export class PurgeKnowledgeTombstonesHandler {
  private readonly logger = new Logger(PurgeKnowledgeTombstonesHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
    private readonly readings: ReadingRepository,
  ) {}

  async purgeTombstones(before: Date, userId?: string): Promise<number> {
    return this.uow.run(async () => {
      // The ids are collected before the rows go, because `removeForLinks` has
      // nothing to match on afterwards. One extra read per sweep, against a
      // count that is zero on almost every run.
      const doomed = await this.links.tombstonesBefore(before, userId);
      if (doomed.length === 0) return 0;

      const byMember = new Map<string, string[]>();
      for (const link of doomed) {
        const held = byMember.get(link.userId) ?? [];
        held.push(link.id);
        byMember.set(link.userId, held);
      }

      let documents = 0;
      for (const [member, ids] of byMember) {
        documents += await this.readings.removeForLinks(member, ids);
      }
      const links = await this.links.purgeTombstonesBefore(before, userId);

      if (links > 0) {
        this.logger.log(
          `purged ${links} link(s) and ${documents} document(s) deleted before ${before.toISOString()}`,
        );
      }
      return links;
    });
  }
}
