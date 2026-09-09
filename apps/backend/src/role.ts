/**
 * Which role a process is. Split out from `main.ts` so the decision is
 * testable without booting a Nest application — the branch matters (one role
 * has no HTTP edge at all) and a branch worth having is a branch worth a spec.
 */
export type BotvyRole = 'backend' | 'worker';

export const ROLES: readonly BotvyRole[] = ['backend', 'worker'];

export class UnknownRoleError extends Error {
  constructor(given: string) {
    super(
      `BOTVY_ROLE is "${given}", which is not a role this image knows. ` +
        `Expected one of: ${ROLES.join(', ')}.`,
    );
    this.name = 'UnknownRoleError';
  }
}

/**
 * Refuses an unknown role rather than defaulting to one. Defaulting would let a
 * typo in compose start a second API where a worker was meant to be — and the
 * only symptom would be that nothing was relaying events, which looks like
 * nothing at all until a member notices a reminder never arrived.
 */
export function resolveRole(given: string | undefined): BotvyRole {
  if (given === undefined || given === '') return 'backend';
  if ((ROLES as readonly string[]).includes(given)) return given as BotvyRole;
  throw new UnknownRoleError(given);
}

/** Whether this role serves the public edge. */
export function servesHttpEdge(role: BotvyRole): boolean {
  return role === 'backend';
}

/** Whether this role runs the outbox relay and the scheduled work. */
export function runsRelay(role: BotvyRole): boolean {
  return role === 'worker';
}
