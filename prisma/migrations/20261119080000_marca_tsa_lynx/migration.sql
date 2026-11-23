BEGIN;

UPDATE "Company"
SET "name" = 'TSA Lynx'
WHERE "id" = 'lynx' AND lower(trim("name")) IN ('lyns', 'lynx', 'lynx process', 'tsa lynx process');

UPDATE "Employee"
SET "name" = replace("name", ' Exemplo Lynx ', ' Exemplo TSA Lynx ')
WHERE "companyId" = 'lynx'
  AND "name" ~ '^(Almoxarife|Colaborador|Encarregado|Gestor) Exemplo Lynx [0-9]+$';

UPDATE "UserScope"
SET "name" = replace("name", ' Exemplo Lynx ', ' Exemplo TSA Lynx ')
WHERE "companyId" = 'lynx'
  AND "name" ~ '^(Administrador|Almoxarife|Colaborador|Encarregado|Gestor) Exemplo Lynx [0-9]+$';

COMMIT;
