-- CreateEnum
CREATE TYPE "RemixerEarningType" AS ENUM ('ROYALTY_DOWNLOAD', 'REMIX_BOUNTY', 'PAYOUT_DEDUCTION', 'PAYOUT_REFUND', 'PLATFORM_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('PAYPAL', 'BANK_TRANSFER');

-- AlterTable
ALTER TABLE "tracks" ADD COLUMN     "remixer_id" TEXT;

-- CreateTable
CREATE TABLE "remixer_earnings" (
    "id" TEXT NOT NULL,
    "remixer_id" TEXT NOT NULL,
    "amount_credits" DECIMAL(10,2) NOT NULL,
    "type" "RemixerEarningType" NOT NULL,
    "track_id" TEXT,
    "request_id" TEXT,
    "payout_request_id" TEXT,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remixer_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_requests" (
    "id" TEXT NOT NULL,
    "remixer_id" TEXT NOT NULL,
    "credits_amount" DECIMAL(10,2) NOT NULL,
    "amount_fiat" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PayoutMethod" NOT NULL,
    "destination_details" JSONB NOT NULL,
    "admin_feedback" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "remixer_earnings_remixer_id_idx" ON "remixer_earnings"("remixer_id");

-- CreateIndex
CREATE INDEX "remixer_earnings_type_idx" ON "remixer_earnings"("type");

-- CreateIndex
CREATE INDEX "remixer_earnings_track_id_idx" ON "remixer_earnings"("track_id");

-- CreateIndex
CREATE INDEX "remixer_earnings_request_id_idx" ON "remixer_earnings"("request_id");

-- CreateIndex
CREATE INDEX "remixer_earnings_payout_request_id_idx" ON "remixer_earnings"("payout_request_id");

-- CreateIndex
CREATE INDEX "remixer_earnings_created_at_idx" ON "remixer_earnings"("created_at");

-- CreateIndex
CREATE INDEX "payout_requests_remixer_id_idx" ON "payout_requests"("remixer_id");

-- CreateIndex
CREATE INDEX "payout_requests_status_idx" ON "payout_requests"("status");

-- CreateIndex
CREATE INDEX "payout_requests_created_at_idx" ON "payout_requests"("created_at");

-- CreateIndex
CREATE INDEX "tracks_remixer_id_idx" ON "tracks"("remixer_id");

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_remixer_id_fkey" FOREIGN KEY ("remixer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remixer_earnings" ADD CONSTRAINT "remixer_earnings_remixer_id_fkey" FOREIGN KEY ("remixer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remixer_earnings" ADD CONSTRAINT "remixer_earnings_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remixer_earnings" ADD CONSTRAINT "remixer_earnings_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "remix_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remixer_earnings" ADD CONSTRAINT "remixer_earnings_payout_request_id_fkey" FOREIGN KEY ("payout_request_id") REFERENCES "payout_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_remixer_id_fkey" FOREIGN KEY ("remixer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
