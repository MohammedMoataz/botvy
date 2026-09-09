-- v2 Identity. Additive only: v1's tables are untouched and its running stack
-- keeps using them. Migrations only go forward, so a correction is a new file.

-- Google sign-in, and a tombstone rather than a row that vanishes: deleting the
-- row would take the audit trail's actor with it, and every Mongo context still
-- has the member's documents to purge on identity.UserDeleted.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "google_sub" TEXT,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS "users_google_sub_key" ON "users"("google_sub");

-- Refresh-token families. Presenting a token that was already exchanged means
-- it leaked; without a family there is no way to tell one rotation from a theft,
-- and no way to revoke the descendants of a stolen one.
ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "family_id" UUID,
  ADD COLUMN IF NOT EXISTS "replaced_by" TEXT,
  ADD COLUMN IF NOT EXISTS "device_id" UUID;

-- Existing rows predate families, so each becomes its own: they were issued by
-- separate sign-ins as far as anyone can now tell, and lumping them together
-- would make one sign-out revoke unrelated sessions.
UPDATE "refresh_tokens" SET "family_id" = gen_random_uuid() WHERE "family_id" IS NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "refresh_tokens_user_family_idx"
  ON "refresh_tokens"("user_id", "family_id");

-- Device kind. v1 knew only phones, so the default preserves what is there.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeviceKind') THEN
    CREATE TYPE "DeviceKind" AS ENUM ('android', 'ios', 'chrome_extension', 'web');
  END IF;
END
$$;

ALTER TABLE "devices"
  ADD COLUMN IF NOT EXISTS "kind" "DeviceKind" NOT NULL DEFAULT 'android';

-- Machine callers.
CREATE TABLE IF NOT EXISTS "service_clients" (
  "id"           UUID PRIMARY KEY,
  "name"         TEXT UNIQUE NOT NULL,
  "token_hash"   TEXT NOT NULL,
  "scopes"       TEXT[] NOT NULL DEFAULT '{}',
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_used_at" TIMESTAMPTZ,
  "revoked_at"   TIMESTAMPTZ
);

-- Identity's events, written inside the transaction that raised them.
CREATE TABLE IF NOT EXISTS "identity_outbox" (
  "id"             TEXT PRIMARY KEY,
  "name"           TEXT NOT NULL,
  "aggregate"      JSONB NOT NULL,
  "user_id"        UUID,
  "payload"        JSONB NOT NULL,
  "schema_version" INT NOT NULL DEFAULT 1,
  "occurred_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "forwarded_at"   TIMESTAMPTZ
);

-- The forwarder's only query: oldest unforwarded first.
CREATE INDEX IF NOT EXISTS "identity_outbox_pending_idx"
  ON "identity_outbox"("forwarded_at", "occurred_at");
