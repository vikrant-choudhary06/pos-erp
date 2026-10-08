/*
  Warnings:

  - You are about to drop the `InvoiceSequence` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "Invoice_orderId_key";

-- DropTable
DROP TABLE "InvoiceSequence";

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");
