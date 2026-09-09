# syntax=docker/dockerfile:1
# The nightly backup sidecar for both stores.
#
# It is a built image rather than `mongo:8` with a command because that image
# ships none of what the job needs beyond mongodump: no cron, no pg_dump, no
# curl. Installing them when the container starts would put a package fetch in
# the path of every restart, and a restart that cannot reach the archive would
# leave the host quietly not backing anything up.
FROM mongo:8

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates cron curl postgresql-client \
 && rm -rf /var/lib/apt/lists/*

# Copied rather than bind-mounted, so the image is the same on the deploy host
# as it is here and a half-edited script cannot reach a running container.
COPY backup-mongo.sh backup-postgres.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup-mongo.sh /usr/local/bin/backup-postgres.sh
