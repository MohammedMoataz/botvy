import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { envelopeSchema, eventSchemas, toJsonSchema, writeContracts } from './contracts.generate.js';

describe('zod to JSON Schema', () => {
  it('describes an object with its required fields', () => {
    const schema = toJsonSchema(z.object({ a: z.string(), b: z.number().optional() }));

    expect(schema).toMatchObject({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'integer' } },
      required: ['a'],
      additionalProperties: false,
    });
  });

  it('carries the formats a subscriber validates on', () => {
    expect(toJsonSchema(z.string().uuid())).toEqual({ type: 'string', format: 'uuid' });
    expect(toJsonSchema(z.string().datetime())).toEqual({ type: 'string', format: 'date-time' });
  });

  it('describes a nullable field as either shape', () => {
    expect(toJsonSchema(z.string().nullable())).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
  });

  /** Better an honest gap than a schema claiming to describe what it does not. */
  it('leaves an unknown payload unconstrained rather than guessing', () => {
    expect(toJsonSchema(z.unknown())).toEqual({});
  });

  it('describes the envelope every subscriber matches on first', () => {
    const schema = toJsonSchema(envelopeSchema) as { required: string[] };

    expect(schema.required).toContain('eventId');
    expect(schema.required).toContain('name');
    expect(schema.required).toContain('schemaVersion');
  });

  it('describes each event P0 introduces', () => {
    expect(Object.keys(eventSchemas)).toEqual(['operations.Pinged', 'operations.SettingChanged']);
  });
});

describe('writing the contract artefacts', () => {
  it('writes the schema, the events and the envelope', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'botvy-contracts-'));

    const written = await writeContracts({ openapi: '3.1.0' }, 'type Query { me: String }\n', dir);

    expect(written).toContain('openapi.json');
    expect(written).toContain('schema.graphql');
    expect(written).toContain(join('events', 'operations.Pinged.schema.json'));
    expect(written).toContain(join('events', 'envelope.schema.json'));

    const pinged = JSON.parse(
      await readFile(join(dir, 'events', 'operations.Pinged.schema.json'), 'utf8'),
    );
    expect(pinged.title).toBe('operations.Pinged');
    expect(pinged.properties.pingId).toEqual({ type: 'string', format: 'uuid' });
  });

  /**
   * The API is generated from the running application's own metadata, so a run
   * before the app can produce it must write the events rather than nothing —
   * a subscriber's contract does not depend on the HTTP surface.
   */
  it('still writes the event schemas when the API document is not available', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'botvy-contracts-'));

    const written = await writeContracts(null, null, dir);

    expect(written).not.toContain('openapi.json');
    expect(written).toContain(join('events', 'envelope.schema.json'));
  });
});
