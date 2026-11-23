import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { unitsWhere } from "@/lib/directory";
import { requestWhere } from "@/lib/equipment-access";
import { todayInBrazil } from "@/lib/equipment";

export const defaultStockMinimum = 5;
export const stockKey = (unitId: string, equipmentId: string) => JSON.stringify([unitId, equipmentId]);

export function availableLotWhere(today: Date): Prisma.EquipmentLotWhereInput {
  return { blocked: false, equipment: { active: true }, OR: [{ expiresAt: null }, { expiresAt: { gte: today } }] };
}

type StockBalance = {
  unit: string;
  equipment: string;
  quantity: number;
  largestWarehouse: number;
};

export async function stockBalances(scope: AccessScope, unitIds: string[] = [], equipmentIds: string[] = [], personal = false) {
  const today = todayInBrazil();
  const unitAccess = personal ? { id: scope.employee?.unitId ?? "" } : unitsWhere(scope);
  const rows = await db.stock.findMany({
    where: {
      companyId: scope.companyId,
      warehouse: { active: true, unit: { ...unitAccess, active: true, ...(unitIds.length && { AND: [{ id: { in: unitIds } }] }) } },
      lot: { equipment: { active: true }, ...(equipmentIds.length && { equipmentId: { in: equipmentIds } }) },
    },
    select: {
      quantity: true,
      warehouseId: true,
      warehouse: { select: { unit: { select: { id: true, name: true } } } },
      lot: { select: { expiresAt: true, blocked: true, equipment: { select: { id: true, name: true } } } },
    },
  });
  const balances = new Map<string, StockBalance>();
  const warehouseTotals = new Map<string, number>();
  for (const row of rows) {
    const { unit } = row.warehouse;
    const { equipment, blocked, expiresAt } = row.lot;
    const key = stockKey(unit.id, equipment.id);
    const balance = balances.get(key) ?? { unit: unit.name, equipment: equipment.name, quantity: 0, largestWarehouse: 0 };
    if (!blocked && (!expiresAt || expiresAt >= today)) {
      balance.quantity += row.quantity;
      const warehouseKey = JSON.stringify([row.warehouseId, equipment.id]);
      const quantity = (warehouseTotals.get(warehouseKey) ?? 0) + row.quantity;
      warehouseTotals.set(warehouseKey, quantity);
      balance.largestWarehouse = Math.max(balance.largestWarehouse, quantity);
    }
    balances.set(key, balance);
  }
  return balances;
}

export async function stockAlerts(scope: AccessScope, unitId = "") {
  const [balances, settings] = await Promise.all([
    stockBalances(scope, unitId ? [unitId] : []),
    db.stockMinimum.findMany({
      where: { companyId: scope.companyId, unit: { ...unitsWhere(scope), active: true, ...(unitId && { AND: [{ id: unitId }] }) }, equipment: { active: true } },
      select: { unitId: true, equipmentId: true, quantity: true,
        unit: { select: { name: true } }, equipment: { select: { name: true } } },
    }),
  ]);
  const thresholds = new Map<string, number>();
  for (const row of settings) {
    const key = stockKey(row.unitId, row.equipmentId);
    thresholds.set(key, row.quantity);
    if (!balances.has(key)) balances.set(key, { unit: row.unit.name, equipment: row.equipment.name, quantity: 0, largestWarehouse: 0 });
  }
  return [...balances.entries()].map(([key, row]) => [key, { ...row, minimum: thresholds.get(key) ?? defaultStockMinimum }] as const)
    .filter(([, row]) => row.quantity <= row.minimum)
    .sort(([, a], [, b]) => a.quantity - b.quantity || a.equipment.localeCompare(b.equipment, "pt-BR") || a.unit.localeCompare(b.unit, "pt-BR"));
}

export async function stockDemand(scope: AccessScope, unitId = "") {
  const requests = await db.equipmentRequest.findMany({
    where: { AND: [requestWhere(scope), { unit: { active: true }, employee: { active: true },
      ...(unitId && { unitId }), status: "WAITING_DELIVERY", equipment: { active: true } }] },
    select: { unitId: true, unit: { select: { name: true } }, equipment: { select: { id: true, name: true } }, quantity: true },
  });
  if (!requests.length) return [];
  const totals = new Map<string, { unit: string; equipment: string; requested: number }>();
  for (const row of requests) {
    if (!row.equipment) continue;
    const key = stockKey(row.unitId, row.equipment.id);
    const total = totals.get(key) ?? { unit: row.unit.name, equipment: row.equipment.name, requested: 0 };
    total.requested += row.quantity;
    totals.set(key, total);
  }
  const stock = await stockBalances(scope, [...new Set(requests.map(({ unitId }) => unitId))],
    [...new Set(requests.flatMap(({ equipment }) => equipment ? [equipment.id] : []))]);
  return [...totals].map(([id, row]) => {
    const available = stock.get(id)?.quantity ?? 0;
    return { id, ...row, available, missing: Math.max(0, row.requested - available) };
  }).sort((a, b) => b.missing - a.missing || a.unit.localeCompare(b.unit, "pt-BR") ||
    a.equipment.localeCompare(b.equipment, "pt-BR"));
}

export function requestAvailability(balance: StockBalance | undefined, requested: number) {
  const quantity = balance?.quantity ?? 0;
  if ((balance?.largestWarehouse ?? 0) >= requested) return { ready: true, label: "Disponível em estoque", tone: "active", detail: `Saldo disponível na unidade: ${quantity} un.` };
  if (quantity >= requested) return { ready: false, label: "Saldo dividido entre almoxarifados", tone: "deadline-warning",
    detail: "Transfira ou reponha o saldo para atender o pedido em um único almoxarifado." };
  return {
    ready: false,
    label: quantity ? "Saldo insuficiente" : "Sem saldo disponível",
    tone: quantity ? "deadline-warning" : "deadline-danger",
    detail: `Saldo disponível: ${quantity} un. Faltam ${requested - quantity} un. Verifique reposição ou compra.`,
  };
}
