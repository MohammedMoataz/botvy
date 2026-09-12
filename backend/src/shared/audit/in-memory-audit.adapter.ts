import { Injectable } from '@nestjs/common';
import { AuditPort, type AuditEntry } from './audit.port.js';

/**
 * The audit adapter specs bind.
 *
 * Beside the port rather than in Operations' `infrastructure/`, for the same
 * reason `in-memory-settings.store.ts` sits beside the settings store: four
 * spec files in three contexts construct it, and each of them was importing it
 * across a context boundary to get a test double for a shared-kernel port.
 */
@Injectable()
export class InMemoryAuditAdapter extends AuditPort {
  readonly entries: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
