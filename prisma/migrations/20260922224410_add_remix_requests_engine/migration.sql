-- CreateEnum
CREATE TYPE "RemixRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FundingType" AS ENUM ('INCLUDED_IN_PLAN', 'CREDITS_BOUNTY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CreditEntryType" ADD VALUE 'REMIX_REQUEST_ESCROW';
ALTER TYPE "CreditEntryType" ADD VALUE 'REMIX_REQUEST_REFUND';

-- CreateTable
CREATE TABLE "remix_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "remixer_id" TEXT,
    "track_id" TEXT,
    "genre_id" TEXT,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "reference_url" TEXT,
    "desired_bpm" INTEGER,
    "notes" TEXT,
    "funding_type" "FundingType" NOT NULL,
    "bounty_credits" INTEGER NOT NULL DEFAULT 0,
    "status" "RemixRequestStatus" NOT NULL DEFAULT 'PENDING',
    "admin_feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remix_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "remix_requests_user_id_idx" ON "remix_requests"("user_id");

-- CreateIndex
CREATE INDEX "remix_requests_remixer_id_idx" ON "remix_requests"("remixer_id");

-- CreateIndex
CREATE INDEX "remix_requests_track_id_idx" ON "remix_requests"("track_id");

-- CreateIndex
CREATE INDEX "remix_requests_genre_id_idx" ON "remix_requests"("genre_id");

-- CreateIndex
CREATE INDEX "remix_requests_status_idx" ON "remix_requests"("status");

-- CreateIndex
CREATE INDEX "remix_requests_funding_type_idx" ON "remix_requests"("funding_type");

-- AddForeignKey
ALTER TABLE "remix_requests" ADD CONSTRAINT "remix_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remix_requests" ADD CONSTRAINT "remix_requests_remixer_id_fkey" FOREIGN KEY ("remixer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remix_requests" ADD CONSTRAINT "remix_requests_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remix_requests" ADD CONSTRAINT "remix_requests_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE SET NULL ON UPDATE CASCADE;
