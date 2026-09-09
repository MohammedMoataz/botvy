-- Runs once, at first container start, via docker-entrypoint-initdb.d.
-- The postgres image already creates the database named by POSTGRES_DB
-- (set to "botvy" in docker-compose.yml); this script additionally creates
-- the "n8n" database on the same instance, so n8n never needs its own
-- SQLite file (constitution: Gateway Owns All Data / one stateful service).
SELECT 'CREATE DATABASE n8n'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')
\gexec
