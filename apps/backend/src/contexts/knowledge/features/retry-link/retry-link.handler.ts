import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import { LinkRepository } from '../../domain/knowledge.repositories.js';
import type { LinkStatus } from '../../domain/link.aggregate.js';
import { LinkNotFound } from '../remove-link/remove-link.handler.js';

export interface RetryLinkResult {
  id: string;
  status: LinkStatus;
  attempts: number;
}

/**
 * "Try that one again" (FR-003, FR-004).
 *
 * The aggregate owns both rules — only a `failed` link may be retried, and only
 * while `attempts` is below `knowledge.maxAttempts` — so this handler's whole
 * job is to fetch the ceiling from the registry and hand it over. That split is
 * the point: the limit is an operator knob and a domain rule is not a place to
 * read settings from, but "how many times is too many" is a question about
 * links rather than about HTTP.
 *
 * The same handler serves the member's own Retry and the Owner's
 * `POST /admin/knowledge/:linkId/retry`, because they are the same act. What
 * differs is who may ask, and that is the controller's business.
 */
@Injectable()
export class RetryLinkHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
    private readonly settings: SettingsService,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<RetryLinkResult> {
    const link = await this.links.findById(userId, id);
    if (!link) throw new LinkNotFound(id);

    const maxAttempts = await this.settings.get('knowledge.maxAttempts');
    link.retry(maxAttempts, at);

    await this.uow.run(() => this.links.save(link));
    return { id: link.id, status: link.status, attempts: link.attempts };
  }
}
