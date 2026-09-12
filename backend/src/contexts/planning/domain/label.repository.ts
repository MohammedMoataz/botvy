import { SyncableRepository } from '../../../shared/persistence/ports/syncable-repository.js';
import type { Label } from './label.aggregate.js';

/**
 * Labels sync too — the phone renders them offline and lets the member create
 * one with no network — so this is the syncable port as well.
 *
 * `findByName` exists so a create can answer "you already have one called
 * Work" in the member's own words rather than letting the unique index throw a
 * duplicate-key error that has to be translated back into a sentence. The index
 * is still what *guarantees* it: two devices creating "Work" at the same instant
 * both pass this check and one of them loses at the write, which is the
 * difference between a friendly message and a correctness rule. Both are
 * wanted.
 */
export abstract class LabelRepository extends SyncableRepository<Label> {
  abstract findByName(userId: string, name: string): Promise<Label | null>;

  /** Every live label, for the list query and the palette's "already used". */
  abstract findAll(userId: string, includeDeleted?: boolean): Promise<Label[]>;

  abstract purgeTombstonesBefore(
    before: Date,
    userId?: string,
  ): Promise<number>;

  abstract removeAllFor(userId: string): Promise<number>;
}
