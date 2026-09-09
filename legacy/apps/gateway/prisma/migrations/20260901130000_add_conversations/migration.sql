-- Named conversations: one account's chat becomes many threads instead of one
-- endless transcript.
--
-- Every message must belong to exactly one, so `conversation_id` has to end up
-- NOT NULL — which cannot be added directly to a table that already has rows.
-- It arrives nullable, every existing user's history is folded into a single
-- thread, and only then is the constraint tightened. All forward, all here.
--
-- That backfilled thread is the *coaching* one (client_id = 'coaching'). An
-- existing transcript already contains that user's check-in replies, so giving
-- them a second, empty thread for the nightly cycle to speak into would split a
-- history that was never split.

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "client_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_user_id_client_id_key" ON "conversations"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "conversations_user_id_updated_at_idx" ON "conversations"("user_id", "updated_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "conversation_id" TEXT;

-- One thread per user who has ever said anything. `created_at` is their first
-- message, so the thread claims the age it actually has. `updated_at` is
-- deliberately left at CURRENT_TIMESTAMP, unlike the checkins/workout_records
-- backfill: it is one row per user, and every device — including one whose
-- cursor is older than its last message — must receive it on its very next
-- delta, or it holds messages filed under a thread it has never heard of.
INSERT INTO "conversations" ("id", "user_id", "title", "client_id", "created_at")
SELECT gen_random_uuid()::text, "user_id", '', 'coaching', MIN("created_at")
FROM "messages"
GROUP BY "user_id";

-- Unambiguous: "conversations" contains nothing but the rows just inserted,
-- exactly one per user_id.
UPDATE "messages" m
SET "conversation_id" = c."id"
FROM "conversations" c
WHERE c."user_id" = m."user_id";

-- Safe now: the INSERT covered every distinct user_id present in "messages",
-- so the UPDATE left no row null.
ALTER TABLE "messages" ALTER COLUMN "conversation_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "messages_conversation_id_id_idx" ON "messages"("conversation_id", "id" DESC);

-- AddForeignKey. The cascade is load-bearing: Message carries no tombstone of
-- its own, so a deleted thread reaches the device as the conversation's
-- tombstone, and the rows themselves go when the sweep purges it.
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
