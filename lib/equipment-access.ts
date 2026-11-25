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
  if (scope.role === "EMPLOYEE") return personalDeliveryWhere(scope);
  const personalId = ownEmployeeId(scope);
  if (personalId) return { companyId, voidedAt: null, OR: [{ employeeId: personalId }, operationalDeliveryWhere(scope)] };
  return operationalDeliveryWhere(scope);
}

export function personalDeliveryWhere(scope: AccessScope) {
  return { companyId: scope.companyId, employeeId: ownEmployeeId(scope), voidedAt: null };
}

export function operationalDeliveryWhere(scope: AccessScope): Prisma.DeliveryWhereInput {
  const unit = unitsWhere(scope);
  return {
    companyId: scope.companyId,
    voidedAt: null,
    OR: [{ stock: { warehouse: { unit } } }, { warehouseId: null, employee: { unit } }],
    ...(scope.role === "SUPERVISOR" ? { employee: employeesWhere(scope) } : {}),
  };
}

export const deliveriesAwaitingReceipt = { warehouseId: { not: null }, receipt: null } satisfies Prisma.DeliveryWhereInput;

export function deliveryCorrectionFields(delivery: {
  warehouseId: string | null; requestId: string | null; retirement: object | null; proof: object | null;
  _count: { replacementRequests: number };
}) {
  const linked = Boolean(delivery.requestId || delivery.retirement || delivery._count.replacementRequests);
  return { quantity: !linked, assignment: !linked && !delivery.warehouseId && !delivery.proof };
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
