#!/bin/bash
# Initiates the replica set on first boot, and is a plain status read on every
# boot after that.
#
# It runs as the container's healthcheck, which means the thing that makes the
# set exist is also the thing that reports whether it does. A separate one-shot
# init container would have to win a race against the first client; this cannot,
# because nothing is healthy until the set answers.
#
# Idempotent by construction: `rs.status()` succeeding is the whole exit
# condition, and `rs.initiate()` is only ever reached when it does not.
set -euo pipefail

if mongosh --quiet --eval 'rs.status().ok' 2>/dev/null | grep -q '^1$'; then
  exit 0
fi

# Not initiated yet. `already initialized` is a success here too: two
# healthchecks can overlap on a slow first boot, and the loser must not report
# the container as broken.
init_output="$(mongosh --quiet --eval '
  try {
    rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongo:27017" }] });
    print("initiated");
  } catch (error) {
    if (String(error).includes("already initialized")) { print("initiated"); }
    else { print("failed: " + error); }
  }
' 2>&1 || true)"

case "$init_output" in
  *initiated*)
    # The set exists but may still be electing itself. Not healthy yet; the
    # next healthcheck will find it.
    mongosh --quiet --eval 'rs.status().ok' 2>/dev/null | grep -q '^1$'
    ;;
  *)
    echo "replica set could not be initiated: $init_output" >&2
    exit 1
    ;;
esac
