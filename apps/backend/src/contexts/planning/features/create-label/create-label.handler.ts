import { Injectable } from '@nestjs/common';
import { isUuid } from '../../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import { Label } from '../../domain/label.aggregate.js';
import { LabelRepository } from '../../domain/label.repository.js';

export class DuplicateLabelName extends Error {
  /**
   * `labelName`, not `name` — `Error.name` already exists and holds the error
   * class's own name. Shadowing it would make this error identify itself as
   * "Work" in every log line that prints `error.name`.
   */
  constructor(readonly labelName: string) {
    super(`you already have a label called "${labelName}"`);
  }
}

export class InvalidLabelId extends Error {
  constructor(id: string) {
    super(
      `"${id}" is not a UUID. The client mints the id, and it has to be a UUIDv7.`,
    );
  }
}

export interface CreateLabelCommand {
  id: string;
  name: string;
  /** Omitted takes the next palette colour. Any `#rrggbb` is accepted. */
  color?: string;
  sortOrder?: number;
}

/**
 * A new label.
 *
 * Two things here are worth the words.
 *
 * **The colour comes from the registry, never from a literal.** A hard-coded
 * default is a bug by constitution XII: `labels.palette` is an operator knob,
 * and the picker on every surface offers exactly what that key holds. Reading
 * it here means an operator who changes the palette changes what a new label
 * gets, without a deploy and without this file knowing which colours exist.
 *
 * **Uniqueness is checked twice, on purpose.** The read below is what produces
 * a sentence the member can act on — "you already have a label called Work" —
 * and the partial unique index from T200 is what makes the rule *true*. Two
 * devices creating "Work" in the same second both pass the read and one loses
 * at the write; that path is caught below and answered with the same error, so
 * the member sees one message whichever way the collision happened. Dropping
 * either half would leave a friendly message with no guarantee, or a guarantee
 * that surfaces as `E11000 duplicate key`.
 */
@Injectable()
export class CreateLabelHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly labels: LabelRepository,
    private readonly settings: SettingsService,
  ) {}

  async handle(
    userId: string,
    command: CreateLabelCommand,
  ): Promise<{ id: string; updatedAt: Date; replayed: boolean }> {
    if (!isUuid(command.id)) throw new InvalidLabelId(command.id);

    // The same replay rule tasks have, for the same reason: the client minted
    // the id offline and may well send it twice.
    const existing = await this.labels.findById(userId, command.id);
    if (existing)
      return { id: existing.id, updatedAt: existing.updatedAt, replayed: true };

    const clash = await this.labels.findByName(userId, command.name);
    if (clash) throw new DuplicateLabelName(command.name);

    const mine = await this.labels.findAll(userId);
    const color =
      command.color ??
      (await this.nextPaletteColour(mine.map((label) => label.color)));

    const now = new Date();
    const label = Label.create({
      id: command.id,
      userId,
      name: command.name,
      color,
      // Appended by default, so a member's own ordering is not disturbed by a
      // label arriving from the chat or the extension.
      sortOrder: command.sortOrder ?? mine.length,
      createdAt: now,
    });

    try {
      await this.uow.run(() => this.labels.save(label));
    } catch (error) {
      if (isDuplicateKey(error)) throw new DuplicateLabelName(command.name);
      throw error;
    }

    return { id: label.id, updatedAt: label.updatedAt, replayed: false };
  }

  /**
   * The first palette colour this member is not already using, and the palette's
   * own first colour once they have used them all.
   *
   * Cycling rather than refusing: a member with thirteen labels and a
   * twelve-colour palette should get a label, not an error about colours.
   */
  private async nextPaletteColour(used: string[]): Promise<string> {
    const palette = await this.settings.get('labels.palette');
    const taken = new Set(used.map((colour) => colour.toLowerCase()));
    return (
      palette.find((colour) => !taken.has(colour.toLowerCase())) ?? palette[0]!
    );
  }
}

/**
 * Both stores' way of saying it. Mongo's driver sets `code` 11000; the
 * in-memory adapter raises the same shape so a handler spec exercises this
 * branch rather than only the friendly read above.
 */
function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11_000
  );
}
