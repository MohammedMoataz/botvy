-- Cursors and tombstones for device sync.
--
-- The phone pulls "everything that changed since <server timestamp>", which
-- needs a modification time on every entity it mirrors, and needs a deletion
-- to leave something behind — a row that simply vanishes cannot appear in a
-- delta, so an offline device would never learn about it.

-- AlterTable
ALTER TABLE "checkins" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "workout_records" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing rows say when they were actually written, not when this migration
-- ran — otherwise every historical row looks like it changed today and the
-- first delta after deploy ships the entire history.
UPDATE "checkins"        SET "updated_at" = "created_at";
UPDATE "workout_records" SET "updated_at" = "created_at";

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "checkins_user_id_updated_at_idx" ON "checkins"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "reminders_user_id_updated_at_idx" ON "reminders"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "workout_records_user_id_updated_at_idx" ON "workout_records"("user_id", "updated_at");
