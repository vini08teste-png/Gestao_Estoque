BEGIN;
CREATE TYPE "ItemCategory" AS ENUM ('EPI', 'UNIFORM');
ALTER TABLE "Equipment"
    ADD COLUMN "category" "ItemCategory" NOT NULL DEFAULT 'EPI',
    ALTER COLUMN "certificate" DROP NOT NULL,
    ALTER COLUMN "caExpiresAt" DROP NOT NULL,
    ALTER COLUMN "replacementDays" DROP NOT NULL;
ALTER TABLE "Delivery"
    ALTER COLUMN "suggestedAt" DROP NOT NULL,
    ALTER COLUMN "replacementAt" DROP NOT NULL;
COMMIT;
