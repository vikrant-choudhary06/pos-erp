-- CreateEnum
CREATE TYPE "HotelReservationStatus" AS ENUM ('RESERVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "HotelRoomStatus" AS ENUM ('READY', 'DIRTY', 'CLEANING', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "HotelEntryKind" AS ENUM ('ROOM', 'RESTAURANT', 'EXTRA', 'PAYMENT', 'REFUND', 'CREDIT');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CHARGED';

-- CreateTable
CREATE TABLE "HotelProperty" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRoomType" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "nightlyRate" DECIMAL(12,2) NOT NULL,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "HotelRoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRoom" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "roomTypeId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "floor" TEXT,
    "status" "HotelRoomStatus" NOT NULL DEFAULT 'READY',
    "note" TEXT,

    CONSTRAINT "HotelRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelGuest" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelReservation" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "guestId" UUID NOT NULL,
    "arrival" DATE NOT NULL,
    "departure" DATE NOT NULL,
    "guests" INTEGER NOT NULL,
    "nightlyRate" DECIMAL(12,2) NOT NULL,
    "taxPercent" DECIMAL(5,2) NOT NULL,
    "status" "HotelReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "allowRoomCharges" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelFolioEntry" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "kind" "HotelEntryKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "businessDate" DATE NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "orderId" UUID,
    "method" "PaymentMethod",
    "reference" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelFolioEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelDayClosing" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "roomCharges" DECIMAL(12,2) NOT NULL,
    "closedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelDayClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotelProperty_outletId_key" ON "HotelProperty"("outletId");

-- CreateIndex
CREATE INDEX "HotelProperty_tenantId_idx" ON "HotelProperty"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoomType_propertyId_name_key" ON "HotelRoomType"("propertyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoom_propertyId_number_key" ON "HotelRoom"("propertyId", "number");

-- CreateIndex
CREATE INDEX "HotelGuest_propertyId_phone_idx" ON "HotelGuest"("propertyId", "phone");

-- CreateIndex
CREATE INDEX "HotelReservation_propertyId_status_arrival_idx" ON "HotelReservation"("propertyId", "status", "arrival");

-- CreateIndex
CREATE INDEX "HotelReservation_roomId_arrival_departure_idx" ON "HotelReservation"("roomId", "arrival", "departure");

-- CreateIndex
CREATE UNIQUE INDEX "HotelFolioEntry_orderId_key" ON "HotelFolioEntry"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelFolioEntry_reservationId_sourceKey_key" ON "HotelFolioEntry"("reservationId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "HotelDayClosing_propertyId_businessDate_key" ON "HotelDayClosing"("propertyId", "businessDate");

-- AddForeignKey
ALTER TABLE "HotelProperty" ADD CONSTRAINT "HotelProperty_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProperty" ADD CONSTRAINT "HotelProperty_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoomType" ADD CONSTRAINT "HotelRoomType_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "HotelProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoom" ADD CONSTRAINT "HotelRoom_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "HotelProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoom" ADD CONSTRAINT "HotelRoom_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "HotelRoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelGuest" ADD CONSTRAINT "HotelGuest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "HotelProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "HotelProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HotelRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelReservation" ADD CONSTRAINT "HotelReservation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "HotelGuest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelFolioEntry" ADD CONSTRAINT "HotelFolioEntry_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "HotelReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelFolioEntry" ADD CONSTRAINT "HotelFolioEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelDayClosing" ADD CONSTRAINT "HotelDayClosing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "HotelProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
