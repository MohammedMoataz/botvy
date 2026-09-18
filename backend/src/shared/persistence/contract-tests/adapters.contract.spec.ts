import { describe } from 'vitest';
import { InMemoryRepositoryBase } from '../memory/in-memory-repository.base.js';
import { InMemoryUnitOfWork } from '../memory/in-memory-unit-of-work.js';
import {
  describeRepositoryContract,
  Widget,
  type AdapterUnderTest,
} from './repository.contract.js';

/**
 * The same suite, run against every adapter set.
 *
 * The in-memory adapter runs everywhere, including a laptop with nothing
 * installed. The Mongo and Prisma adapters need their stores, so they run when
 * the environment names one — in CI that is a service container, and locally it
 * is the compose stack. They are skipped rather than faked: a contract test
 * that quietly stops exercising the real driver is worse than no contract test,
 * because it still reports green.
 */
class InMemoryWidgetRepository extends InMemoryRepositoryBase<Widget> {}

const inMemory: AdapterUnderTest = {
  name: 'in-memory',
  async make() {
    const uow = new InMemoryUnitOfWork();
    const repository = new InMemoryWidgetRepository(uow);
    return {
      repository,
      uow,
      async capturedEvents() {
        return uow.events.map((event) => ({
          name: event.name,
          eventId: event.eventId,
        }));
      },
    };
  },
};

describe('repository contract', () => {
  describeRepositoryContract(inMemory);
});

/*
 * The store-backed halves are **not written yet**, and `todo` is how that is
 * said out loud.
 *
 * They were declared as `describe.skipIf(!process.env.MONGO_URL)` with an empty
 * body and a comment describing what would go in it. Locally that reads as two
 * skipped suites, which is what everyone saw. CI sets `MONGO_URL` and
 * `DATABASE_URL` on purpose — so that these run here rather than skipping — and
 * an empty suite that is *not* skipped is a vitest error:
 *
 *     Error: No test found in suite repository contract (mongo)
 *
 * So the backend job failed on every run since the job was written, for a
 * placeholder, while all 1612 real tests passed. A skip that turns into a
 * failure the moment somebody wires up the thing it was waiting for is worse
 * than either a test or nothing.
 *
 * `todo` reports them as outstanding in every run, on a developer's machine and
 * in CI alike, and fails neither. When the adapters are bound into a test
 * module, these become `describe(...)` with `describeRepositoryContract` inside,
 * exactly as the in-memory one above — the suite itself does not change, which
 * was always the point of writing it as a shared contract.
 */
describe.todo('repository contract (mongo)');

describe.todo('repository contract (prisma)');
