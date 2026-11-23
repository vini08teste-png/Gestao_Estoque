CREATE TABLE "ReplacementPhoto" (
    "companyId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    CONSTRAINT "ReplacementPhoto_pkey" PRIMARY KEY ("companyId", "requestId"),
    CONSTRAINT "ReplacementPhoto_request_fkey" FOREIGN KEY ("companyId", "requestId")
        REFERENCES "EquipmentRequest" ("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReplacementPhoto_valid_content" CHECK (
        "mime" IN ('image/jpeg', 'image/png', 'image/webp')
        AND "sha256" ~ '^[0-9a-f]{64}$'
        AND octet_length("content") BETWEEN 1 AND 3145728
    )
);
