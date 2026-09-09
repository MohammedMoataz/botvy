#!/bin/bash
# Nightly dump, verified rather than merely written.
#
# A backup nobody has opened is a hope, not a backup. Every archive is read back
# with a dry-run restore before the run counts as successful, and the outcome is
# reported to the API — which is the only way a heartbeat reaches ops_heartbeats
# from a container the API does not run.
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="/backups/botvy-${STAMP}.archive.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

report() {
  local ok="$1" error="${2:-}"
  if [ -z "${BOTVY_API_BASE:-}" ] || [ -z "${INTERNAL_SERVICE_TOKEN:-}" ]; then
    return 0
  fi
  curl -fsS -X POST "${BOTVY_API_BASE}/internal/ops/heartbeat" \
    -H "X-Service-Token: ${INTERNAL_SERVICE_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "{\"job\":\"backup.mongo\",\"ok\":${ok},\"error\":\"${error}\"}" >/dev/null || true
}

if ! mongodump --uri="${MONGO_URL}" --archive="${ARCHIVE}" --gzip; then
  report false "mongodump failed"
  exit 1
fi

# The verification half. Restoring nowhere still parses the whole archive, so a
# truncated or corrupt file fails here rather than on the night it is needed.
if ! mongorestore --uri="${MONGO_URL}" --archive="${ARCHIVE}" --gzip --dryRun >/dev/null 2>&1; then
  report false "archive did not read back"
  echo "archive ${ARCHIVE} could not be read back; keeping it for inspection" >&2
  exit 1
fi

# Pruned only after a good dump, so a run of failures never leaves nothing.
find /backups -name 'botvy-*.archive.gz' -type f -mtime "+${RETENTION_DAYS}" -delete

report true
echo "backup ${ARCHIVE} written and verified"
