import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  envelopeSchema,
  eventSchemas,
  toJsonSchema,
  writeContracts,
} from './contracts.generate.js';

describe('zod to JSON Schema', () => {
  it('describes an object with its required fields', () => {
    const schema = toJsonSchema(
      z.object({ a: z.string(), b: z.number().optional() }),
    );

    expect(schema).toMatchObject({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'integer' } },
      required: ['a'],
      additionalProperties: false,
    });
  });

  it('carries the formats a subscriber validates on', () => {
    expect(toJsonSchema(z.string().uuid())).toEqual({
      type: 'string',
      format: 'uuid',
    });
    expect(toJsonSchema(z.string().datetime())).toEqual({
      type: 'string',
      format: 'date-time',
    });
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

  /**
   * A property rather than a frozen list.
   *
   * This assertion used to name the two events P0 shipped, which meant every
   * later phase's real work broke it — and a test that fails for being correct
   * teaches people to edit tests. What actually matters is that every published
   * event is named `<context>.<Event>` and has an object schema with at least
   * one field, because those are the two things a subscriber relies on.
   *
   * The presence of a *particular* event is asserted where that event is
   * raised, which is the only place that can also check its payload is right.
   */
  it('publishes every event as a named object schema', () => {
    const names = Object.keys(eventSchemas);
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      expect(name, `${name} is not <context>.<Event>`).toMatch(
        /^[a-z][a-z0-9]*\.[A-Z][A-Za-z]+$/,
      );

      const schema = toJsonSchema(
        eventSchemas[name as keyof typeof eventSchemas],
      ) as { type: string; properties: Record<string, unknown> };
      expect(schema.type).toBe('object');
      expect(Object.keys(schema.properties).length).toBeGreaterThan(0);
    }
  });

  it('still describes the settings event, which nothing else asserts', () => {
    // `operations.SettingChanged` has no context of its own to be tested in —
    // it is raised by the registry — so its shape is pinned here.
    expect(Object.keys(eventSchemas)).toContain('operations.SettingChanged');
  });
});

describe('writing the contract artefacts', () => {
  it('writes the schema, the events and the envelope', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'botvy-contracts-'));

    const written = await writeContracts(
      { openapi: '3.1.0' },
      'type Query { me: String }\n',
      dir,
    );

    expect(written).toContain('openapi.json');
    expect(written).toContain('schema.graphql');
    expect(written).toContain(join('events', 'envelope.schema.json'));
    // One real event, written out and read back. `planning.TaskScheduled` is
    // the one to use: it is what replaced the demonstration slice as the proof
    // that a command reaches automation, and P0's F-13 is the requirement.
    expect(written).toContain(
      join('events', 'planning.TaskScheduled.schema.json'),
    );

    const scheduled = JSON.parse(
      await readFile(
        join(dir, 'events', 'planning.TaskScheduled.schema.json'),
        'utf8',
      ),
    );
    expect(scheduled.title).toBe('planning.TaskScheduled');
    expect(scheduled.properties.taskId).toEqual({
      type: 'string',
      format: 'uuid',
    });
    // Nullable, and the JSON Schema says so as an `anyOf` rather than by
    // omission — which matters to a subscriber: a task that has lost its due
    // date sends `null`, and a validator that only accepted a date-time string
    // would reject the very event that tells it the date is gone.
    expect(scheduled.properties.dueAt).toEqual({
      anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
    });
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
