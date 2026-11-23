import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { unitsWhere } from "@/lib/directory";
import { deliveriesAwaitingReceipt, operationalDeliveryWhere, ownEmployeeId, requestWhere } from "@/lib/equipment-access";
import { brazilDay, formatDay, plusDays, requestLabels, todayInBrazil } from "@/lib/equipment";

export const alertLabels = {
  ca: "Validade do CA",
  lote: "Validade do produto",
};

export const reportLabels = {
  entregas: "Entregas",
  pendencias: "Pendências",
  vencimentos: "Vencimentos",
};

export type AlertKind = keyof typeof alertLabels;
export type ReportKind = keyof typeof reportLabels;
export type Query = Record<string, string | string[] | undefined>;
type Cell = string | number;
type Table = { columns: string[]; rows: Cell[][] };

export type Deadline = {
  id: string;
  kind: AlertKind;
  equipment: string;
  reference: string;
  unit: string;
  due: Date;
};

export function openRequestStatuses() {
  return ["WAITING_CATALOG", "PENDING_APPROVAL", "WAITING_DELIVERY"] as const;
}

export const canViewReports = (scope: AccessScope) => scope.role !== "EMPLOYEE";

export const reportingUnits = (scope: AccessScope) => db.unit.findMany({
  where: unitsWhere(scope),
  orderBy: { name: "asc" },
  select: { id: true, name: true },
});

export function alertKind(query: Query): AlertKind | undefined {
  return typeof query.tipo === "string" && Object.hasOwn(alertLabels, query.tipo) ? query.tipo as AlertKind : undefined;
}

export function reportKind(query: Query): ReportKind {
  return typeof query.tipo === "string" && Object.hasOwn(reportLabels, query.tipo) ? query.tipo as ReportKind : "entregas";
}

