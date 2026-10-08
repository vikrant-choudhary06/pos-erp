-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lastVisitAt" TIMESTAMP(3),
ADD COLUMN     "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "visits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinLockedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Counter" (
    "outletId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("outletId","key")
);
