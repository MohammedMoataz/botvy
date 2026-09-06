-- AlterTable
ALTER TABLE "reminder_notifications" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "client_id" TEXT,
ADD COLUMN     "lead_times" TEXT[] DEFAULT ARRAY['1h', '0m']::TEXT[],
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "reminders_client_id_key" ON "reminders"("client_id");
