BEGIN;

ALTER TABLE "Delivery"
  ALTER COLUMN "warehouseId" DROP NOT NULL,
  ALTER COLUMN "lotId" DROP NOT NULL,
  ADD CONSTRAINT "Delivery_stock_source" CHECK (
    ("warehouseId" IS NOT NULL AND "lotId" IS NOT NULL)
    OR ("warehouseId" IS NULL AND "lotId" IS NULL AND "requestId" IS NULL)
  );

DROP INDEX "StockMovement_companyId_deliveryId_key";
CREATE INDEX "StockMovement_companyId_deliveryId_idx" ON "StockMovement"("companyId", "deliveryId");

COMMIT;
