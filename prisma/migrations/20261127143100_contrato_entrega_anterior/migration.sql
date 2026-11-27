BEGIN;

ALTER TABLE "Delivery" ADD COLUMN "historicalContractId" TEXT;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_companyId_historicalContractId_fkey"
    FOREIGN KEY ("companyId", "historicalContractId") REFERENCES "Warehouse"("companyId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Delivery_companyId_historicalContractId_idx" ON "Delivery"("companyId", "historicalContractId");

WITH unique_contracts AS (
    SELECT "companyId", "contractNumber", min(id) AS id
    FROM "Warehouse" WHERE "contractNumber" IS NOT NULL
    GROUP BY "companyId", "contractNumber" HAVING count(*) = 1
)
UPDATE "Delivery" d SET "historicalContractId" = w.id FROM unique_contracts w
WHERE d."companyId" = w."companyId" AND d."contractNumber" = w."contractNumber" AND d."warehouseId" IS NULL;

COMMIT;
