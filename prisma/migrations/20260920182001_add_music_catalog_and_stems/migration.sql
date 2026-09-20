-- CreateEnum
CREATE TYPE "StemType" AS ENUM ('DRUMS', 'BASS', 'VOCALS', 'SYNTHS', 'INSTRUMENTS', 'OTHER');

-- CreateTable
CREATE TABLE "genres" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "remixer" TEXT,
    "version" TEXT,
    "genre_id" TEXT NOT NULL,
    "bpm" INTEGER NOT NULL,
    "musical_key" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "preview_audio_url" TEXT NOT NULL,
    "download_audio_url" TEXT NOT NULL,
    "cover_image_url" TEXT,
    "waveform_json" JSONB,
    "credit_cost" INTEGER NOT NULL DEFAULT 1,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stems" (
    "id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StemType" NOT NULL,
    "audio_url" TEXT NOT NULL,
    "credit_cost" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stems_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "genres_slug_key" ON "genres"("slug");

-- CreateIndex
CREATE INDEX "tracks_genre_id_idx" ON "tracks"("genre_id");

-- CreateIndex
CREATE INDEX "tracks_bpm_idx" ON "tracks"("bpm");

-- CreateIndex
CREATE INDEX "tracks_musical_key_idx" ON "tracks"("musical_key");

-- CreateIndex
CREATE INDEX "tracks_is_published_idx" ON "tracks"("is_published");

-- CreateIndex
CREATE INDEX "stems_track_id_idx" ON "stems"("track_id");

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stems" ADD CONSTRAINT "stems_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
