-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'SUPERVISOR', 'WAREHOUSE', 'EMPLOYEE');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "supervisorId" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("companyId","id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserScope" (
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allUnits" BOOLEAN NOT NULL,
    "employeeId" TEXT,

    CONSTRAINT "UserScope_pkey" PRIMARY KEY ("companyId","userId")
);

-- CreateTable
CREATE TABLE "ScopeUnit" (
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "ScopeUnit_pkey" PRIMARY KEY ("companyId","userId","unitId")
);

-- CreateTable
CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "key" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Unit_companyId_name_key" ON "Unit"("companyId", "name");

-- CreateIndex
CREATE INDEX "Employee_companyId_unitId_supervisorId_idx" ON "Employee"("companyId", "unitId", "supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_registration_key" ON "Employee"("companyId", "registration");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_unitId_id_key" ON "Employee"("companyId", "unitId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserScope_userId_idx" ON "UserScope"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserScope_companyId_employeeId_key" ON "UserScope"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "ScopeUnit_companyId_unitId_idx" ON "ScopeUnit"("companyId", "unitId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_startedAt_idx" ON "LoginAttempt"("startedAt");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_unitId_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "Unit"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_unitId_supervisorId_fkey" FOREIGN KEY ("companyId", "unitId", "supervisorId") REFERENCES "Employee"("companyId", "unitId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeUnit" ADD CONSTRAINT "ScopeUnit_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "UserScope"("companyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeUnit" ADD CONSTRAINT "ScopeUnit_companyId_unitId_fkey" FOREIGN KEY ("companyId", "unitId") REFERENCES "Unit"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariants also enforced by the application forms.
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_supervisor_is_other" CHECK ("supervisorId" IS DISTINCT FROM "id");
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_role_matches_scope" CHECK (
    ("role" = 'ADMIN' AND "allUnits" AND "employeeId" IS NULL)
    OR ("role" IN ('MANAGER', 'WAREHOUSE') AND "employeeId" IS NULL)
    OR ("role" IN ('EMPLOYEE', 'SUPERVISOR') AND NOT "allUnits" AND "employeeId" IS NOT NULL)
);
