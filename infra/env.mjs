/**
 * The `.env` contract, read the way compose reads it.
 *
 * Both of the scripts beside this one probe the platform over HTTP and drive
 * `docker compose`, and every address they need is an `.env` value: the edge's
 * published port, n8n's loopback bind, the internal service token, the n8n API
 * key. Reading them from the ambient shell instead meant the defaults were what
 * actually ran — port 80 rather than `EDGE_PORT`, and a skipped credential
 * check announcing "not set in this shell" on a host where it was set all along.
 *
 * One file. It was `.env` then `.env.v2`, second winning, which is what kept v1
 * runnable from the same directory; the Owner collapsed that to one file and the
 * v2 values are folded into `.env`. Nothing already in the environment is
 * overwritten, so an operator can still override one value for one run.
 */
import { existsSync, readFileSync } from 'node:fs';

const CANDIDATES = ['.env'];

/** The files that exist, in the order compose reads them. */
export const envFiles = () => CANDIDATES.filter((file) => existsSync(file));

/** The `--env-file` arguments for a `docker compose` call. */
export const envFileArgs = () => envFiles().flatMap((file) => ['--env-file', file]);

const ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/** Loads those files into `process.env`, leaving anything already set alone. */
export function loadEnvFiles() {
  for (const file of envFiles()) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (line.trimStart().startsWith('#')) continue;
      const match = ASSIGNMENT.exec(line);
      if (!match) continue;

      let value = match[2].trim();
      // Compose strips one layer of matching quotes; a value with a `#` in it
      // is why quoting exists, so an inline comment is only stripped outside
      // them.
      if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
      else value = value.replace(/\s+#.*$/, '').trim();

      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  }
}
