-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSystemUser" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT;
