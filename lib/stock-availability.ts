import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { unitsWhere } from "@/lib/directory";
import { todayInBrazil } from "@/lib/equipment";

export const lowStockLimit = 5;
export const stockKey = (unitId: string, equipmentId: string) => JSON.stringify([unitId, equipmentId]);

export function availableLotWhere(today: Date): Prisma.EquipmentLotWhereInput {
  return { blocked: false, equipment: { active: true }, OR: [{ expiresAt: null }, { expiresAt: { gte: today } }] };
}

type StockBalance = {
  unit: string;
  equipment: string;
  quantity: number;
  largestLot: number;
};

export async function stockBalances(scope: AccessScope, unitIds: string[] = [], equipmentIds: string[] = []) {
  const today = todayInBrazil();
  const rows = await db.stock.findMany({
    where: {
      companyId: scope.companyId,
      warehouse: { active: true, unit: { ...unitsWhere(scope), active: true, ...(unitIds.length && { AND: [{ id: { in: unitIds } }] }) } },
      lot: { equipment: { active: true }, ...(equipmentIds.length && { equipmentId: { in: equipmentIds } }) },
    },
    select: {
      quantity: true,
      warehouse: { select: { unit: { select: { id: true, name: true } } } },
      lot: { select: { expiresAt: true, blocked: true, equipment: { select: { id: true, name: true } } } },
    },
  });
  const balances = new Map<string, StockBalance>();
  for (const row of rows) {
    const { unit } = row.warehouse;
    const { equipment, blocked, expiresAt } = row.lot;
    const key = stockKey(unit.id, equipment.id);
    const balance = balances.get(key) ?? { unit: unit.name, equipment: equipment.name, quantity: 0, largestLot: 0 };
    if (!blocked && (!expiresAt || expiresAt >= today)) {
      balance.quantity += row.quantity;
      balance.largestLot = Math.max(balance.largestLot, row.quantity);
    }
    balances.set(key, balance);
  }
  return balances;
}

export async function stockAlerts(scope: AccessScope, unitId = "") {
  const balances = await stockBalances(scope, unitId ? [unitId] : []);
  return [...balances.entries()].filter(([, row]) => row.quantity <= lowStockLimit)
    .sort(([, a], [, b]) => a.quantity - b.quantity || a.equipment.localeCompare(b.equipment, "pt-BR") || a.unit.localeCompare(b.unit, "pt-BR"));
}

export function requestAvailability(balance: StockBalance | undefined, requested: number) {
  const quantity = balance?.quantity ?? 0;
  if ((balance?.largestLot ?? 0) >= requested) return { ready: true, label: "Disponível em estoque", tone: "active", detail: `Saldo disponível na unidade: ${quantity} un.` };
  if (quantity >= requested) return { ready: false, label: "Saldo dividido entre lotes", tone: "deadline-warning",
    detail: "A quantidade está disponível na unidade, distribuída entre lotes. O atendimento precisa de um lote com o saldo completo." };
  return {
    ready: false,
    label: quantity ? "Saldo insuficiente" : "Sem saldo disponível",
    tone: quantity ? "deadline-warning" : "deadline-danger",
    detail: `Saldo disponível: ${quantity} un. Faltam ${requested - quantity} un. Verifique reposição ou compra.`,
  };
}
