import { Injectable } from '@nestjs/common';
import { MembersQueryHandler } from '../../identity/features/admin-members/members.query.js';
import { ActorLabelPort } from '../features/audit/audit.query.js';

/**
 * Putting a name to the principal on an audit row.
 *
 * `infrastructure/` is the one layer allowed to know another context exists,
 * and this binds a local port to Identity's **published query handler** — not
 * to its repository and not to a feature service, which is the violation even
 * in the permitted direction.
 *
 * Only member principals resolve. A service client's id comes back unmapped and
 * the page falls back to the id, which is honest: `service_clients` is a small
 * fixed set — n8n and whatever else an operator adds — and the trail already
 * records `actorType: 'service'` beside it, so the row reads "service" and an
 * id rather than pretending to a name it does not have.
 */
@Injectable()
export class IdentityActorLabels extends ActorLabelPort {
  constructor(private readonly members: MembersQueryHandler) {
    super();
  }

  async labelsFor(ids: string[]): Promise<Record<string, string>> {
    return this.members.labelsFor(ids);
  }
}
