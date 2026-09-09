import type { Principal } from '../auth/principal.js';

/**
 * Every command carries the principal that issued it. Handlers never read a
 * request object: the bus is the only thing between the edge and the domain,
 * and a handler that could reach the request would be a handler that could be
 * called from a place with no principal at all.
 */
export abstract class Command<_Result = void> {
  abstract readonly principal: Principal;
}

/**
 * A query carries whatever it needs to answer and nothing else. It is a type
 * rather than a base class because there is no shared behaviour to inherit —
 * and unlike a command, a query is not required to name a principal: some are
 * answered for the system itself, and the ones that are not scope by an id they
 * were handed.
 */
export type Query<_Result = unknown> = object;
