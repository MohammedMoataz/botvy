import { describe, expect, it } from 'vitest';
import { ScryptPasswordHasher } from './scrypt-password.hasher.js';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('round-trips a password and refuses a different one', async () => {
    const hash = await hasher.hash('admin');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await hasher.verify(hash, 'admin')).toBe(true);
    expect(await hasher.verify(hash, 'admin ')).toBe(false);
  });

  it('salts, so the same password never hashes the same twice', async () => {
    expect(await hasher.hash('admin')).not.toBe(await hasher.hash('admin'));
  });

  it('answers false, never throws, for a hash it does not recognise', async () => {
    expect(await hasher.verify('', 'admin')).toBe(false);
    expect(
      await hasher.verify('$argon2id$v=19$m=65536,t=3,p=4$abc$def', 'admin'),
    ).toBe(false);
    expect(await hasher.verify('scrypt$x$8$1$c2FsdA==$aGFzaA==', 'admin')).toBe(
      false,
    );
  });
});
