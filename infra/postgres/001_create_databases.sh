#!/bin/bash
# n8n keeps its own database in the same server. It is workflow infrastructure,
# not an application: it stores its workflows and executions here and reaches no
# product data, which is what principle II means by "one credential and no data".
#
# A shell script rather than the .sql this used to be, because the database name
# is `N8N_DB` and a plain .sql file cannot read it. The hard-coded `n8n` this
# replaces meant a host that set the variable — as one running v1's n8n
# alongside must — got an n8n that never connected to anything:
#
#   Initial database connection attempt 1 failed: database "n8n_v2" does not exist
#
# Runs only on an empty data directory, so it is safe to leave in place. On a
# server whose volume already exists, create the database by hand instead.
set -euo pipefail

db="${N8N_DB:-n8n}"

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname postgres <<SQL
SELECT 'CREATE DATABASE "${db}"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db}')\gexec
SQL

echo "n8n database '${db}' is present"
