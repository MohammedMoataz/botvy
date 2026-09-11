import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Scopes, ServiceOnly } from '../../../../shared/auth/decorators.js';
import { IngestLinkSaga, type DrainResult } from './ingest-link.saga.js';

/**
 * The reading pipeline, as routes only a machine may call.
 *
 * `ServiceOnly` rather than a role check, for the reason every sibling in this
 * codebase states: these are not "an administrator's endpoints", they are
 * endpoints no *person* has any business calling. A member's JWT is refused
 * whatever their role, by the `KindGuard`, before this class is constructed.
 *
 * `internal:ingest` is the scope `contracts/internal.md` gives this job and the
 * one `service-client-seed.service.ts` already grants n8n — a service token is
 * not a master key.
 *
 * ## Two routes where the contract names one
 *
 * `contracts/internal.md` lists only `POST /internal/knowledge/ingest/:linkId`,
 * "re-run the ingestion pipeline for one link regardless of state". That is the
 * Owner's override and it is here unchanged.
 *
 * The bare `POST /internal/knowledge/ingest` is new in this phase, and it is
 * not a convenience. Two requirements written after that contract need a
 * *periodic* pass: FR-016, because a link left mid-pipeline by a killed worker
 * has to come back on its own, and FR-017, because a job that stops running
 * must be visible — and a heartbeat only exists if something stamps it. There
 * is nothing for a per-link route to stamp. The contract is corrected in the
 * same change rather than left to disagree with the code.
 */
@Controller('internal/knowledge')
@ServiceOnly()
@Scopes('internal:ingest')
export class InternalIngestController {
  constructor(private readonly ingest: IngestLinkSaga) {}

  /**
   * One pass: return what a dead worker left behind, then read what is waiting.
   *
   * Returns the counts rather than an ack, because n8n's workflow logs the
   * response and that log is the only record of what a pass did. A bare
   * `{ ok: true }` would make "nothing was waiting" and "read forty links and
   * recovered three" the same line.
   */
  @Post('ingest')
  @HttpCode(200)
  async drain(): Promise<DrainResult> {
    return this.ingest.drain();
  }

  /** The Owner's re-run of one link, whatever state it is in. */
  @Post('ingest/:linkId')
  @HttpCode(200)
  async one(@Param('linkId') linkId: string): Promise<{ status: string }> {
    return { status: await this.ingest.ingestOne(linkId) };
  }
}
