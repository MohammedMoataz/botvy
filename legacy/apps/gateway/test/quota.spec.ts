import { describe, expect, it, vi } from 'vitest';
import { UsageService } from '../src/usage/usage.service.js';

function makeService(rows: { promptTokens: number; completionTokens: number }[], quota = 1000) {
  const prisma = {
    usageLog: { findMany: vi.fn().mockResolvedValue(rows), create: vi.fn() },
  };
  const config = { get: vi.fn().mockReturnValue(quota) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new UsageService(prisma as any, config as any);
}

describe('UsageService quota', () => {
  it('sums prompt and completion tokens for the day', async () => {
    const service = makeService([
      { promptTokens: 10, completionTokens: 20 },
      { promptTokens: 5, completionTokens: 5 },
    ]);
    expect(await service.tokensUsedToday('u1')).toBe(40);
  });

  it('allows a user strictly under quota', async () => {
    const service = makeService([{ promptTokens: 400, completionTokens: 599 }], 1000);
    expect(await service.hasQuotaRemaining('u1')).toBe(true);
  });

  it('rejects a user exactly at quota (boundary)', async () => {
    const service = makeService([{ promptTokens: 500, completionTokens: 500 }], 1000);
    expect(await service.hasQuotaRemaining('u1')).toBe(false);
  });

  it('rejects a user over quota', async () => {
    const service = makeService([{ promptTokens: 900, completionTokens: 900 }], 1000);
    expect(await service.hasQuotaRemaining('u1')).toBe(false);
  });

  it('treats a user with no usage as having quota', async () => {
    const service = makeService([], 1000);
    expect(await service.hasQuotaRemaining('u1')).toBe(true);
  });
});
