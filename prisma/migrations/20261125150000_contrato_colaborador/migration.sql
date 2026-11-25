BEGIN;

ALTER TABLE "Employee" ALTER COLUMN "department" SET DEFAULT '';
ALTER TABLE "Employee" ADD COLUMN "contractId" TEXT;
CREATE UNIQUE INDEX "Warehouse_companyId_unitId_id_key" ON "Warehouse"("companyId", "unitId", "id");
CREATE INDEX "Employee_companyId_unitId_contractId_idx" ON "Employee"("companyId", "unitId", "contractId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_unitId_contractId_fkey"
  FOREIGN KEY ("companyId", "unitId", "contractId") REFERENCES "Warehouse"("companyId", "unitId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
