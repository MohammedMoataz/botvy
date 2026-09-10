import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { MeetingRepository } from '../../domain/meetings.repositories.js';
import { meetingView, type MeetingView } from '../meetings/meetings.query.js';

/**
 * One meeting by id, for the detail screen and the editor.
 *
 * Scoped by `userId` in the repository call and not filtered afterwards. That
 * is the same rule the write side learned the hard way: `MongoRepositoryBase`
 * carried `{ _id, updatedAt }` as its filter and a push naming another
 * member's id matched their row, so the guard has to be *in* the query rather
 * than in a check after it. Here it costs nothing to get right — a read that
 * finds the row and then compares owners is a read that has already loaded
 * somebody else's meeting into this process.
 *
 * Returns null for a meeting that does not exist, one this member does not
 * own, and one they have deleted alike. The three are one answer to a client:
 * "not on this screen". The Deleted view is served from the sync channel's
 * tombstones, which is the only reader that wants to see a deleted row.
 */
@Injectable()
export class MeetingQueryHandler {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly member: MemberContextPort,
  ) {}

  async byId(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<MeetingView | null> {
    const meeting = await this.meetings.findById(userId, id);
    if (!meeting || meeting.isDeleted) return null;

    const { timezone } = await this.member.clock(userId);
    return meetingView(meeting, timezone, now);
  }
}
