-- A client-generated id identifies a row within one account, not globally.
-- With a global unique index, one user's id could mask another user's message
-- or reminder, and the dedupe lookup would report someone else's row.

-- DropIndex
DROP INDEX "messages_client_id_key";

-- DropIndex
DROP INDEX "reminders_client_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "messages_user_id_client_id_key" ON "messages"("user_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_user_id_client_id_key" ON "reminders"("user_id", "client_id");
