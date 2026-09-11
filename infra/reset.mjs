#!/usr/bin/env node
/**
 * Archive v1, retire it, and start v2 from nothing (P11, T1122).
 *
 * ## What it will not do
 *
 * It never runs `docker system prune --volumes`, and it never removes a volume
 * it did not name. Both stacks' volumes are listed explicitly below, so a
 * volume belonging to something else on this machine — another project, a
 * database somebody is using — cannot be caught by a wildcard. That is the
 * whole reason this is a script rather than four commands typed at a prompt:
 * the destructive ones should be the ones that were written down and read
 * twice.
 *
 * ## Archive before remove, always
 *
 * `--archive` runs on its own and leaves everything running. Nothing is deleted
 * until `--go`, and `--go` refuses to start unless an archive for today exists.
 *
 * The archive is not ceremony. `docs/parity.md` owes a check that every member
 * v1 had banned still cannot sign in to v2, and that check reads v1's `users`
 * table — so deleting the volume without dumping it first makes a task in this
 * phase permanently unanswerable. The script dumps the table to CSV for exactly
 * that reason and says so on the way past.
 *
 * ## Usage
 *
 *   node infra/reset.mjs                 # say what would happen, touch nothing
 *   node infra/reset.mjs --archive       # dump and tar v1, still touch nothing
 *   node infra/reset.mjs --go            # archive must exist; then remove and rebuild
 *   node infra/reset.mjs --go --keep-v2  # retire v1 only, leave v2's data alone
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/** Where the archive goes: outside the repository, beside it. */
const ARCHIVE_ROOT = process.env.BOTVY_ARCHIVE_DIR ?? resolve(root, '..', 'botvy-v1-archive');

const V1_COMPOSE = join(root, 'legacy', 'infra', 'docker-compose.yml');
const V2_COMPOSE = join(root, 'infra', 'docker-compose.yml');

/** Named, never matched by prefix. A wildcard here is how somebody loses a database. */
const V1_VOLUMES = ['botvy_pg_data', 'botvy_n8n_data', 'botvy_searxng_data'];
const V2_VOLUMES = [
  'botvy-v2_pg_data',
  'botvy-v2_mongo_data',
  'botvy-v2_n8n_data',
  'botvy-v2_media',
  'botvy-v2_caddy_data',
  'botvy-v2_caddy_config',
];

const argv = new Set(process.argv.slice(2));
const ARCHIVE = argv.has('--archive');
const GO = argv.has('--go');
const KEEP_V2 = argv.has('--keep-v2');
const today = new Date().toISOString().slice(0, 10);
const archiveDir = join(ARCHIVE_ROOT, today);

const say = (line) => console.log(line);
const step = (line) => console.log(`\n[1m${line}[0m`);

function docker(args, { allowFailure = false, capture = false } = {}) {
  if (!GO && !ARCHIVE) {
    say(`  would run: docker ${args.join(' ')}`);
    return '';
  }
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`docker ${args.join(' ')} failed: ${result.stderr ?? result.status}`);
  }
  return capture ? (result.stdout ?? '') : '';
}

function volumeExists(name) {
  const result = spawnSync('docker', ['volume', 'inspect', name], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function requireDocker() {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });
  } catch {
    console.error(
      'The Docker engine is not answering. Start Docker Desktop and try again — ' +
        'and if `wsl -l -v` hangs, restart WSLService from an elevated shell or reboot.',
    );
    process.exit(1);
  }
}

/**
 * Copies one named volume out as a gzipped tar, through a throwaway container.
 *
 * `-v <name>:/v:ro` is what makes this safe: the volume is mounted read-only,
 * so the archiving step cannot damage the thing it is archiving. The failure
 * mode worth guarding against is not an exotic one — it is a typo in a `tar`
 * invocation running against live data.
 */
function archiveVolume(name, outDir) {
  if (!volumeExists(name)) {
    say(`  ${name}: not present, nothing to archive`);
    return;
  }
  docker([
    'run', '--rm',
    '-v', `${name}:/v:ro`,
    '-v', `${outDir}:/out`,
    'alpine',
    'sh', '-c', `tar czf /out/${name}.tar.gz -C /v . && sha256sum /out/${name}.tar.gz`,
  ]);
  say(`  ${name}: archived`);
}

