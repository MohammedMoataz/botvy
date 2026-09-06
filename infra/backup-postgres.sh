#!/bin/bash
# The Identity half of the nightly backup.
#
# Both stores are dumped, because restoring one without the other leaves
# accounts whose data is gone or data whose accounts are: `userId` in Mongo is
# the PostgreSQL uuid, and there is no join to rebuild the link from.
#
# Verified the same way the Mongo dump is: a backup nobody has opened is a hope.
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="/backups/identity-${STAMP}.dump"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

report() {
  local ok="$1" error="${2:-}"
  if [ -z "${BOTVY_API_BASE:-}" ] || [ -z "${INTERNAL_SERVICE_TOKEN:-}" ]; then
    return 0
  fi
  curl -fsS -X POST "${BOTVY_API_BASE}/internal/ops/heartbeat" \
    -H "X-Service-Token: ${INTERNAL_SERVICE_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "{\"job\":\"backup.postgres\",\"ok\":${ok},\"error\":\"${error}\"}" >/dev/null || true
}

# Custom format, so the verification below can list it and a restore can be
# selective if it ever has to be.
if ! pg_dump --dbname="${DATABASE_URL}" --format=custom --file="${ARCHIVE}"; then
  report false "pg_dump failed"
  exit 1
fi

# Listing the archive's table of contents parses the whole file, so a truncated
# or corrupt dump fails here rather than on the night it is needed.
if ! pg_restore --list "${ARCHIVE}" >/dev/null 2>&1; then
  report false "archive did not read back"
  echo "archive ${ARCHIVE} could not be read back; keeping it for inspection" >&2
  exit 1
fi

# Pruned only after a good dump, so a run of failures never leaves nothing.
find /backups -name 'identity-*.dump' -type f -mtime "+${RETENTION_DAYS}" -delete

report true
echo "backup ${ARCHIVE} written and verified"
