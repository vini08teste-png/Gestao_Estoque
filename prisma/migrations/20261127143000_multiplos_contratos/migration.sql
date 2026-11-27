BEGIN;

CREATE TABLE "EmployeeContract" (
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "manages" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "EmployeeContract_pkey" PRIMARY KEY ("companyId", "employeeId", "warehouseId"),
    CONSTRAINT "EmployeeContract_employee_fkey" FOREIGN KEY ("companyId", "employeeId")
      REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmployeeContract_warehouse_fkey" FOREIGN KEY ("companyId", "warehouseId")
      REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "EmployeeContract_companyId_warehouseId_idx" ON "EmployeeContract"("companyId", "warehouseId");

ALTER TABLE "EquipmentRequest" ADD COLUMN "contractId" TEXT;
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_companyId_unitId_contractId_fkey"
    FOREIGN KEY ("companyId", "unitId", "contractId") REFERENCES "Warehouse"("companyId", "unitId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "EquipmentRequest_companyId_contractId_status_idx" ON "EquipmentRequest"("companyId", "contractId", "status");

UPDATE "EquipmentRequest" AS r SET "contractId" = d."warehouseId"
FROM "Delivery" AS d
JOIN "Warehouse" AS w ON w."companyId" = d."companyId" AND w.id = d."warehouseId"
WHERE r."companyId" = d."companyId" AND r.id = d."requestId" AND r."unitId" = w."unitId";

COMMIT;
