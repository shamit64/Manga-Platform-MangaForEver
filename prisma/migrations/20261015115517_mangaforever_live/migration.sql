-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_CHAPTER', 'REVIEW_HELPFUL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ChapterReactionKind" AS ENUM ('LOVED', 'HYPE', 'SAD', 'FUNNY', 'SHOCKED');

-- AlterTable
ALTER TABLE "ChapterMetadata" ADD COLUMN     "language" TEXT,
ADD COLUMN     "publisher" TEXT,
ADD COLUMN     "readable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FeaturedSeries" ADD COLUMN     "isAuto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MangaSeries" ADD COLUMN     "lastChapterAt" TIMESTAMP(3),
ADD COLUMN     "latestChapter" DOUBLE PRECISION,
ADD COLUMN     "sourceLinkCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "emailDigest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "favoriteTypes" "ContentType"[] DEFAULT ARRAY[]::"ContentType"[],
ADD COLUMN     "readerMode" TEXT;

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesSourceLink" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "lastChapterAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeriesSourceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostedPage" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "HostedPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesFollow" (
    "userId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeriesFollow_pkey" PRIMARY KEY ("userId","seriesId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "seriesId" TEXT,
    "chapterId" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterReaction" (
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "kind" "ChapterReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterReaction_pkey" PRIMARY KEY ("userId","chapterId")
);

-- CreateTable
CREATE TABLE "ChapterComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "containsSpoilers" BOOLEAN NOT NULL DEFAULT true,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "SeriesSourceLink_provider_lastCheckedAt_idx" ON "SeriesSourceLink"("provider", "lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesSourceLink_seriesId_provider_key" ON "SeriesSourceLink"("seriesId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesSourceLink_provider_externalId_key" ON "SeriesSourceLink"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "HostedPage_chapterId_index_key" ON "HostedPage"("chapterId", "index");

-- CreateIndex
CREATE INDEX "SeriesFollow_seriesId_idx" ON "SeriesFollow"("seriesId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_chapterId_key" ON "Notification"("userId", "chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "ChapterReaction_chapterId_kind_idx" ON "ChapterReaction"("chapterId", "kind");

-- CreateIndex
CREATE INDEX "ChapterComment_chapterId_isHidden_createdAt_idx" ON "ChapterComment"("chapterId", "isHidden", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ChapterComment_userId_createdAt_idx" ON "ChapterComment"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "ChapterMetadata_seriesId_number_idx" ON "ChapterMetadata"("seriesId", "number");

-- CreateIndex
CREATE INDEX "MangaSeries_lastChapterAt_idx" ON "MangaSeries"("lastChapterAt" DESC);

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesSourceLink" ADD CONSTRAINT "SeriesSourceLink_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MangaSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostedPage" ADD CONSTRAINT "HostedPage_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "ChapterMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesFollow" ADD CONSTRAINT "SeriesFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesFollow" ADD CONSTRAINT "SeriesFollow_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MangaSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MangaSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "ChapterMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterReaction" ADD CONSTRAINT "ChapterReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterReaction" ADD CONSTRAINT "ChapterReaction_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "ChapterMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterComment" ADD CONSTRAINT "ChapterComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterComment" ADD CONSTRAINT "ChapterComment_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "ChapterMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Accounts created before email confirmation existed are treated as confirmed.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;
