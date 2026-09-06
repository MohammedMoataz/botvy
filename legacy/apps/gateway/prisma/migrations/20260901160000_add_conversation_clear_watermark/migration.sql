-- Clearing a chat, in a way an offline device can learn about.
--
-- Messages have no tombstone and are pulled by `id > lastMessageId`, so
-- deleting them server-side is invisible to a phone that already holds them.
-- The conversation carries a watermark instead: it travels on the row's own
-- updatedAt cursor, and each device drops its local messages at or below it.
-- An id, not a timestamp, so clearing never depends on a clock.
--
-- Zero is the right default: no chat has been cleared, and message ids start
-- at 1, so nothing is caught by it.

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "cleared_up_to_message_id" INTEGER NOT NULL DEFAULT 0;
