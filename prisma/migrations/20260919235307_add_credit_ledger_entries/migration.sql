-- CreateEnum
CREATE TYPE "CreditEntryType" AS ENUM ('PLAN_SUBSCRIPTION', 'TOPUP_PURCHASE', 'REMIX_DOWNLOAD', 'REMIX_REQUEST', 'ADMIN_ADJUSTMENT');

-- CreateTable
CREATE TABLE "credit_ledger_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "CreditEntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_ledger_entries_user_id_idx" ON "credit_ledger_entries"("user_id");

-- AddForeignKey
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
