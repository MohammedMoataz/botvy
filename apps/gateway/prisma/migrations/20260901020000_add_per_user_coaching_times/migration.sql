-- AlterTable
ALTER TABLE "coaching_profiles" ADD COLUMN     "checkin_time" TEXT,
ADD COLUMN     "default_lead_times" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "language" TEXT,
ADD COLUMN     "last_checkin_sent_date" TEXT,
ADD COLUMN     "last_program_sent_date" TEXT,
ADD COLUMN     "program_time" TEXT;
