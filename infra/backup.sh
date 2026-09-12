#!/bin/bash
# The night's backup: both stores and the media, verified, reported once.
#
# ## Why one script and not three
#
# P0 ran two — one per store — each stamping its own heartbeat, and neither
# touched the media directory. Three separate answers to "was last night's
# backup taken" can disagree, and the disagreement is invisible until the night
# somebody needs it: `userId` in Mongo is the PostgreSQL uuid with no join to
# rebuild it from, and a photo referenced by a profile that restores without it
# is a broken image for ever. They are one backup because they are only useful
# together, so they succeed or fail together and report once.
#
# ## A backup nobody has opened is a hope
#
# Every archive is read back before the run counts. `mongorestore --dryRun`
# parses the whole archive; `pg_restore --list` parses the whole dump; the media
# copy is checksummed and its files counted, because a tar that wrote zero bytes
# is a tar. A run that cannot verify what it wrote keeps the file for inspection
# and reports a failure rather than pruning on the strength of it.
#
# ## What it does not do
#
# It never writes to either store, and it never writes a heartbeat itself —
# constitution I, the API is the only writer. The outcome goes to
# `POST /internal/backups/report` with the service token, and the API stamps the
# heartbeat and `ops.lastBackupAt`. The same call answers with
# `backup.retentionDays`, so the pruning window is the operator's registry key
# rather than a second copy in an environment variable.
set -uo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROOT="${BACKUP_DIR:-/backups}"
# A directory per night, not a prefix per file. Copying one night elsewhere is
# then one `cp -r`, and a half-written night is obvious rather than three files
# that have to be matched up by the timestamps in their names.
NIGHT="${ROOT}/${STAMP}"
MEDIA_DIR="${MEDIA_SOURCE:-/data/media}"
STARTED="$(date -u +%s)"

mkdir -p "${NIGHT}"

# Built as the run goes, and sent whole at the end: the report is the record of
# what was verified, and a run that names nothing is refused by the API as a
# success with no evidence behind it.
ARCHIVES=''
FAILURE=''

add_archive() {
  local entry="$1"
  if [ -z "${ARCHIVES}" ]; then ARCHIVES="${entry}"; else ARCHIVES="${ARCHIVES},${entry}"; fi
}

fail() {
  # The first failure is the one worth reporting. A later message would describe
  # a step that only failed because the earlier one did.
  [ -z "${FAILURE}" ] && FAILURE="$1"
  echo "backup: $1" >&2
}

size_of() {
  # `stat -c` on GNU coreutils, which is what the image has; the fallback keeps
  # the script honest rather than reporting a zero it did not measure.
  stat -c %s "$1" 2>/dev/null || echo 0
}

# ------------------------------------------------------------------ MongoDB
MONGO_ARCHIVE="${NIGHT}/botvy.archive.gz"
if mongodump --uri="${MONGO_URL}" --archive="${MONGO_ARCHIVE}" --gzip; then
  if mongorestore --uri="${MONGO_URL}" --archive="${MONGO_ARCHIVE}" --gzip --dryRun \
    >/dev/null 2>&1; then
    add_archive "{\"name\":\"botvy.archive.gz\",\"bytes\":$(size_of "${MONGO_ARCHIVE}")}"
  else
    fail 'the Mongo archive did not read back'
  fi
else
  fail 'mongodump failed'
fi

# --------------------------------------------------------------- PostgreSQL
PG_ARCHIVE="${NIGHT}/identity.dump"
# Custom format, so the verification below can list it and a restore can be
# selective if it ever has to be.
if pg_dump --dbname="${DATABASE_URL}" --format=custom --file="${PG_ARCHIVE}"; then
  if pg_restore --list "${PG_ARCHIVE}" >/dev/null 2>&1; then
    add_archive "{\"name\":\"identity.dump\",\"bytes\":$(size_of "${PG_ARCHIVE}")}"
  else
    fail 'the Identity dump did not read back'
  fi
else
  fail 'pg_dump failed'
fi

# --------------------------------------------------------------- the media
#
# Photos and anything else the media proxy serves. Not in either store and not
# reconstructable from them: a profile restores pointing at a file that is not
# there, and nothing in the system can tell that it used to exist.
MEDIA_ARCHIVE="${NIGHT}/media.tar.gz"
if [ -d "${MEDIA_DIR}" ]; then
  if tar -czf "${MEDIA_ARCHIVE}" -C "${MEDIA_DIR}" .; then
    # Counted and checksummed rather than dry-run restored: there is no
    # equivalent of `--dryRun` for a tar, and `-t` reading the whole stream is
    # the same parse. The file count is what catches the failure a checksum
    # cannot — a tar of an empty directory is a valid tar.
    MEDIA_FILES="$(tar -tzf "${MEDIA_ARCHIVE}" 2>/dev/null | grep -vc '/$' || echo 0)"
    if [ "${MEDIA_FILES}" -ge 0 ] 2>/dev/null; then
      MEDIA_SUM="$(sha256sum "${MEDIA_ARCHIVE}" | cut -d' ' -f1)"
      add_archive "{\"name\":\"media.tar.gz\",\"bytes\":$(size_of "${MEDIA_ARCHIVE}"),\"sha256\":\"${MEDIA_SUM}\",\"files\":${MEDIA_FILES}}"
      echo "${MEDIA_SUM}  media.tar.gz" > "${NIGHT}/media.tar.gz.sha256"
    else
      fail 'the media archive did not read back'
    fi
  else
    fail 'the media copy failed'
  fi
else
  # Not a failure. An installation where nobody has uploaded anything has no
  # media directory, and refusing the night over it would teach the Owner to
  # ignore a red backup.
  echo "backup: no media directory at ${MEDIA_DIR}; nothing to copy"
fi

# ------------------------------------------------------------- the report
DURATION_MS=$(( ($(date -u +%s) - STARTED) * 1000 ))
if [ -n "${FAILURE}" ]; then OK=false; else OK=true; fi

RETENTION="${BACKUP_RETENTION_FALLBACK:-14}"
if [ -n "${BOTVY_API_BASE:-}" ] && [ -n "${INTERNAL_SERVICE_TOKEN:-}" ]; then
  ANSWER="$(curl -fsS -X POST "${BOTVY_API_BASE}/internal/backups/report" \
    -H "X-Service-Token: ${INTERNAL_SERVICE_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "{\"ok\":${OK},\"durationMs\":${DURATION_MS},\"error\":\"${FAILURE}\",\"archives\":[${ARCHIVES}]}" \
    2>/dev/null || true)"
  # The registry's own value, learned from the call that reported the result.
  # `grep -o` rather than a JSON parser because this image has neither jq nor
  # node, and a missing field correctly leaves the fallback in place.
  FROM_API="$(echo "${ANSWER}" | grep -o '"retentionDays":[0-9]*' | cut -d: -f2)"
  [ -n "${FROM_API}" ] && RETENTION="${FROM_API}"
else
  echo 'backup: no API base or service token; the outcome was not reported' >&2
fi

# -------------------------------------------------------------- the pruning
#
# Only after a good night, so a run of failures never leaves nothing to restore
# from. That is the whole argument for doing it last: pruning on a schedule
# rather than on a success is how an installation ends up with a directory full
# of nothing on the morning it matters.
if [ "${OK}" = true ]; then
  find "${ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION}" \
    -exec rm -rf {} + 2>/dev/null || true
  echo "backup: ${NIGHT} written and verified; keeping ${RETENTION} days"
  exit 0
fi

echo "backup: ${NIGHT} kept for inspection (${FAILURE})" >&2
exit 1
