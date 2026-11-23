-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING_APPROVAL', 'WAITING_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Equipment" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "makerModel" TEXT NOT NULL,
    "certificate" TEXT NOT NULL,
    "caExpiresAt" DATE NOT NULL,
    "replacementDays" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "EquipmentLot" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" DATE,
    "blocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EquipmentLot_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("companyId","warehouseId","lotId")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryId" TEXT,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "required" BOOLEAN NOT NULL,

    CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentRequest" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decisionNote" TEXT,

    CONSTRAINT "EquipmentRequest_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" TEXT,
    "quantity" INTEGER NOT NULL,
    "deliveredAt" DATE NOT NULL,
    "suggestedAt" DATE NOT NULL,
    "replacementAt" DATE NOT NULL,
    "adjustmentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "DeliveryProof" (
    "companyId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("companyId","deliveryId")
);

-- CreateTable
CREATE TABLE "EquipmentEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Equipment_companyId_name_idx" ON "Equipment"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_companyId_unitId_name_key" ON "Warehouse"("companyId", "unitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentLot_companyId_equipmentId_code_key" ON "EquipmentLot"("companyId", "equipmentId", "code");

-- CreateIndex
CREATE INDEX "Stock_companyId_lotId_idx" ON "Stock"("companyId", "lotId");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_warehouseId_lotId_occurredAt_idx" ON "StockMovement"("companyId", "warehouseId", "lotId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_companyId_deliveryId_key" ON "StockMovement"("companyId", "deliveryId");

-- CreateIndex
CREATE INDEX "ApprovalRule_companyId_unitId_equipmentId_idx" ON "ApprovalRule"("companyId", "unitId", "equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentRequest_companyId_unitId_status_idx" ON "EquipmentRequest"("companyId", "unitId", "status");

-- CreateIndex
CREATE INDEX "EquipmentRequest_companyId_employeeId_openedAt_idx" ON "EquipmentRequest"("companyId", "employeeId", "openedAt");

-- CreateIndex
CREATE INDEX "Delivery_companyId_employeeId_equipmentId_deliveredAt_creat_idx" ON "Delivery"("companyId", "employeeId", "equipmentId", "deliveredAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_companyId_requestId_key" ON "Delivery"("companyId", "requestId");

-- CreateIndex
CREATE INDEX "EquipmentEvent_companyId_subjectId_occurredAt_idx" ON "EquipmentEvent"("companyId", "subjectId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_unitId_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "Unit"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLot" ADD CONSTRAINT "EquipmentLot_companyId_equipmentId_fkey" FOREIGN KEY ("companyId", "equipmentId") REFERENCES "Equipment"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_companyId_lotId_fkey" FOREIGN KEY ("companyId", "lotId") REFERENCES "EquipmentLot"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_warehouseId_lotId_fkey" FOREIGN KEY ("companyId", "warehouseId", "lotId") REFERENCES "Stock"("companyId", "warehouseId", "lotId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_deliveryId_fkey" FOREIGN KEY ("companyId", "deliveryId") REFERENCES "Delivery"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_companyId_unitId_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "Unit"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_companyId_equipmentId_fkey" FOREIGN KEY ("companyId", "equipmentId") REFERENCES "Equipment"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_companyId_unitId_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "Unit"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_companyId_equipmentId_fkey" FOREIGN KEY ("companyId", "equipmentId") REFERENCES "Equipment"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_companyId_equipmentId_fkey" FOREIGN KEY ("companyId", "equipmentId") REFERENCES "Equipment"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_companyId_warehouseId_lotId_fkey" FOREIGN KEY ("companyId", "warehouseId", "lotId") REFERENCES "Stock"("companyId", "warehouseId", "lotId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_companyId_requestId_fkey" FOREIGN KEY ("companyId", "requestId") REFERENCES "EquipmentRequest"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_companyId_deliveryId_fkey" FOREIGN KEY ("companyId", "deliveryId") REFERENCES "Delivery"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentEvent" ADD CONSTRAINT "EquipmentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Stock" ADD CONSTRAINT "Stock_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_delta_sign" CHECK (
    ("deliveryId" IS NULL AND "delta" > 0) OR ("deliveryId" IS NOT NULL AND "delta" < 0)
);
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_positive_replacement" CHECK ("replacementDays" > 0);
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_valid_values" CHECK (
    "quantity" > 0 AND ("status" <> 'REJECTED' OR length(trim(coalesce("decisionNote", ''))) > 0)
);
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_valid_values" CHECK (
    "quantity" > 0 AND "suggestedAt" >= "deliveredAt" AND "replacementAt" >= "deliveredAt"
    AND ("replacementAt" = "suggestedAt" OR length(trim(coalesce("adjustmentNote", ''))) > 0)
);
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_valid_content" CHECK (
    octet_length("content") BETWEEN 1 AND 3145728 AND "mime" IN ('application/pdf', 'image/png', 'image/jpeg')
);
CREATE UNIQUE INDEX "ApprovalRule_unit_general_unique" ON "ApprovalRule" ("companyId", "unitId") WHERE "equipmentId" IS NULL;
CREATE UNIQUE INDEX "ApprovalRule_unit_equipment_unique" ON "ApprovalRule" ("companyId", "unitId", "equipmentId") WHERE "equipmentId" IS NOT NULL;
