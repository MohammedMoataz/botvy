/**
 * How a password becomes a hash and how a hash is checked. A port, so the seed
 * and the sign-in slice never know which algorithm sits behind it, and the
 * specs can bind a hasher that costs nothing.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
