import { Injectable } from '@nestjs/common';
import type { Principal } from '../../../../shared/auth/principal.js';
import { newId } from '../../../../shared/cqrs/ids.js';
import type { CommandAck } from '../../../../shared/cqrs/result.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { Ping, PingRepository } from '../../domain/ping.aggregate.js';

export interface PingCommand {
  principal: Principal;
  /** Minted by the client, so a retry after a dropped connection is the same ping. */
  clientId: string;
}

/**
 * One transaction: create the ping, and let the repository write the event
 * beside it in the same session. The event never reaches anyone if the write
 * rolls back, and the write is never committed without its event.
 */
@Injectable()
export class PingHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly pings: PingRepository,
  ) {}

  async handle(command: PingCommand): Promise<CommandAck> {
    const userId = command.principal.id;

    return this.uow.run(async () => {
      // The unique index would refuse the second write anyway; asking first
      // means a repeat is an ordinary answer rather than a caught error.
      const existing = await this.pings.findByClientId(userId, command.clientId);
      if (existing) {
        return { id: existing.id, updatedAt: existing.updatedAt };
      }

      const ping = Ping.create(newId(), userId, command.clientId);
      await this.pings.save(ping);
      return { id: ping.id, updatedAt: ping.updatedAt };
    });
  }
}
