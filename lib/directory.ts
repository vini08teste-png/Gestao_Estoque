import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { canAdminister, type AccessScope } from "./auth";

export const canAddEmployees = (scope: AccessScope) =>
  canAdminister(scope) || scope.role === "MANAGER" || (scope.role === "SUPERVISOR" && scope.employee?.active === true && Boolean(scope.employee.contractId));

export const canGrantSupervisorAccess = (scope: AccessScope) => scope.role === "MANAGER";

export function contractStockWhere(scope: AccessScope): Prisma.WarehouseWhereInput {
  return scope.role === "SUPERVISOR" ? { id: scope.employee?.contractId ?? "" } : {};
}

export function unitsWhere(scope: AccessScope): Prisma.UnitWhereInput {
  const companyId = scope.companyId;
  if (scope.role === "EMPLOYEE" || scope.role === "SUPERVISOR") {
    return { companyId, id: scope.employee?.unitId ?? "" };
  }
  if (scope.allUnits) return { companyId };
  return { companyId, id: { in: scope.units.map(({ unitId }) => unitId) } };
}

export function employeesWhere(scope: AccessScope): Prisma.EmployeeWhereInput {
  const companyId = scope.companyId;
  if (scope.role === "EMPLOYEE") return { companyId, id: scope.employee?.id ?? "" };
  if (scope.role === "SUPERVISOR") return {
    companyId, unitId: scope.employee?.unitId ?? "", contractId: scope.employee?.contractId ?? "",
  };
  if (scope.allUnits) return { companyId };
  return { companyId, unitId: { in: scope.units.map(({ unitId }) => unitId) } };
}