function archive() {
  step(`1. Archiving v1 into ${archiveDir}`);
  mkdirSync(archiveDir, { recursive: true });

  /*
   * The identity database, as SQL and as a CSV of who was banned.
   *
   * The CSV is the part `docs/parity.md` needs: every member v1 had banned must
   * still be unable to sign in to v2, and the only way to check that later is to
   * have the list. Once `botvy_pg_data` is gone the question cannot be asked
   * again, so it is asked now.
   */
  say('  starting v1 postgres on its own, to dump it');
  docker(['compose', '-f', V1_COMPOSE, 'up', '-d', 'postgres'], { allowFailure: true });

  if (GO || ARCHIVE) {
    // A moment for the container to accept connections. `pg_isready` in a loop
    // rather than a fixed sleep: a fixed sleep is either too short on a cold
    // machine or wasted on a warm one.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const ready = spawnSync(
        'docker',
        ['compose', '-f', V1_COMPOSE, 'exec', '-T', 'postgres', 'pg_isready'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      if (ready.status === 0) break;
      spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},1000)']);
    }
  }

  const sql = docker([
    'compose', '-f', V1_COMPOSE, 'exec', '-T', 'postgres',
    'sh', '-c', 'pg_dumpall -U ${POSTGRES_USER:-botvy}',
  ], { allowFailure: true, capture: true });

  if (sql && sql.length > 0) {
    // `pg_dumpall` rather than `pg_dump`: v1 keeps n8n's database in the same
    // cluster, and a dump of one database leaves the automation tool's history
    // behind in a volume that is about to be removed.
    writeFileSync(join(archiveDir, 'v1-all.sql'), sql, 'utf8');
    say(`  v1-all.sql — ${Math.round(sql.length / 1024)} KB`);
  } else if (GO || ARCHIVE) {
    say('  pg_dumpall returned nothing. The volume archive below is still taken,');
    say('  but check why before running --go: an empty dump is not evidence.');
  }

  say('  dumping the member list, banned members included');
  const members = docker([
    'compose', '-f', V1_COMPOSE, 'exec', '-T', 'postgres',
    'psql', '-U', 'botvy', '-d', 'botvy', '-A', '-F,', '-t', '-c',
    'select email, role, status, created_at, last_login_at from users order by status, email',
  ], { allowFailure: true, capture: true });

  if (members) {
    const target = join(archiveDir, 'v1-members.csv');
    // Written from here rather than redirected inside the container, so the file
    // lands outside the volume that is about to be deleted.
    writeFileSync(target, `email,role,status,created_at,last_login_at\n${members}`, 'utf8');
    const banned = members.split('\n').filter((line) => line.includes(',banned,')).length;
    say(`  ${target} — ${banned} banned member(s). docs/parity.md needs this list.`);
  }

  say('  stopping v1 again');
  docker(['compose', '-f', V1_COMPOSE, 'stop'], { allowFailure: true });

  step('2. Archiving v1 volumes');
  for (const name of V1_VOLUMES) archiveVolume(name, archiveDir);

  say(`\nArchive written to ${archiveDir}`);
  say('Record that path in docs/parity.md and specs/025-hardening-release/tasks.md (T1122).');
}

function retire() {
  step('3. Removing v1: containers, then its named volumes');
  docker(['compose', '-f', V1_COMPOSE, 'down', '--remove-orphans', '--volumes'], {
    allowFailure: true,
  });
  for (const name of V1_VOLUMES) {
    docker(['volume', 'rm', name], { allowFailure: true });
    say(`  ${name}: removed`);
  }
}

function resetV2() {
  step("4. Removing v2's data, so the next start is a first install");
  say('  everything in both stores and the media volume goes. This is the point:');
  say('  a fresh install is what SETUP.md describes and what T1143 rehearses.');
  docker(['compose', '--env-file', join(root, '.env'), '-f', V2_COMPOSE, 'down', '--volumes'], {
    allowFailure: true,
  });
  for (const name of V2_VOLUMES) {
    docker(['volume', 'rm', name], { allowFailure: true });
    say(`  ${name}: removed`);
  }
}

function tidy() {
  step('5. Reclaiming what nothing references');
  // Stopped containers, unused networks, dangling images and the build cache.
  // **Not** `--volumes`: a named volume is deleted above by name or not at all,
  // because a blanket volume prune takes anything else on this machine with it.
  docker(['container', 'prune', '-f'], { allowFailure: true });
  docker(['network', 'prune', '-f'], { allowFailure: true });
  docker(['image', 'prune', '-a', '-f'], { allowFailure: true });
  docker(['builder', 'prune', '-a', '-f'], { allowFailure: true });
}

function rebuild() {
  step('6. Building v2 from the current tree and starting it');
  docker([
    'compose', '--env-file', join(root, '.env'), '-f', V2_COMPOSE,
    'up', '-d', '--build', '--force-recreate',
  ]);
  say('\n  --force-recreate is not decoration: `up -d --build` rebuilds the image');
  say('  and leaves the previous container running, which looks exactly like a');
  say('  successful deploy and is how four new routes 404d for an afternoon.');
}

async function main() {
  say('Botvy reset — archive v1, retire it, start v2 from nothing\n');

  if (!ARCHIVE && !GO) {
    say('DRY RUN. Nothing will be touched. Commands are printed, not run.\n');
  }

  requireDocker();

  if (ARCHIVE || !GO) {
    archive();
    if (!GO) {
      say('\nNothing was deleted. When the archive looks right:');
      say('  node infra/reset.mjs --go');
      return;
    }
  }

  if (GO) {
    const dated = existsSync(ARCHIVE_ROOT)
      ? readdirSync(ARCHIVE_ROOT).filter((name) => name === today)
      : [];
    if (dated.length === 0) {
      console.error(
        `\nRefusing: no archive for ${today} under ${ARCHIVE_ROOT}.\n` +
          'Run `node infra/reset.mjs --archive` first. Deleting botvy_pg_data without\n' +
          "a dump makes docs/parity.md's banned-member check permanently unanswerable.",
      );
      process.exit(1);
    }

    retire();
    if (!KEEP_V2) resetV2();
    tidy();
    rebuild();

    step('Done');
    say('Next: node infra/bootstrap.mjs && node infra/verify.mjs');
    say('Then change the administrator password — it is the first thing SETUP.md says.');
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
