import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { canAdminister, type AccessScope } from "./auth";
import { employeesWhere, unitsWhere } from "./directory";

export const handlesStock = (scope: AccessScope) => canAdminister(scope) || scope.role === "MANAGER" ||
  scope.role === "WAREHOUSE" || (scope.role === "SUPERVISOR" && scope.employee?.active === true);
export const hasPersonalEquipment = (scope: AccessScope) => scope.employee?.active === true;
export const canSetStockMinimum = (scope: AccessScope) => canAdminister(scope) || scope.role === "MANAGER";

export function ownEmployeeId(scope: AccessScope) {
  return hasPersonalEquipment(scope) ? scope.employee?.id ?? "" : "";
}

export function deliveryWhere(scope: AccessScope): Prisma.DeliveryWhereInput {
  const companyId = scope.companyId;
  if (scope.role === "EMPLOYEE") return { companyId, employeeId: scope.employee?.id ?? "" };
  const personalId = ownEmployeeId(scope);
  if (personalId) return { companyId, OR: [{ employeeId: personalId }, operationalDeliveryWhere(scope)] };
  return operationalDeliveryWhere(scope);
}

export function operationalDeliveryWhere(scope: AccessScope): Prisma.DeliveryWhereInput {
  return {
    companyId: scope.companyId,
    stock: { warehouse: { unit: unitsWhere(scope) } },
    ...(scope.role === "SUPERVISOR" ? { employee: employeesWhere(scope) } : {}),
  };
}

export function requestWhere(scope: AccessScope): Prisma.EquipmentRequestWhereInput {
  const companyId = scope.companyId;
  if (scope.role === "EMPLOYEE") return { companyId, employeeId: scope.employee?.id ?? "" };
  return {
    companyId,
    unit: unitsWhere(scope),
    ...(scope.role === "SUPERVISOR" ? { employee: employeesWhere(scope) } : {}),
  };
}
