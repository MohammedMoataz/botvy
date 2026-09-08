import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { HeartbeatDto, InternalHeartbeatController } from './internal-heartbeat.controller.js';

/** The pipe exactly as main.ts configures it, so this spec fails when the two drift. */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const asBody = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: HeartbeatDto, data: undefined }) as Promise<HeartbeatDto>;

describe('POST /internal/ops/heartbeat', () => {
  it('accepts the backup scripts\' body as written: error present and empty, no durationMs', async () => {
    const stamped: unknown[] = [];
    const controller = new InternalHeartbeatController({
      stamp: async (...args: unknown[]) => { stamped.push(args); },
    } as never);

    const body = await asBody({ job: 'backup.mongo', ok: true, error: '' });
    const answer = await controller.stamp(body);

    expect(answer).toMatchObject({ job: 'backup.mongo', ok: true });
    // An empty error is "no error", not the string "".
    expect(stamped).toEqual([['backup.mongo', true, undefined, undefined]]);
  });

  it('records a failure with its message', async () => {
    const stamped: unknown[] = [];
    const controller = new InternalHeartbeatController({
      stamp: async (...args: unknown[]) => { stamped.push(args); },
    } as never);

    await controller.stamp(await asBody({ job: 'backup.postgres', ok: false, error: 'pg_dump: refused' }));
    expect(stamped).toEqual([['backup.postgres', false, 'pg_dump: refused', undefined]]);
  });

  it('refuses a body with a field nobody declared', async () => {
    await expect(asBody({ job: 'backup.mongo', ok: true, error: '', extra: 1 })).rejects.toThrow();
  });
});
