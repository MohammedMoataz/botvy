import {
  ProposalRepository,
  type Proposal,
} from '../domain/proposal.repository.js';

/** The specs' proposal store. Copies on the way in and out, like a real store. */
export class InMemoryProposalRepository extends ProposalRepository {
  readonly rows = new Map<string, Proposal>();

  async create(proposal: Proposal): Promise<void> {
    this.rows.set(proposal.id, structuredClone(proposal));
  }

  async find(userId: string, id: string): Promise<Proposal | null> {
    const row = this.rows.get(id);
    return row && row.userId === userId ? structuredClone(row) : null;
  }

  async claim(userId: string, id: string, now: Date): Promise<Proposal | null> {
    return this.move(userId, id, now, 'applied');
  }

  async decline(
    userId: string,
    id: string,
    now: Date,
  ): Promise<Proposal | null> {
    return this.move(userId, id, now, 'declined');
  }

  async openIn(
    userId: string,
    conversationId: string,
    now: Date,
  ): Promise<Proposal | null> {
    const open = [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId &&
          row.conversationId === conversationId &&
          row.status === 'open' &&
          row.expiresAt.getTime() > now.getTime(),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return open[0] ? structuredClone(open[0]) : null;
  }

  async removeAllFor(userId: string): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(id);
        removed++;
      }
    }
    return removed;
  }

  private move(
    userId: string,
    id: string,
    now: Date,
    status: 'applied' | 'declined',
  ): Proposal | null {
    const row = this.rows.get(id);
    if (
      !row ||
      row.userId !== userId ||
      row.status !== 'open' ||
      row.expiresAt.getTime() <= now.getTime()
    ) {
      return null;
    }
    row.status = status;
    row.updatedAt = now;
    return structuredClone(row);
  }
}
