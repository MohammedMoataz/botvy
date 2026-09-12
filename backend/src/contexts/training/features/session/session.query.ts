import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { SessionRepository } from '../../domain/training.repositories.js';
import { sessionView, type SessionView } from '../sessions/sessions.query.js';

/**
 * One session by id, for the detail screen, the logger and the editor.
 *
 * Scoped by `userId` **in** the repository call and not filtered afterwards.
 * That is the rule the write side learned the hard way: `MongoRepositoryBase`
 * carried `{ _id, updatedAt }` as its filter and a `/sync` push naming another
 * member's id matched their row. A read that finds the row and then compares
 * owners is a read that has already loaded somebody else's session into this
 * process, and the next person to refactor it will drop the comparison.
 *
 * Returns null for a session that does not exist, one this member does not own,
 * and one they have deleted alike. The three are one answer to a client: "not on
 * this screen". The Deleted view is served from the sync channel's tombstones,
 * which is the only reader that wants to see a deleted row.
 */
@Injectable()
export class SessionQueryHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly member: MemberContextPort,
  ) {}

  async byId(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<SessionView | null> {
    const session = await this.sessions.findById(userId, id);
    if (!session || session.isDeleted) return null;

    const { timezone } = await this.member.clock(userId);
    return sessionView(session, timezone, now);
  }
}
