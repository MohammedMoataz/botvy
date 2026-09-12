import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';

/** An instant. Always UTC on the wire; the client renders it in the member's zone. */
export const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'An instant in time, serialised as an ISO 8601 string in UTC.',
  serialize(value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return new Date(value).toISOString();
    throw new TypeError('DateTime can only serialise a Date or an ISO string.');
  },
  parseValue(value) {
    if (typeof value !== 'string') throw new TypeError('DateTime must arrive as a string.');
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new TypeError(`Not a DateTime: ${value}`);
    return parsed;
  },
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING) throw new TypeError('DateTime must arrive as a string.');
    return new Date(ast.value);
  },
});

/**
 * A calendar date in the member's own zone, as YYYY-MM-DD.
 *
 * Deliberately not a DateTime. "Which day was this" and "which instant was
 * this" are different questions, and answering the first with the second is how
 * a plan for Tuesday shows up on Monday evening for anyone west of the server.
 */
export const DateScalar = new GraphQLScalarType({
  name: 'Date',
  description: "A calendar date in the member's own time zone, as YYYY-MM-DD.",
  serialize(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    throw new TypeError('Date can only serialise a YYYY-MM-DD string.');
  },
  parseValue(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new TypeError(`Not a Date: ${String(value)}`);
    }
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING || !/^\d{4}-\d{2}-\d{2}$/.test(ast.value)) {
      throw new TypeError('Date must arrive as a YYYY-MM-DD string.');
    }
    return ast.value;
  },
});

export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON, used for a settings value and an audit entry’s metadata.',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: parseJsonLiteral,
});

function parseJsonLiteral(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.OBJECT: {
      const out: Record<string, unknown> = {};
      for (const field of ast.fields) {
        out[field.name.value] = parseJsonLiteral(field.value);
      }
      return out;
    }
    case Kind.LIST:
      return ast.values.map(parseJsonLiteral);
    case Kind.NULL:
      return null;
    default:
      // An enum or a variable has no JSON meaning here.
      return null;
  }
}
