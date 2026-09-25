# syntax=docker/dockerfile:1
# The nightly backup sidecar for both stores.
#
# It is a built image rather than `mongo:8` with a command because that image
# ships none of what the job needs beyond mongodump: no cron, no pg_dump, no
# curl. Installing them when the container starts would put a package fetch in
# the path of every restart, and a restart that cannot reach the archive would
# leave the host quietly not backing anything up.
FROM mongo:8

# pg_dump has to be at least as new as the server it dumps — an older client
# refuses outright ("aborting because of server version mismatch") — and the
# managed PostgreSQL the default install points at is created on the provider's
# current major, which is newer than the client this image's Ubuntu ships. So
# the client comes from PostgreSQL's own repository, pinned to a major: a newer
# client dumps an older server fine, so this only ever needs to go up, and it
# goes up here when the store does. Without this the nightly failed on the
# first hosted install and `/health` was the only thing that said so.
ARG PG_CLIENT_MAJOR=17
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates cron curl gnupg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
 && . /etc/os-release \
 && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends "postgresql-client-${PG_CLIENT_MAJOR}" \
 && apt-get purge -y --auto-remove gnupg \
 && rm -rf /var/lib/apt/lists/*

# Copied rather than bind-mounted, so the image is the same on the deploy host
# as it is here and a half-edited script cannot reach a running container.
#
# One script since P11: the two stores and the media copy are one backup,
# because they are only useful together, and they now succeed or fail together
# and report once.
COPY backup.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh
