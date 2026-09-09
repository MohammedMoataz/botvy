-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "client_id" TEXT,
ADD COLUMN     "composed_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "messages_client_id_key" ON "messages"("client_id");
