import { Injectable } from '@nestjs/common';
import {
  UserRepository,
  type MemberPage,
  type MemberSearch,
} from '../../domain/user.repository.js';

/**
 * The admin members listing, and the `me` view.
 *
 * A query handler rather than the controller reaching for the repository, so
 * the read side has somewhere to live when the portal wants the same answer
 * through GraphQL — and so the search's defaults are stated once.
 */
@Injectable()
export class MembersQueryHandler {
  constructor(private readonly users: UserRepository) {}

  async search(criteria: MemberSearch): Promise<MemberPage> {
    return this.users.search(criteria);
  }

  /**
   * Names for a handful of member ids (P10, FR-005).
   *
   * Identity's published answer to "who is this", for the audit page, which
   * holds principal ids and no names — `audit_log` stores the principal as it
   * was and nothing else, deliberately, because a stored name goes stale the
   * moment somebody changes their address.
   *
   * One call for a page rather than one per row, and deleted members included:
   * their acts stay in the trail, and an id is the fallback rather than the
   * answer.
   */
  async labelsFor(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    return this.users.labelsByIds(ids);
  }
}
