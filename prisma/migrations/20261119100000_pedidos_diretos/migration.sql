BEGIN;

ALTER TABLE "Company"
    ADD COLUMN "requestApprovalEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "EquipmentRequest"
SET "status" = CASE
        WHEN "equipmentId" IS NULL THEN 'WAITING_CATALOG'::"RequestStatus"
        ELSE 'WAITING_DELIVERY'::"RequestStatus"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING_APPROVAL';

COMMIT;
