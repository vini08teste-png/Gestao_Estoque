UPDATE "Equipment"
SET "name" = UPPER("name")
WHERE "name" <> UPPER("name");
