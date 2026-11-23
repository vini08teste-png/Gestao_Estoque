CREATE TABLE "DeliveryReceipt" (
    "companyId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryReceipt_pkey" PRIMARY KEY ("companyId", "deliveryId"),
    CONSTRAINT "DeliveryReceipt_delivery_fkey" FOREIGN KEY ("companyId", "deliveryId") REFERENCES "Delivery"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReceipt_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
