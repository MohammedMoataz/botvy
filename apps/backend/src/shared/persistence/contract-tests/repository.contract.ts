import { expect, it } from 'vitest';
import { AggregateRoot } from '../ports/aggregate-root.js';
import { StaleWriteError } from '../ports/errors.js';
import type { Repository } from '../ports/repository.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';

/** The aggregate every adapter is exercised with. */
export class Widget extends AggregateRoot<string> {
  constructor(
    readonly id: string,
    readonly userId: string,
    public label: string,
  ) {
    super();
  }

  static create(id: string, userId: string, label: string): Widget {
    const widget = new Widget(id, userId, label);
    widget.raise('operations.Pinged', 'widget', { label });
    return widget;
  }

  rename(label: string, at: Date): void {
    this.label = label;
    this.updatedAt = at;
    this.raise('operations.Pinged', 'widget', { label }, at);
  }
}

export interface AdapterUnderTest {
  name: string;
  /** A fresh, empty repository plus the unit of work it belongs to. */
  make(): Promise<{
    repository: Repository<Widget>;
    uow: UnitOfWork;
    /** Every event the adapter captured during this test. */
    capturedEvents(): Promise<Array<{ name: string; eventId: string }>>;
    dispose?(): Promise<void>;
  }>;
}

/**
 * One suite, run against every adapter.
 *
 * This is what makes the repository port worth having. A handler is written
 * once and bound to whichever store its context owns, and it may only be
 * trusted to behave the same way if the adapters actually do. Anything asserted
 * here is a promise the port makes; anything an adapter does differently is a
 * place a handler could behave differently in production than in its own spec.
 */
export function describeRepositoryContract(adapter: AdapterUnderTest): void {
  it(`${adapter.name}: stores an aggregate and reads it back for its own member`, async () => {
    const { repository, uow, dispose } = await adapter.make();
    try {
      await uow.run(async () => {
        await repository.save(Widget.create('w-1', 'user-1', 'first'));
      });

      const found = await repository.findById('user-1', 'w-1');
      expect(found?.label).toBe('first');
    } finally {
      await dispose?.();
    }
  });

  it(`${adapter.name}: answers null for another member's row, not the row`, async () => {
    const { repository, uow, dispose } = await adapter.make();
    try {
      await uow.run(async () => {
        await repository.save(Widget.create('w-1', 'user-1', 'first'));
      });

      expect(await repository.findById('user-2', 'w-1')).toBeNull();
    } finally {
      await dispose?.();
    }
  });

  it(`${adapter.name}: answers null for something that was never stored`, async () => {
    const { repository, dispose } = await adapter.make();
    try {
      expect(await repository.findById('user-1', 'missing')).toBeNull();
    } finally {
      await dispose?.();
    }
  });

  it(`${adapter.name}: captures the events raised, exactly once`, async () => {
    const { repository, uow, capturedEvents, dispose } = await adapter.make();
    try {
      await uow.run(async () => {
        await repository.save(Widget.create('w-1', 'user-1', 'first'));
      });

      const events = await capturedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.name).toBe('operations.Pinged');
    } finally {
      await dispose?.();
    }
  });

  it(`${adapter.name}: saving with nothing raised captures no events`, async () => {
    const { repository, uow, capturedEvents, dispose } = await adapter.make();
    try {
      const widget = Widget.create('w-1', 'user-1', 'first');
      widget.pullEvents(); // drain, as if already published

      await uow.run(async () => {
        await repository.save(widget);
      });

      expect(await capturedEvents()).toHaveLength(0);
    } finally {
      await dispose?.();
    }
  });

  it(`${adapter.name}: an update replaces the row rather than adding one`, async () => {
    const { repository, uow, dispose } = await adapter.make();
    try {
      const widget = Widget.create('w-1', 'user-1', 'first');
      await uow.run(async () => {
        await repository.save(widget);
      });

      const later = new Date(widget.updatedAt.getTime() + 1_000);
      widget.rename('second', later);
      await uow.run(async () => {
        await repository.save(widget);
      });

      expect((await repository.findById('user-1', 'w-1'))?.label).toBe('second');
    } finally {
      await dispose?.();
    }
  });

  /**
   * The optimistic check. Two devices editing the same row offline is the
   * ordinary case here, and a save that silently overwrote a newer row would
   * lose whichever edit happened to arrive second.
   */
  it(`${adapter.name}: refuses a write older than the stored row`, async () => {
    const { repository, uow, dispose } = await adapter.make();
    try {
      const widget = Widget.create('w-1', 'user-1', 'first');
      const now = new Date();
      widget.updatedAt = now;
      await uow.run(async () => {
        await repository.save(widget);
      });

      const stale = new Widget('w-1', 'user-1', 'from an older device');
      stale.updatedAt = new Date(now.getTime() - 60_000);

      await expect(
        uow.run(async () => {
          await repository.save(stale);
        }),
      ).rejects.toBeInstanceOf(StaleWriteError);

      expect((await repository.findById('user-1', 'w-1'))?.label).toBe('first');
    } finally {
      await dispose?.();
    }
  });

  it(`${adapter.name}: removes an aggregate`, async () => {
    const { repository, uow, dispose } = await adapter.make();
    try {
      const widget = Widget.create('w-1', 'user-1', 'first');
      await uow.run(async () => {
        await repository.save(widget);
      });
      await uow.run(async () => {
        await repository.remove(widget);
      });

      expect(await repository.findById('user-1', 'w-1')).toBeNull();
    } finally {
      await dispose?.();
    }
  });

  /**
   * A failed transaction must leave neither the row nor its event. An event for
   * a change that did not commit is precisely what the outbox exists to
   * prevent.
   */
  it(`${adapter.name}: a rollback leaves neither the row nor its event`, async () => {
    const { repository, uow, capturedEvents, dispose } = await adapter.make();
    try {
      await expect(
        uow.run(async () => {
          await repository.save(Widget.create('w-1', 'user-1', 'first'));
          throw new Error('handler failed after the save');
        }),
      ).rejects.toThrow('handler failed after the save');

      expect(await repository.findById('user-1', 'w-1')).toBeNull();
      expect(await capturedEvents()).toHaveLength(0);
    } finally {
      await dispose?.();
    }
  });

  it(`${adapter.name}: a nested run joins the outer transaction`, async () => {
    const { repository, uow, dispose } = await adapter.make();
    try {
      await expect(
        uow.run(async () => {
          await repository.save(Widget.create('w-1', 'user-1', 'first'));
          await uow.run(async () => {
            await repository.save(Widget.create('w-2', 'user-1', 'second'));
          });
          throw new Error('outer failed');
        }),
      ).rejects.toThrow('outer failed');

      // The inner save is rolled back with the outer one; had it opened its own
      // transaction it would have survived.
      expect(await repository.findById('user-1', 'w-2')).toBeNull();
    } finally {
      await dispose?.();
    }
  });
}
