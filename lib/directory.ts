import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { canAdminister, type AccessScope } from "./auth";

export const canAddEmployees = (scope: AccessScope) =>
  canAdminister(scope) || scope.role === "MANAGER" || (scope.employee?.active === true && managedContracts(scope).length > 0);

export const canGrantSupervisorAccess = (scope: AccessScope) => scope.role === "MANAGER";

export const employeeRemovalSelect = {
  id: true,
  name: true,
  registration: true,
  active: true,
  scope: { select: { userId: true, active: true } },
  _count: { select: { deliveries: true, requests: true, team: true } },
} satisfies Prisma.EmployeeSelect;

export function employeeHasDependencies(employee: Prisma.EmployeeGetPayload<{ select: typeof employeeRemovalSelect }>) {
  const { deliveries, requests, team } = employee._count;
  return Boolean(employee.scope || deliveries || requests || team);
}

export function contractStockWhere(scope: AccessScope): Prisma.WarehouseWhereInput {
  return scope.role === "SUPERVISOR" ? { id: { in: managedContracts(scope) } } : {};
}

export function managedContracts(scope: AccessScope): string[] {
  if (scope.role !== "SUPERVISOR" || !scope.employee) return [];
  const { contractId, contractLinks } = scope.employee;
  return [
    ...(contractId && !contractLinks.some((entry) => entry.warehouseId === contractId) ? [contractId] : []),
    ...contractLinks.filter(({ manages }) => manages).map(({ warehouseId }) => warehouseId),
  ];
}

export const contractIdentity = { id: true, unitId: true, contractNumber: true, unit: { select: { name: true } } } as const;
export const employeeContractLinksSelect = { warehouseId: true, manages: true, warehouse: { select: contractIdentity } } as const;

export function employeeContractsWhere(employee: { id: string; contractId: string | null }): Prisma.WarehouseWhereInput {
  return { OR: [{ id: employee.contractId ?? "" }, { employeeLinks: { some: { employeeId: employee.id } } }] };
}

export function unitsWhere(scope: AccessScope): Prisma.UnitWhereInput {
  const companyId = scope.companyId;
  if (scope.role === "EMPLOYEE") {
    return { companyId, id: scope.employee?.unitId ?? "" };
  }
  if (scope.role === "SUPERVISOR") return { companyId, warehouses: { some: contractStockWhere(scope) } };
  if (scope.allUnits) return { companyId };
  return { companyId, id: { in: scope.units.map(({ unitId }) => unitId) } };
}

export function employeesWhere(scope: AccessScope): Prisma.EmployeeWhereInput {
  const companyId = scope.companyId;
  if (scope.role === "EMPLOYEE") return { companyId, id: scope.employee?.id ?? "" };
  if (scope.role === "SUPERVISOR") {
    const ids = managedContracts(scope);
    return { companyId, OR: [{ contractId: { in: ids } }, { contractLinks: { some: { warehouseId: { in: ids } } } }] };
  }
  if (scope.allUnits) return { companyId };
  const unitIds = scope.units.map(({ unitId }) => unitId);
  return { companyId, OR: [{ unitId: { in: unitIds } }, { contractLinks: { some: { warehouse: { unitId: { in: unitIds } } } } }] };
}
