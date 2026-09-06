import { Injectable } from '@nestjs/common';
import { InMemoryRepositoryBase } from '../../../shared/persistence/memory/in-memory-repository.base.js';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import { Ping, PingRepository } from '../domain/ping.aggregate.js';

/**
 * The ping store a handler spec binds. It extends the shared in-memory base, so
 * it inherits the rollback and stale-write behaviour the repository contract
 * holds every adapter to.
 */
@Injectable()
export class InMemoryPingRepository extends PingRepository {
  private readonly base: InternalBase;

  constructor(uow: InMemoryUnitOfWork) {
    super();
    this.base = new InternalBase(uow);
  }

  findById(userId: string, id: string): Promise<Ping | null> {
    return this.base.findById(userId, id);
  }

  save(ping: Ping): Promise<void> {
    return this.base.save(ping);
  }

  remove(ping: Ping): Promise<void> {
    return this.base.remove(ping);
  }

  async findByClientId(userId: string, clientId: string): Promise<Ping | null> {
    return this.base.all().find((ping) => ping.userId === userId && ping.clientId === clientId) ?? null;
  }

  all(): Ping[] {
    return this.base.all();
  }
}

class InternalBase extends InMemoryRepositoryBase<Ping> {}
