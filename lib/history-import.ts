import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { todayInBrazil } from "./equipment";

export type HistoryImportRow = {
  line: number;
  registration: string;
  name: string;
  item: string;
  quantity: number;
  date: string;
  status: "new" | "existing" | "skip" | "error";
  message: string;
};

export type HistoryImportResult = {
  error?: string;
  success?: string;
  preview?: { rows: HistoryImportRow[]; checksum: string; source: string; unitId: string; contractId: string };
};

type Entry = Omit<HistoryImportRow, "status" | "message"> & { jobTitle: string; certificate: string };
type PlanLine = { row: HistoryImportRow } & (
  { entry: Entry; employeeId?: string; equipmentId: string; deliveryId: string } |
  { entry?: never; employeeId?: never; equipmentId?: never; deliveryId?: never }
);

const keyText = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toUpperCase();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function readHistoryImport(source: string): Entry[] | string {
  if (source.length > 60_000) return "O arquivo de importação é muito grande.";
  const lines = source.split(/\r?\n/).map((value, index) => ({ value, line: index + 1 }))
    .filter(({ value }) => value.trim());
  if (lines[0] && /^matr[ií]cula;/i.test(lines[0].value.trim())) lines.shift();
  if (!lines.length || lines.length > 200) return "Informe de 1 a 200 linhas por importação.";
  const entries: Entry[] = [];
  const today = todayInBrazil().toISOString().slice(0, 10);
  for (const { value, line } of lines) {
    const columns = value.split(";").map((column) => column.trim());
    const [registration, name, jobTitle, item, certificate, amount, rawDate] = columns;
    if (columns.length !== 7 || !registration || !name || !item || registration.length > 32 ||
      [name, jobTitle, item].some((column) => column.length > 120) || certificate.length > 60) {
      return `Linha ${line}: confira as sete colunas, a matrícula, o nome do colaborador e o item.`;
    }
    const localDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(rawDate);
    const date = localDate ? `${localDate[3]}-${localDate[2]}-${localDate[1]}` : rawDate;
    const parsed = new Date(date + "T00:00:00Z");
    const quantity = Number(amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date || date > today || date < "1900-01-01") {
      return `Linha ${line}: informe uma data de entrega válida, no formato DD/MM/AAAA ou AAAA-MM-DD.`;
    }
    if (!/^\d+$/.test(amount) || quantity < 1 || quantity > 1_000_000) {
      return `Linha ${line}: informe uma quantidade inteira entre 1 e 1.000.000.`;
    }
    entries.push({ line, registration: registration.toUpperCase(), name, jobTitle, item, certificate, quantity, date });
  }
  return entries;
}

export async function planHistoryImport(tx: Prisma.TransactionClient, companyId: string, unitId: string, contractId: string, entries: Entry[]) {
  const [unit, contract, employees, equipment] = await Promise.all([
    tx.unit.findFirst({ where: { companyId, id: unitId, active: true }, select: { id: true } }),
    contractId ? tx.warehouse.findFirst({
      where: { companyId, unitId, id: contractId, active: true, contractNumber: { not: null } }, select: { contractNumber: true },
    }) : null,
    tx.employee.findMany({ where: { companyId }, select: { id: true, name: true, registration: true, unitId: true, active: true } }),
    tx.equipment.findMany({ where: { companyId, active: true }, select: { id: true, name: true, certificate: true } }),
  ]);
  if (!unit || (contractId && !contract)) return "Selecione uma unidade ativa e, se informado, um contrato dessa unidade.";
  const dates = [...new Set(entries.map(({ date }) => date))].map((date) => new Date(date + "T00:00:00Z"));
  const registrations = new Set(entries.map(({ registration }) => registration));
  const existingDeliveries = await tx.delivery.findMany({
    where: { companyId, employeeId: { in: employees.filter(({ registration }) => registrations.has(registration.toUpperCase())).map(({ id }) => id) },
      deliveredAt: { in: dates }, voidedAt: null },
    select: { employeeId: true, equipmentId: true, deliveredAt: true, quantity: true },
  });
  const deliveryKey = (employee: string, item: string, date: string, quantity: number) => JSON.stringify([employee, item, date, quantity]);
  const existingKeys = new Set(existingDeliveries.map((row) =>
    deliveryKey(row.employeeId, row.equipmentId, row.deliveredAt.toISOString().slice(0, 10), row.quantity)));
  const employeeByRegistration = new Map(employees.map((employee) => [employee.registration.toUpperCase(), employee]));
  const newPeople = new Map<string, Entry>();
  const importedKeys = new Set<string>();
  const plan = entries.map<PlanLine>((entry) => {
    const { registration, name, jobTitle, item, certificate, date, quantity } = entry;
    const row = (status: HistoryImportRow["status"], message: string) => ({ ...entry, status, message });
    const error = (message: string) => ({ row: row("error", message) });
    const person = employeeByRegistration.get(registration);
    if (person && (keyText(person.name) !== keyText(name) || !person.active || person.unitId !== unitId)) {
      return error("A matrícula pertence a outro nome ou unidade, ou está inativa. Confira em Colaboradores.");
    }
    const earlier = newPeople.get(registration);
    if (!person && (!jobTitle || employees.some((candidate) => keyText(candidate.name) === keyText(name)) ||
      [...newPeople.values()].some((candidate) => candidate.registration !== registration && keyText(candidate.name) === keyText(name)) ||
      (earlier && (keyText(earlier.name) !== keyText(name) || keyText(earlier.jobTitle) !== keyText(jobTitle))))) {
      return error("Confira a função, a matrícula e o nome para criar o colaborador.");
    }
    const matches = equipment.filter((candidate) => keyText(candidate.name) === keyText(item) &&
      (!certificate || candidate.certificate === certificate));
    if (matches.length !== 1) return error("Item ou CA sem correspondência única. Confira o nome no Cadastro de itens.");
    const selectedItem = matches[0];
    const match = deliveryKey(registration, selectedItem.id, date, quantity);
    if ((person && existingKeys.has(deliveryKey(person.id, selectedItem.id, date, quantity))) || importedKeys.has(match)) {
      return { row: row("skip", "Entrega idêntica já registrada ou repetida no arquivo.") };
    }
    importedKeys.add(match);
    if (!person) newPeople.set(registration, entry);
    return {
      row: row(person ? "existing" : "new", person ? "Registrar para o colaborador existente." :
        earlier ? "Registrar para o novo colaborador." : "Cadastrar colaborador e registrar entrega."),
      entry, employeeId: person?.id, equipmentId: selectedItem.id,
      deliveryId: `ficha-${hash([companyId, match])}`,
    };
  });
  const recorded = await tx.delivery.findMany({
    where: { companyId, id: { in: plan.flatMap((item) => item.deliveryId ? [item.deliveryId] : []) } },
    select: { id: true },
  });
  const recordedIds = new Set(recorded.map(({ id }) => id));
  const checkedPlan = plan.map<PlanLine>((item) => item.deliveryId && recordedIds.has(item.deliveryId)
    ? { row: { ...item.row, status: "skip" as const, message: "Esta linha já foi importada. Confira o registro no Histórico." } }
    : item);
  return { plan: checkedPlan, contractNumber: contract?.contractNumber ?? null,
    checksum: hash([companyId, unitId, contractId, contract?.contractNumber, checkedPlan]) };
}
