BEGIN;

ALTER TABLE "Delivery" ADD COLUMN "returnedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_returned_quantity"
  CHECK ("returnedQuantity" BETWEEN 0 AND "quantity");

CREATE TABLE "DeliveryReturn" (
  "companyId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "returnedAt" DATE NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryReturn_pkey" PRIMARY KEY ("companyId", "requestId"),
  CONSTRAINT "DeliveryReturn_companyId_requestId_fkey" FOREIGN KEY ("companyId", "requestId") REFERENCES "EquipmentRequest"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryReturn_companyId_deliveryId_fkey" FOREIGN KEY ("companyId", "deliveryId") REFERENCES "Delivery"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeliveryReturn_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "DeliveryReturn_companyId_deliveryId_idx" ON "DeliveryReturn"("companyId", "deliveryId");

COMMIT;
