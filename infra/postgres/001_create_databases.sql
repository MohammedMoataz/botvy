-- n8n keeps its own database in the same server. It is workflow infrastructure,
-- not an application: it stores its workflows and executions here and reaches
-- no product data, which is what principle II means by "one credential and no
-- data".
--
-- Runs only on an empty data directory, so it is safe to leave in place.
SELECT 'CREATE DATABASE n8n'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')\gexec
