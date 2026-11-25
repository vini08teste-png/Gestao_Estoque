BEGIN;
ALTER TABLE "DeliveryReceipt"
  ADD COLUMN "verificationCode" TEXT,
  ADD COLUMN "signedContent" TEXT,
  ADD COLUMN "signatureHash" TEXT,
  ADD CONSTRAINT "DeliveryReceipt_signature_complete" CHECK (
    num_nonnulls("verificationCode", "signedContent", "signatureHash") IN (0, 3)
  );
CREATE UNIQUE INDEX "DeliveryReceipt_verificationCode_key" ON "DeliveryReceipt"("verificationCode");
COMMIT;
