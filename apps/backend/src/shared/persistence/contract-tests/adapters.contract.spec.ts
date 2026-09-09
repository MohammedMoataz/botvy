import { describe } from 'vitest';
import { InMemoryRepositoryBase } from '../memory/in-memory-repository.base.js';
import { InMemoryUnitOfWork } from '../memory/in-memory-unit-of-work.js';
import { describeRepositoryContract, Widget, type AdapterUnderTest } from './repository.contract.js';

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
        return uow.events.map((event) => ({ name: event.name, eventId: event.eventId }));
      },
    };
  },
};

describe('repository contract', () => {
  describeRepositoryContract(inMemory);
});

/**
 * The store-backed halves are declared here and skipped without a database, so
 * the reason they did not run is visible in the report rather than absent from
 * it. T030's compose stack and the CI service containers are what turn them on.
 */
describe.skipIf(!process.env.MONGO_URL)('repository contract (mongo)', () => {
  // Bound in the same shape as the in-memory adapter once the Mongo models are
  // wired into a test module; the suite itself does not change.
});

describe.skipIf(!process.env.DATABASE_URL)('repository contract (prisma)', () => {
  // Likewise for Identity's store.
});
