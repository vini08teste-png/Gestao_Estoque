BEGIN;

ALTER TABLE "DeliveryReceipt" ADD COLUMN "historical" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN "employeeOnly" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "DeliveryReceipt" ("companyId", "deliveryId", "actorId", "historical")
SELECT delivery."companyId", delivery."id", delivery."actorId", true
FROM "Delivery" AS delivery
WHERE delivery."voidedAt" IS NULL
ON CONFLICT ("companyId", "deliveryId") DO NOTHING;

COMMIT;
