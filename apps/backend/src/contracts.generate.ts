import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';

/**
 * Writes the contract artefacts every client is generated from.
 *
 * The domain was written three times in v1 — once in the gateway, once in the
 * admin app, once on the phone — and the three drifted, because nothing made
 * them agree. Generating from one source is the fix, and this is the source.
 *
 * Run as a mode of the backend rather than a separate tool, because the OpenAPI
 * document and the GraphQL schema are produced by the running application's own
 * metadata. A second tool that reconstructed them would be a fourth place for
 * the domain to live.
 */
export const CONTRACTS_DIR = join(process.cwd(), '..', '..', 'packages', 'contracts');

/** The events P0 introduces, as JSON Schema, for subscribers to validate against. */
export const eventSchemas = {
  'operations.Pinged': z.object({
    pingId: z.string().uuid(),
    clientId: z.string(),
    at: z.string().datetime(),
  }),
  'operations.SettingChanged': z.object({
    key: z.string(),
  }),
} as const;

/** The envelope every event travels in, which subscribers match on first. */
export const envelopeSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string(),
  context: z.string(),
  aggregate: z.object({ type: z.string(), id: z.string() }),
  userId: z.string().nullable(),
  occurredAt: z.string().datetime(),
  payload: z.unknown(),
  schemaVersion: z.number().int(),
});

/**
 * A small zod-to-JSON-Schema conversion, rather than a dependency.
 *
 * P0 emits two event payloads and one envelope. A library to convert three
 * schemas is a dependency to keep current, review and eventually upgrade, for
 * work that is thirty lines — and constitution VIII asks for the present need,
 * not the general case. When a phase needs unions or refinements this becomes
 * a dependency; today it would be one bought on speculation.
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def as { typeName: string; [key: string]: unknown };

  switch (def.typeName) {
    case 'ZodString': {
      const checks = (def.checks ?? []) as Array<{ kind: string }>;
      if (checks.some((check) => check.kind === 'uuid')) return { type: 'string', format: 'uuid' };
      if (checks.some((check) => check.kind === 'datetime')) {
        return { type: 'string', format: 'date-time' };
      }
      return { type: 'string' };
    }
    case 'ZodNumber':
      return { type: 'integer' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodUnknown':
      return {};
    case 'ZodNullable':
      return { anyOf: [toJsonSchema(def.innerType as z.ZodTypeAny), { type: 'null' }] };
    case 'ZodOptional':
    case 'ZodDefault':
      // Optionality is expressed by absence from `required`, not by the field's
      // own type, so the wrapper is transparent here.
      return toJsonSchema(def.innerType as z.ZodTypeAny);
    case 'ZodArray':
      return { type: 'array', items: toJsonSchema(def.type as z.ZodTypeAny) };
    case 'ZodObject': {
      const shape = (def.shape as () => Record<string, z.ZodTypeAny>)();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = toJsonSchema(value);
        if (!value.isOptional()) required.push(key);
      }
      return { type: 'object', properties, required, additionalProperties: false };
    }
    default:
      // Better an honest gap than a schema that claims to describe something
      // it does not.
      return {};
  }
}

export async function writeContracts(
  openapi: unknown,
  graphqlSdl: string | null,
  dir: string = CONTRACTS_DIR,
): Promise<string[]> {
  const written: string[] = [];

  const write = async (relative: string, contents: string) => {
    const target = join(dir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
    written.push(relative);
  };

  if (openapi) await write('openapi.json', `${JSON.stringify(openapi, null, 2)}\n`);
  if (graphqlSdl) await write('schema.graphql', graphqlSdl);

  for (const [name, schema] of Object.entries(eventSchemas)) {
    await write(
      join('events', `${name}.schema.json`),
      `${JSON.stringify(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          title: name,
          description: `Payload of ${name}. It travels inside the envelope in envelope.schema.json.`,
          ...toJsonSchema(schema),
        },
        null,
        2,
      )}\n`,
    );
  }

  await write(
    join('events', 'envelope.schema.json'),
    `${JSON.stringify(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'DomainEvent',
        description:
          'Every event travels in this envelope. Delivery is at-least-once, so a subscriber discards an eventId it has already seen.',
        ...toJsonSchema(envelopeSchema),
      },
      null,
      2,
    )}\n`,
  );

  return written;
}
