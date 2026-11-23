CREATE TABLE "StockMinimum" (
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "StockMinimum_pkey" PRIMARY KEY ("companyId", "unitId", "equipmentId"),
    CONSTRAINT "StockMinimum_unit_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "Unit"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMinimum_equipment_fkey" FOREIGN KEY ("companyId", "equipmentId") REFERENCES "Equipment"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMinimum_quantity_check" CHECK ("quantity" BETWEEN 0 AND 1000000)
);
