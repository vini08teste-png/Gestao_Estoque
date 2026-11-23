CREATE TABLE "ExpectedItem" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "unitId" TEXT,
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "equipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ExpectedItem_pkey" PRIMARY KEY ("companyId", "id"),
    CONSTRAINT "ExpectedItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpectedItem_unit_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "Unit"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpectedItem_equipment_fkey" FOREIGN KEY ("companyId", "equipmentId") REFERENCES "Equipment"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpectedItem_valid_target" CHECK ("unitId" IS NOT NULL OR length(trim("jobTitle")) > 0),
    CONSTRAINT "ExpectedItem_valid_quantity" CHECK ("quantity" BETWEEN 1 AND 1000000)
);

CREATE INDEX "ExpectedItem_companyId_unitId_jobTitle_idx" ON "ExpectedItem"("companyId", "unitId", "jobTitle");
CREATE UNIQUE INDEX "ExpectedItem_unique_target" ON "ExpectedItem"("companyId", "unitId", "jobTitle", "equipmentId") NULLS NOT DISTINCT;
