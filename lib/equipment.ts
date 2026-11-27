import type { RequestStatus, RetirementReason } from "@/generated/prisma/enums";

export const requestLabels: Record<RequestStatus, string> = {
  WAITING_CATALOG: "Aguardando identificação do item",
  PENDING_APPROVAL: "Pendente de aprovação",
  WAITING_DELIVERY: "Aguardando entrega",
  COMPLETED: "Concluída",
  REJECTED: "Rejeitada",
  CANCELLED: "Cancelada",
};

export const retirementLabels: Record<RetirementReason, string> = {
  EXPIRED: "Fora da validade",
  DAMAGED: "Dano ou desgaste",
  OTHER: "Outro motivo",
};

type DeliveredItem = { equipmentId: string; warehouseId?: string | null; historicalContractId?: string | null; contractNumber?: string | null };

export function latestByItem<T extends DeliveredItem>(deliveries: T[]) {
  const seen = new Set<string>();
  return deliveries.filter((row) => {
    const contract = row.warehouseId ?? row.historicalContractId;
    const key = JSON.stringify([row.equipmentId, contract ?? null, contract ? null : row.contractNumber ?? null]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function itemsInUse<T extends DeliveredItem & { quantity: number; returnedQuantity: number; retirement: object | null }>(deliveries: T[]) {
  const latest = new Set(latestByItem(deliveries));
  return deliveries.filter((row) => !row.retirement && row.returnedQuantity < row.quantity && (latest.has(row) || row.returnedQuantity > 0));
}

const dayFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
export const formatDay = (date: Date) => dayFormat.format(date);
export const inputDay = (date: Date) => date.toISOString().slice(0, 10);
const brazilFormat = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});
export const brazilDay = (date: Date) => new Date(brazilFormat.format(date) + "T00:00:00Z");
export const todayInBrazil = () => brazilDay(new Date());

export function plusDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
export const jobTitleKey = (value: string) => value.trim().normalize("NFC").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
