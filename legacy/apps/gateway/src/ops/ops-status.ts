import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The scheduled jobs run in n8n, not in this process, so "nothing has swept
 * for a while" is the only signal that the n8n → gateway path is broken. It
 * once was, silently, for days. Both /health and the admin dashboard read it.
 */
const STALE_AFTER_MS = 15 * 60_000; // sweep ticks every 5 minutes

export interface OpsStatus {
  lastSweepAt: string | null;
  sweepStale: boolean;
  lastCoachingTickAt: string | null;
  coachingTickStale: boolean;
}

function readAt(value: unknown): string | null {
  if (value && typeof value === 'object' && 'at' in value) {
    const at = (value as { at?: unknown }).at;
    if (typeof at === 'string') return at;
  }
  return null;
}

function isStale(at: string | null, now: Date): boolean {
  if (!at) return true;
  const parsed = Date.parse(at);
  return Number.isNaN(parsed) || now.getTime() - parsed > STALE_AFTER_MS;
}

export async function opsStatus(prisma: PrismaService, now: Date = new Date()): Promise<OpsStatus> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['ops.lastSweepAt', 'ops.lastCoachingTickAt'] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const lastSweepAt = readAt(byKey.get('ops.lastSweepAt'));
  const lastCoachingTickAt = readAt(byKey.get('ops.lastCoachingTickAt'));

  return {
    lastSweepAt,
    sweepStale: isStale(lastSweepAt, now),
    lastCoachingTickAt,
    coachingTickStale: isStale(lastCoachingTickAt, now),
  };
}
