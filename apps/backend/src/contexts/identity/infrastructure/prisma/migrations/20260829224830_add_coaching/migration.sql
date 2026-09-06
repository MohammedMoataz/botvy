-- CreateEnum
CREATE TYPE "WorkoutSource" AS ENUM ('reported', 'planned');

-- CreateTable
CREATE TABLE "coaching_profiles" (
    "user_id" TEXT NOT NULL,
    "opted_in" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "weight_kg" DOUBLE PRECISION,
    "height_cm" DOUBLE PRECISION,
    "goal" TEXT,
    "experience" TEXT,
    "liked_foods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disliked_foods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "training_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "gym_time" TEXT,
    "awaiting_checkin" BOOLEAN NOT NULL DEFAULT false,
    "awaiting_since" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coaching_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "checkins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "checkin_date" TEXT NOT NULL,
    "adhered" BOOLEAN NOT NULL,
    "raw_reply" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workout_date" TEXT NOT NULL,
    "source" "WorkoutSource" NOT NULL,
    "exercises" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "muscle_groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkins_user_id_checkin_date_key" ON "checkins"("user_id", "checkin_date");

-- CreateIndex
CREATE UNIQUE INDEX "workout_records_user_id_workout_date_key" ON "workout_records"("user_id", "workout_date");

-- AddForeignKey
ALTER TABLE "coaching_profiles" ADD CONSTRAINT "coaching_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_records" ADD CONSTRAINT "workout_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
