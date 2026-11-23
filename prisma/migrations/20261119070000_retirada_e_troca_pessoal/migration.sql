BEGIN;
CREATE TYPE "RetirementReason" AS ENUM ('EXPIRED', 'DAMAGED', 'OTHER');
ALTER TABLE "EquipmentRequest" ADD COLUMN "replacementForId" TEXT;
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_replacementFor_fkey"
    FOREIGN KEY ("companyId", "replacementForId") REFERENCES "Delivery" ("companyId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "EquipmentRequest_companyId_replacementForId_idx"
    ON "EquipmentRequest" ("companyId", "replacementForId");
CREATE UNIQUE INDEX "EquipmentRequest_one_open_replacement"
    ON "EquipmentRequest" ("companyId", "replacementForId")
    WHERE "replacementForId" IS NOT NULL AND "status" IN ('WAITING_CATALOG', 'PENDING_APPROVAL', 'WAITING_DELIVERY');
CREATE TABLE "DeliveryRetirement" (
    "companyId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" "RetirementReason" NOT NULL,
    "note" TEXT NOT NULL CHECK (length(trim("note")) > 0),
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryRetirement_pkey" PRIMARY KEY ("companyId", "deliveryId"),
    CONSTRAINT "DeliveryRetirement_delivery_fkey" FOREIGN KEY ("companyId", "deliveryId") REFERENCES "Delivery" ("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryRetirement_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
COMMIT;
