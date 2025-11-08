-- CreateTable
CREATE TABLE "SmsSettings" (
    "id" TEXT NOT NULL,
    "apiUrl" TEXT,
    "apiKey" TEXT,
    "sender" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsSettings_pkey" PRIMARY KEY ("id")
);
