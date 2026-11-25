BEGIN;

ALTER TABLE "Delivery" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "Delivery" DROP CONSTRAINT "Delivery_valid_values";
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_valid_values" CHECK ("quantity" > 0);

ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_delta_sign";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_delta_sign"
  CHECK ("delta" > 0 OR ("delta" < 0 AND "deliveryId" IS NOT NULL));

COMMIT;
