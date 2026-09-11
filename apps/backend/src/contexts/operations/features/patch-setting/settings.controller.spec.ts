import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PatchSettingDto } from './settings.controller.js';

/**
 * The pipe exactly as `main.ts` configures it, so this spec fails when the two
 * drift — the same technique `internal-heartbeat.controller.spec.ts` uses, and
 * for the same reason: the pipe is the only place this rule lives, and nothing
 * else in the suite goes through it.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const asBody = (value: unknown) =>
  pipe.transform(value, {
    type: 'body',
    metatype: PatchSettingDto,
    data: undefined,
  }) as Promise<PatchSettingDto>;

describe('PATCH /admin/settings/:key', () => {
  /*
   * The whole of the defect, and it needs one assertion.
   *
   * `whitelist: true` means "strip what no decorator declares" and
   * `forbidNonWhitelisted: true` turns that strip into a refusal. The DTO
   * declared `value!: unknown` with no decorator at all — reasonably, since
   * the registry's own zod schema is the validator — and so the pipe could not
   * see the one field the endpoint takes. Every settings write in the product
   * answered `400 property value should not exist`: the portal's editor, the
   * P6 gate's horizon change, an operator retuning `ops.staleAfterMinutes`.
   *
   * With `SettingsService.set` unreachable from HTTP, every registry key was a
   * hard-coded default, which principle XII calls a bug in as many words.
   */
  it('lets the one field it takes through the global pipe', async () => {
    await expect(asBody({ value: 35 })).resolves.toMatchObject({ value: 35 });
  });

  it('carries whatever the key’s own schema will judge, unexamined', async () => {
    // `@Allow()` declares the property and validates nothing, so a string, an
    // object and `false` all reach the service — where the key's zod schema
    // produces the error that names the key and what it wanted.
    await expect(asBody({ value: '22:00' })).resolves.toMatchObject({
      value: '22:00',
    });
    await expect(asBody({ value: false })).resolves.toMatchObject({
      value: false,
    });
    await expect(asBody({ value: { nested: true } })).resolves.toMatchObject({
      value: { nested: true },
    });
  });

  it('still refuses a field nobody declared', async () => {
    // The `@Allow()` fix must not become a blanket opt-out: a client sending
    // `{ value, key }` is disagreeing with the contract about where the key
    // lives, and that should surface now rather than be silently ignored.
    // The reason is in the exception's response rather than its `message`,
    // which is the plain "Bad Request Exception" — so the assertion reads the
    // response, or it passes for any rejection at all.
    const refusal = await asBody({
      value: 35,
      key: 'training.materialiseDays',
    }).catch((error: { getResponse?: () => unknown }) => error.getResponse?.());
    expect(JSON.stringify(refusal)).toMatch(/key should not exist/);
  });
});
