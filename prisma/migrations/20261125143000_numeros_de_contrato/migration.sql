BEGIN;

ALTER TABLE "Warehouse" ADD COLUMN "contractNumber" VARCHAR(120);
ALTER TABLE "Delivery" ADD COLUMN "contractNumber" VARCHAR(120);
CREATE UNIQUE INDEX "Warehouse_companyId_unitId_contractNumber_key"
  ON "Warehouse"("companyId", "unitId", "contractNumber");

COMMIT;
