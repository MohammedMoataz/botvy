import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import { Repository } from '../../../shared/persistence/ports/repository.js';

/**
 * The demonstration slice.
 *
 * It exists to prove the spine — command, transaction, outbox, relay, worker
 * handler, n8n — before any real context depends on it. Waiting for P2's first
 * task to be that proof would leave the outbox and relay untested for an entire
 * phase, and untested infrastructure is where the expensive bugs live.
 *
 * It is removed by the tasks phase once a real event travels the same path. No
 * task in this phase removes it, deliberately: the thing that proves the spine
 * should outlive the phase that built it.
 */
export class Ping extends AggregateRoot<string> {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly clientId: string,
    readonly at: Date,
  ) {
    super();
  }

  static create(id: string, userId: string, clientId: string, at: Date = new Date()): Ping {
    const ping = new Ping(id, userId, clientId, at);
    ping.updatedAt = at;
    ping.raise('operations.Pinged', 'ping', { pingId: id, clientId, at }, at);
    return ping;
  }

  static rehydrate(id: string, userId: string, clientId: string, at: Date, updatedAt: Date): Ping {
    const ping = new Ping(id, userId, clientId, at);
    ping.updatedAt = updatedAt;
    return ping;
  }
}

/**
 * Unique on member and client id, which is what makes a retried create a no-op
 * rather than a second row.
 */
export abstract class PingRepository extends Repository<Ping> {
  abstract findByClientId(userId: string, clientId: string): Promise<Ping | null>;
}
