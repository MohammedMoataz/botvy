/**
 * UUIDv7, minted on the client.
 *
 * Anything the phone, the side panel or an offline tab can create carries an id
 * the client chose before the server ever heard of the row — that is what makes
 * a retried create a no-op instead of a duplicate, and it is why the create
 * routes take an `id` in the body rather than returning one. The backend's
 * `shared/cqrs/ids.ts` says the same thing from the other side.
 *
 * v7 rather than v4 because it sorts by creation time, so an index on the id
 * doubles as a chronological one — which is the whole reason the platform picked
 * v7, and a client that minted v4 would quietly cost the server that index.
 *
 * Hand-rolled rather than pulled from the `uuid` package: this is fifteen lines
 * of `crypto.getRandomValues`, which every surface this package runs on has
 * (browser, extension service worker, Node), and a dependency for fifteen lines
 * is a dependency to keep updated for fifteen lines.
 *
 * No per-millisecond counter, so two ids minted in the same millisecond sort
 * arbitrarily against each other. Nothing depends on that: the server validates
 * the id as a UUID and orders by the timestamp columns, not by id ties.
 */
export function newId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  // 48 bits of Unix milliseconds, big-endian, in the first six bytes. Written
  // with division rather than `<<`, because JavaScript's bitwise operators
  // truncate to 32 bits and the timestamp needs 48 — shifting would silently
  // drop the top two bytes and every id would claim to be from 1970.
  const ms = Date.now();
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
