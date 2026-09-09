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
}