function parseDate(raw: Query[string]) {
  if (typeof raw !== "string" || raw.startsWith("0000") || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const date = new Date(raw + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw ? date : undefined;
}

export function reportFilters(query: Query, units: { id: string }[]) {
  const unit = typeof query.unidade === "string" ? query.unidade : "";
  const begin = parseDate(query.inicio);
  const end = parseDate(query.fim);
  let error: string | undefined;
  if (unit && !units.some(({ id }) => id === unit)) error = "A unidade não está disponível no seu escopo.";
  else if ((query.inicio && !begin) || (query.fim && !end)) error = "Informe datas válidas.";
  else if (begin && end && begin > end) error = "A data inicial deve ser anterior ou igual à data final.";
  return { unit, begin, end, error };
}

type Filters = ReturnType<typeof reportFilters>;
const daysTo = (date: Date, today: Date) => Math.round((date.getTime() - today.getTime()) / 86_400_000);

export function deadlineStatus(row: Deadline, today: Date, thresholds: number[]) {
  const days = daysTo(row.due, today);
  if (days < 0) return { label: "Vencido", tone: "danger" };
  if (days === 0) return { label: "Hoje", tone: "danger" };
  const bucket = thresholds.find((threshold) => days <= threshold);
  return {
    label: days === 1 ? "Em 1 dia" : `Em ${days} dias`,
    tone: bucket === thresholds[0] ? "warning" : bucket === thresholds[1] ? "info" : "",
  };
}

export function unitDeliveryWhere(scope: AccessScope, unit = "", personal = false): Prisma.DeliveryWhereInput {
  if (personal || scope.role === "EMPLOYEE") return { companyId: scope.companyId, employeeId: ownEmployeeId(scope) };
  const access = operationalDeliveryWhere(scope);
  return unit ? { AND: [access, { OR: [{ stock: { warehouse: { unitId: unit } } }, { warehouseId: null, employee: { unitId: unit } }] }] } : access;
}

export function unitRequestWhere(scope: AccessScope, unit = "", personal = false): Prisma.EquipmentRequestWhereInput {
  if (personal || scope.role === "EMPLOYEE") return { companyId: scope.companyId, employeeId: ownEmployeeId(scope) };
  return { ...requestWhere(scope), ...(unit && { unitId: unit }) };
}

export async function listDeadlines(scope: AccessScope, {
  unit = "", kind, cutoff = plusDays(todayInBrazil(), scope.company.alertDays.at(-1) ?? 30),
}: { unit?: string; kind?: AlertKind; cutoff?: Date } = {}): Promise<Deadline[]> {
  const companyId = scope.companyId;
  if (!canViewReports(scope)) return [];
  const need = (type: AlertKind) => !kind || kind === type;
  const location = { ...unitsWhere(scope), ...(unit && { AND: [{ id: unit }] }) };
  const [certificates, lots] = await Promise.all([
    need("ca") ? db.equipment.findMany({
      where: {
        companyId, category: "EPI", active: true, caExpiresAt: { lte: cutoff },
        ...((unit || !scope.allUnits) && { lots: { some: { stocks: { some: { warehouse: { unit: location } } } } } }),
      },
      select: { id: true, name: true, certificate: true, caExpiresAt: true },
    }) : [],
    need("lote") ? db.stock.findMany({
      where: { companyId, quantity: { gt: 0 }, warehouse: { unit: location }, lot: { expiresAt: { lte: cutoff }, equipment: { active: true } } },
      select: {
        warehouseId: true, lotId: true,
        warehouse: { select: { name: true, unit: { select: { name: true } } } },
        lot: { select: { expiresAt: true, equipment: { select: { name: true } } } },
      },
    }) : [],
  ]);
  const result: Deadline[] = [
    ...certificates.flatMap((row) => row.caExpiresAt && row.certificate ? [{
      id: row.id, kind: "ca" as const, equipment: row.name, reference: row.certificate, unit: "", due: row.caExpiresAt,
    }] : []),
    ...lots.flatMap((row) => row.lot.expiresAt ? [{
      id: row.warehouseId + "/" + row.lotId, kind: "lote" as const, equipment: row.lot.equipment.name,
      reference: row.warehouse.name, unit: row.warehouse.unit.name, due: row.lot.expiresAt,
    }] : []),
  ];
  return result.sort((a, b) => a.due.getTime() - b.due.getTime() || a.equipment.localeCompare(b.equipment, "pt-BR"));
}

export async function reportRows(scope: AccessScope, kind: ReportKind, filters: Filters): Promise<Table> {
  const { unit, begin, end } = filters;
  const company = scope.company.name;
  const inPeriod = (date: Date) => (!begin || date >= begin) && (!end || date <= end);

  if (kind === "vencimentos") {
    const rows = await listDeadlines(scope, { unit, cutoff: end });
    const today = todayInBrazil();
    return {
      columns: ["Empresa", "Tipo de alerta", "Item", "Referência", "Unidade", "Prazo", "Situação"],
      rows: rows.filter((row) => inPeriod(row.due)).map((row) => [
        company, alertLabels[row.kind], row.equipment, row.reference, row.unit, formatDay(row.due),
        deadlineStatus(row, today, scope.company.alertDays).label,
      ]),
    };
  }

  const access = unitDeliveryWhere(scope, unit);
  const deliveries = await db.delivery.findMany({
    where: {
      AND: [access, { deliveredAt: { gte: begin, lte: end } }, ...(kind === "pendencias" ? [deliveriesAwaitingReceipt] : [])],
    },
    select: {
      deliveredAt: true, quantity: true,
      employee: { select: { name: true, registration: true, unit: { select: { name: true } } } },
      equipment: { select: { name: true } },
      stock: { select: { warehouse: { select: { name: true, unit: { select: { name: true } } } } } },
      receipt: { select: { confirmedAt: true } },
    },
    orderBy: [{ deliveredAt: "desc" }, { id: "desc" }],
  });
  if (kind === "entregas") return {
    columns: ["Empresa", "Unidade", "Almoxarifado", "Matrícula", "Colaborador", "Item", "Quantidade", "Data", "Recebimento"],
    rows: deliveries.map((row) => [
      company, row.stock?.warehouse.unit.name ?? row.employee.unit.name, row.stock?.warehouse.name ?? "—", row.employee.registration, row.employee.name,
      row.equipment.name, row.quantity, formatDay(row.deliveredAt),
      !row.stock ? "Ficha de papel" : row.receipt ? "Confirmado" : "Aguardando confirmação",
    ]),
  };

  const requests = await db.equipmentRequest.findMany({
    where: { ...unitRequestWhere(scope, unit), status: { in: [...openRequestStatuses()] } },
    select: { openedAt: true, requestedItem: true, status: true, quantity: true,
      unit: { select: { name: true } }, employee: { select: { name: true, registration: true } }, equipment: { select: { name: true } } },
    orderBy: [{ openedAt: "desc" }, { id: "desc" }],
  });
  const pending = [
    ...requests.map((row) => ({
      date: brazilDay(row.openedAt), type: "Solicitação", unit: row.unit.name, employee: row.employee,
      equipment: row.equipment?.name ?? row.requestedItem ?? "", quantity: row.quantity, status: requestLabels[row.status],
    })),
    ...deliveries.map((row) => ({
      date: row.deliveredAt, type: "Recebimento", unit: row.stock?.warehouse.unit.name ?? row.employee.unit.name, employee: row.employee,
      equipment: row.equipment.name, quantity: row.quantity, status: "Aguardando confirmação",
    })),
  ];
  return {
    columns: ["Empresa", "Unidade", "Tipo", "Matrícula", "Colaborador", "Item", "Quantidade", "Data", "Situação"],
    rows: pending.filter((row) => inPeriod(row.date)).sort((a, b) => b.date.getTime() - a.date.getTime()).map((row) => [
      company, row.unit, row.type, row.employee.registration, row.employee.name, row.equipment, row.quantity, formatDay(row.date), row.status,
    ]),
  };
}

function csvCell(value: Cell) {
  const text = String(value);
  const protectedText = typeof value === "string" && (/^[\t\r\n]/.test(text) || /^[=+@-]/.test(text.trimStart())) ? "'" + text : text;
  return '"' + protectedText.replace(/"/g, '""') + '"';
}

export function encodeCsv(table: Table) {
  return "\uFEFF" + [table.columns, ...table.rows].map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
