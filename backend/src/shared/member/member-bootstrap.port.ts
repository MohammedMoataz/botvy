/**
 * Whether a member's Mongo-side furniture exists yet (E-019).
 *
 * `POST /auth/register` writes the PostgreSQL row and raises
 * `identity.UserRegistered` into `identity_outbox`. The relay picks it up on
 * its next tick and `BootstrapOnRegisteredHandler` writes the member's
 * `profiles` and `user_preferences` documents. Everything between those two
 * moments is a window in which the account exists and its furniture does not —
 * `PATCH /preferences` answers 404, `profile` and `preferences` resolve to
 * null. Measured at about three seconds on this installation, and it is a relay
 * *tick* rather than a fixed cost: a busy outbox or a restarted worker makes it
 * arbitrarily long.
 *
 * The eventual bootstrap is the design and it is right — constitution I forbids
 * a distributed transaction across the two stores, and an endpoint that
 * invented an empty preferences row would be seeding defaults outside the one
 * handler that owns seeding them. What was missing is that no client was *told*
 * the window exists. This port is how they are: the sign-in and registration
 * responses carry `bootstrapped`, and a client with a first-run path waits
 * rather than failing.
 *
 * ## Why this is a port and not a read of `profiles`
 *
 * Identity is the one context on PostgreSQL and the profile is Mongo's. A
 * context never opens another's collection; it asks through a query handler
 * bound in `infrastructure/`. The binding lives in Profile's module — which
 * owns the data — and the token lives here in `shared/`, owned by nobody, for
 * the same reason `MemberContextPort`'s does.
 *
 * It answers on both documents, not one. The bootstrap writes the profile and
 * the preferences in sequence inside one unit of work, but a client that
 * believed "bootstrapped" on the profile alone would be told to go ahead by the
 * half of the answer that is not the half it needs — the preferences patch is
 * the call that meets the 404.
 */
export abstract class MemberBootstrapPort {
  abstract isBootstrapped(userId: string): Promise<boolean>;
}
