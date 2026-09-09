import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import type { PasswordHasher } from '../domain/password-hasher.js';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const COST = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 32;

/**
 * scrypt from node:crypto — no dependency, and the parameters travel inside
 * the hash so they can be raised later without invalidating a stored one.
 *
 * ponytail: argon2id is the blueprint's choice; swap it in when P1 adds the
 * dependency. The format prefix lets both coexist during the change.
 */
@Injectable()
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scrypt(plain, salt, KEY_LENGTH, COST);
    return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join(
      '$',
    );
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    const parts = hash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, n = '', r = '', p = '', salt = '', expected = ''] = parts;
    const cost = { N: Number(n), r: Number(r), p: Number(p) };
    if (![cost.N, cost.r, cost.p].every((value) => Number.isInteger(value) && value > 0)) {
      return false;
    }

    const expectedKey = Buffer.from(expected, 'base64');
    let actualKey: Buffer;
    try {
      actualKey = await scrypt(plain, Buffer.from(salt, 'base64'), expectedKey.length, cost);
    } catch {
      return false;
    }
    return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey);
  }
}
