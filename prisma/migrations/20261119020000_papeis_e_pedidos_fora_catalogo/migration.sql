BEGIN;
ALTER TYPE "RequestStatus" ADD VALUE 'WAITING_CATALOG';
ALTER TABLE "EquipmentRequest" ALTER COLUMN "equipmentId" DROP NOT NULL;
ALTER TABLE "EquipmentRequest" ADD COLUMN "requestedItem" TEXT;

ALTER TABLE "UserScope" DROP CONSTRAINT "UserScope_role_matches_scope";
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_role_matches_scope" CHECK (
    ("role" = 'ADMIN' AND "allUnits")
    OR "role" IN ('MANAGER', 'WAREHOUSE')
    OR ("role" IN ('EMPLOYEE', 'SUPERVISOR') AND NOT "allUnits" AND "employeeId" IS NOT NULL)
);
COMMIT;

ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_catalog_state" CHECK (
    ("equipmentId" IS NOT NULL AND "status" <> 'WAITING_CATALOG')
    OR ("equipmentId" IS NULL AND length(trim(coalesce("requestedItem", ''))) > 0
        AND "status" IN ('WAITING_CATALOG', 'CANCELLED'))
);
