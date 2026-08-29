-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('active', 'done', 'cancelled');

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_notifications" (
    "id" TEXT NOT NULL,
    "reminder_id" TEXT NOT NULL,
    "notify_at" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "reminder_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminders_user_id_remind_at_idx" ON "reminders"("user_id", "remind_at");

-- CreateIndex
CREATE INDEX "idx_notifications_due" ON "reminder_notifications"("notify_at");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_notifications_reminder_id_label_key" ON "reminder_notifications"("reminder_id", "label");

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_notifications" ADD CONSTRAINT "reminder_notifications_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
