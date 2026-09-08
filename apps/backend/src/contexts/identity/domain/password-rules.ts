/**
 * The one server-side password rule, in the one place both slices read it.
 *
 * It briefly lived in two: the change-password slice declared it, then the
 * register slice declared its own. Two constants with the same name and the
 * same value are one edit away from disagreeing, and the failure that follows
 * is a password a member can set but cannot change.
 *
 * A length floor and nothing else. Composition rules (a digit, a symbol, mixed
 * case) push people toward `Password1!` and are no longer recommended by NIST
 * — length is what buys entropy.
 */
export const MIN_PASSWORD_LENGTH = 8;
