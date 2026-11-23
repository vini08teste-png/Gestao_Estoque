"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import type { ItemCategory, RetirementReason } from "@/generated/prisma/enums";
import { canAdminister, requireScope, type AccessScope } from "@/lib/auth";
import { attachmentLimit, replacementPhotoTypes } from "@/lib/attachment-limits";
import { db } from "@/lib/db";
import { employeesWhere, unitsWhere } from "@/lib/directory";
import { canSetStockMinimum, handlesStock, hasPersonalEquipment, ownEmployeeId, requestWhere } from "@/lib/equipment-access";
import { brazilDay, jobTitleKey, retirementLabels, todayInBrazil } from "@/lib/equipment";
import { text, type FormResult } from "@/lib/forms";

class InputError extends Error {}
const invalid = (message: string): never => { throw new InputError(message); };
const transactionOptions = { isolationLevel: "Serializable" } as const;

function field(data: FormData, key: string, label: string, max = 120, optional = false) {
  const value = text(data, key);
  if ((!value && !optional) || value.length > max) invalid(`Confira o campo ${label} (até ${max} caracteres).`);
  return value;
}

function count(data: FormData, key = "quantity", max = 1_000_000) {
  const value = Number(text(data, key));
  if (!Number.isInteger(value) || value < 1 || value > max) invalid(`Informe um número inteiro de 1 a ${max}.`);
  return value;
}

function parseDay(value: string) {
  const date = new Date(value + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value) invalid("Informe uma data válida.");
  return date;
}

async function mutate(companyId: string, allowed: (scope: AccessScope) => boolean,
  operation: (tx: Prisma.TransactionClient, scope: AccessScope, actorId: string) => Promise<void>): Promise<FormResult> {
  const { scope, viewer } = await requireScope(companyId);
  if (!allowed(scope)) notFound();
  try {
    await db.$transaction(async (tx) => {
      const current = await tx.userScope.findUnique({
        where: { companyId_userId: { companyId, userId: viewer.id }, active: true },
        include: {
          company: true,
          units: { select: { unitId: true } },
          employee: { select: { id: true, unitId: true, active: true } },
        },
      });
      if (!current || !allowed(current)) return invalid("Seu acesso mudou. Atualize a página.");
      await operation(tx, current, viewer.id);
    }, transactionOptions);
  } catch (error) {
    if (error instanceof InputError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2034") return { error: "Outro operador alterou este registro. Atualize o saldo e tente novamente." };
      if (error.code === "P2002") return { error: "Já existe um registro com esses dados. Atualize a página." };
      if (error.code === "P2025" || error.code === "P2003") return { error: "O registro ou vínculo não está disponível nesta empresa." };
    }
    throw error;
  }
  revalidatePath("/", "layout");
  return { success: "Alterações salvas." };
}

export async function saveEquipment(companyId: string, id: string | null, _: FormResult, data: FormData) {
  return mutate(companyId, id ? canAdminister : handlesStock, async (tx) => {
    const category = text(data, "category");
    if (category !== "EPI" && category !== "UNIFORM") return invalid("Selecione o tipo de item.");
    const values = {
      name: field(data, "name", "Nome"),
      category: category as ItemCategory,
      makerModel: field(data, "makerModel", "Fabricante e modelo"),
      certificate: category === "EPI" ? field(data, "certificate", "CA", 60) : null,
      caExpiresAt: category === "EPI" ? parseDay(text(data, "caExpiresAt")) : null,
      notes: field(data, "notes", "Observações", 500, true),
      active: data.get("active") === "on",
    };
    if (id) await tx.equipment.update({ where: { companyId_id: { companyId, id } }, data: values });
    else await tx.equipment.create({ data: { companyId, ...values } });
  });
}

export async function saveWarehouse(companyId: string, _: FormResult, data: FormData) {
  return mutate(companyId, handlesStock, async (tx, scope) => {
    const unitId = field(data, "unit", "Unidade");
    const unit = await tx.unit.findFirst({ where: { AND: [unitsWhere(scope), { id: unitId, active: true }] } });
    if (!unit) return invalid("Selecione uma unidade ativa no seu escopo.");
    await tx.warehouse.create({ data: { companyId, unitId, name: field(data, "name", "Nome") } });
  });
}

export async function saveLot(companyId: string, _: FormResult, data: FormData) {
  return mutate(companyId, handlesStock, async (tx) => {
    const equipmentId = field(data, "equipment", "Item");
    if (!await tx.equipment.findUnique({ where: { companyId_id: { companyId, id: equipmentId }, active: true } })) {
      return invalid("Selecione um item ativo desta empresa.");
    }
    const code = field(data, "code", "Código do lote", 60).toUpperCase();
    const date = text(data, "expiresAt");
    const expiresAt = date ? parseDay(date) : null;
    await tx.equipmentLot.create({ data: { companyId, equipmentId, code, expiresAt } });
  });
}

export async function setLotBlocked(companyId: string, lotId: string, block: boolean, _: FormResult) {
  return mutate(companyId, canAdminister, async (tx) => {
    await tx.equipmentLot.update({ where: { companyId_id: { companyId, id: lotId } }, data: { blocked: block } });
  });
}

export async function addStock(companyId: string, _: FormResult, data: FormData) {
  return mutate(companyId, handlesStock, async (tx, scope, actorId) => {
    const warehouseId = field(data, "warehouse", "Almoxarifado");
    const lotId = field(data, "lot", "Lote");
    const quantity = count(data);
    const warehouse = await tx.warehouse.findFirst({
      where: { companyId, id: warehouseId, active: true, unit: { ...unitsWhere(scope), active: true } },
    });
    if (!warehouse) return invalid("Selecione um almoxarifado ativo da sua unidade.");
    if (!await tx.equipmentLot.findFirst({ where: { companyId, id: lotId, equipment: { active: true } } })) {
      return invalid("Selecione um lote de um item ativo desta empresa.");
    }
    const key = { companyId, warehouseId, lotId };
    const balance = await tx.stock.findUnique({ where: { companyId_warehouseId_lotId: key }, select: { quantity: true } });
    if ((balance?.quantity ?? 0) > 2_147_483_647 - quantity) return invalid("A entrada ultrapassa o limite de quantidade do lote.");
    await tx.stock.upsert({
      where: { companyId_warehouseId_lotId: key }, create: { ...key, quantity }, update: { quantity: { increment: quantity } },
    });
    await tx.stockMovement.create({ data: { ...key, actorId, delta: quantity } });
  });
}

export async function saveStockMinimum(companyId: string, _: FormResult, data: FormData) {
  return mutate(companyId, canSetStockMinimum, async (tx, scope) => {
    const unitId = field(data, "unit", "Unidade");
    const equipmentId = field(data, "equipment", "Item");
    const raw = text(data, "quantity");
    const quantity = Number(raw);
    if (!/^\d+$/.test(raw) || quantity > 1_000_000) return invalid("Informe um estoque mínimo entre 0 e 1.000.000.");
    const [unit, item] = await Promise.all([
      tx.unit.findFirst({ where: { AND: [unitsWhere(scope), { id: unitId, active: true }] }, select: { id: true } }),
      tx.equipment.findUnique({ where: { companyId_id: { companyId, id: equipmentId }, active: true }, select: { id: true } }),
    ]);
    if (!unit || !item) return invalid("Selecione uma unidade no seu escopo e um item ativo desta empresa.");
    const key = { companyId, unitId, equipmentId };
    await tx.stockMinimum.upsert({ where: { companyId_unitId_equipmentId: key }, create: { ...key, quantity }, update: { quantity } });
  });
}

export async function resetStockMinimum(companyId: string, unitId: string, equipmentId: string, _: FormResult) {
  return mutate(companyId, canSetStockMinimum, async (tx, scope) => {
    await tx.stockMinimum.deleteMany({ where: { companyId, unitId, equipmentId, unit: unitsWhere(scope) } });
  });
}

export async function saveExpectedItem(companyId: string, _: FormResult, data: FormData) {
  return mutate(companyId, canAdminister, async (tx) => {
    const unitId = field(data, "unit", "Unidade", 120, true) || null;
    const jobTitle = jobTitleKey(field(data, "jobTitle", "Função", 120, true));
    const equipmentId = field(data, "equipment", "Item");
    const quantity = count(data);
    if (!unitId && !jobTitle) return invalid("Informe uma unidade ou função.");
    if (unitId && !await tx.unit.findUnique({ where: { companyId_id: { companyId, id: unitId }, active: true } })) {
      return invalid("Selecione uma unidade ativa desta empresa.");
    }
    if (!await tx.equipment.findUnique({ where: { companyId_id: { companyId, id: equipmentId }, active: true } })) {
      return invalid("Selecione um item ativo desta empresa.");
    }
    const target = { companyId, unitId, jobTitle, equipmentId };
    const existing = await tx.expectedItem.findFirst({ where: target, select: { id: true } });
    if (existing) await tx.expectedItem.update({ where: { companyId_id: { companyId, id: existing.id } }, data: { quantity } });
    else await tx.expectedItem.create({ data: { ...target, quantity } });
  });
}

export async function removeExpectedItem(companyId: string, id: string, _: FormResult, _data: FormData) {
  return mutate(companyId, canAdminister, async (tx) => {
    await tx.expectedItem.deleteMany({ where: { companyId, id } });
  });
}

export async function saveRule(companyId: string, _: FormResult, data: FormData) {
  return mutate(companyId, canAdminister, async (tx) => {
    const unitId = field(data, "unit", "Unidade");
    const equipmentId = field(data, "equipment", "EPI", 120, true) || null;
    const previous = await tx.approvalRule.findFirst({ where: { companyId, unitId, equipmentId } });
    const required = data.get("required") === "yes";
    if (previous) await tx.approvalRule.update({ where: { id: previous.id }, data: { required } });
    else await tx.approvalRule.create({ data: { companyId, unitId, equipmentId, required } });
  });
}

const supervisor = (scope: AccessScope) => scope.company.requestApprovalEnabled && scope.role === "SUPERVISOR" &&
  scope.employee?.active === true;

async function routingStatus(tx: Prisma.TransactionClient, scope: AccessScope, unitId: string, equipmentId: string) {
  if (!scope.company.requestApprovalEnabled) return "WAITING_DELIVERY";
  const { companyId } = scope;
  const rules = await tx.approvalRule.findMany({
    where: { companyId, unitId, OR: [{ equipmentId }, { equipmentId: null }] },
  });
  const required = (rules.find((rule) => rule.equipmentId !== null) ?? rules.find((rule) => rule.equipmentId === null))?.required ?? true;
  return required ? "PENDING_APPROVAL" : "WAITING_DELIVERY";
}

async function latestOwnedDelivery(tx: Prisma.TransactionClient, scope: AccessScope, deliveryId: string) {
  const companyId = scope.companyId;
  const employeeId = ownEmployeeId(scope);
  const delivery = await tx.delivery.findUnique({
    where: { companyId_id: { companyId, id: deliveryId }, employeeId },
    select: {
      equipmentId: true, equipment: { select: { name: true, active: true } },
      receipt: { select: { deliveryId: true } }, retirement: { select: { deliveryId: true } },
    },
  });
  if (!delivery) return invalid("A entrega não está disponível na sua área pessoal.");
  const latest = await tx.delivery.findFirst({
    where: { companyId, employeeId, equipmentId: delivery.equipmentId, ...(delivery.receipt && { receipt: { isNot: null } }) },
    orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (latest?.id !== deliveryId) return invalid("Use a entrega mais recente desse item.");
  return delivery;
}

export async function retireDelivery(companyId: string, deliveryId: string, _: FormResult, data: FormData) {
  const result = await mutate(companyId, hasPersonalEquipment, async (tx, scope, actorId) => {
    if ((await latestOwnedDelivery(tx, scope, deliveryId)).retirement) return;
    const reason = text(data, "retirementReason") as RetirementReason;
    if (!Object.hasOwn(retirementLabels, reason)) return invalid("Selecione o motivo da retirada.");
    const note = field(data, "note", "Justificativa", 500);
    const retiredAt = new Date();
    await tx.deliveryRetirement.create({ data: { companyId, deliveryId, actorId, reason, note, retiredAt } });
    await tx.equipmentEvent.create({
      data: { companyId, subjectId: deliveryId, actorId, kind: "ITEM_RETIRED", note, occurredAt: retiredAt },
    });
  });
  if (result.success) redirect(`/${companyId}/meus-epis?retirado=1`);
  return result;
}

async function submitRequest(companyId: string, id: string, data: FormData, replacementForId?: string) {
  const result = await mutate(companyId, hasPersonalEquipment, async (tx, scope, actorId) => {
    const employee = scope.employee!;
    if (await tx.equipmentRequest.findUnique({ where: { companyId_id: { companyId, id }, employeeId: employee.id } })) return;
    const source = replacementForId ? await latestOwnedDelivery(tx, scope, replacementForId) : null;
    if (replacementForId && await tx.equipmentRequest.findFirst({
      where: { companyId, replacementForId, status: { in: ["WAITING_CATALOG", "PENDING_APPROVAL", "WAITING_DELIVERY"] } },
      select: { id: true },
    })) return invalid("Já existe uma solicitação de troca em aberto para essa entrega.");
    const selected = source ? (source.equipment.active ? source.equipmentId : "__other") : field(data, "equipment", "Item");
    const equipmentId = selected === "__other" ? null : selected;
    const requestedItem = equipmentId ? null : source?.equipment.name ?? field(data, "requestedItem", "Descrição do item", 160);
    if (equipmentId && !await tx.equipment.findUnique({ where: { companyId_id: { companyId, id: equipmentId }, active: true } })) {
      return invalid("Selecione um item ativo desta empresa.");
    }
    const status = equipmentId ? await routingStatus(tx, scope, employee.unitId, equipmentId) : "WAITING_CATALOG";
    const photo = source ? await readAttachment(data, "replacementPhoto") : undefined;
    const reason = field(data, "reason", source ? "Justificativa da troca" : "Motivo", 500, Boolean(source));
    if (source && !reason && !photo) return invalid("Escreva a justificativa ou anexe uma foto.");
    await tx.equipmentRequest.create({
      data: { companyId, id, employeeId: employee.id, unitId: employee.unitId, equipmentId, requestedItem, status, replacementForId,
        quantity: count(data), reason, ...(photo && { photo: { create: photo.data } }) },
    });
    await tx.equipmentEvent.create({ data: { companyId, subjectId: id, actorId, kind: status } });
  });
  if (result.success) redirect(`/${companyId}/minhas-solicitacoes?enviada=1`);
  return result;
}

export async function openRequest(companyId: string, id: string, _: FormResult, data: FormData) {
  return submitRequest(companyId, id, data);
}

export async function requestReplacement(companyId: string, deliveryId: string, id: string, _: FormResult, data: FormData) {
  return submitRequest(companyId, id, data, deliveryId);
}

export async function identifyItem(companyId: string, id: string, _: FormResult, data: FormData) {
  return mutate(companyId, handlesStock, async (tx, scope, actorId) => {
    const row = await tx.equipmentRequest.findFirst({ where: { ...requestWhere(scope), id, status: "WAITING_CATALOG" } });
    if (!row) return invalid("A solicitação já foi tratada ou está fora do seu escopo.");
    const equipmentId = field(data, "equipment", "Item de catálogo");
    if (!await tx.equipment.findUnique({ where: { companyId_id: { companyId, id: equipmentId }, active: true } })) {
      return invalid("Selecione um item ativo desta empresa.");
    }
    const status = await routingStatus(tx, scope, row.unitId, equipmentId);
    await tx.equipmentRequest.update({ where: { companyId_id: { companyId, id } }, data: { equipmentId, status } });
    await tx.equipmentEvent.create({ data: { companyId, subjectId: id, actorId, kind: "ITEM_IDENTIFIED", note: equipmentId } });
  });
}

export async function decideRequest(companyId: string, id: string, decision: "approve" | "reject" | "cancel", _: FormResult, data: FormData) {
  return mutate(companyId, decision === "cancel" ? (scope) => hasPersonalEquipment(scope) || canAdminister(scope) : supervisor,
    async (tx, scope, actorId) => {
      const allowed = decision === "cancel" ? ["WAITING_CATALOG", "PENDING_APPROVAL", "WAITING_DELIVERY"] : ["PENDING_APPROVAL"];
      const filter = decision === "cancel" && !canAdminister(scope) ? { companyId, employeeId: ownEmployeeId(scope) } : requestWhere(scope);
      const row = await tx.equipmentRequest.findFirst({ where: { ...filter, id } });
      if (!row || !allowed.includes(row.status)) return invalid("A solicitação não está disponível para essa ação.");
      const status = decision === "approve" ? "WAITING_DELIVERY" : decision === "reject" ? "REJECTED" : "CANCELLED";
      const note = decision === "reject" ? field(data, "note", "Justificativa", 500) : null;
      await tx.equipmentRequest.update({ where: { companyId_id: { companyId, id } }, data: { status, decisionNote: note } });
      await tx.equipmentEvent.create({ data: { companyId, subjectId: id, actorId, kind: status, note } });
    });
}

async function readAttachment(data: FormData, fieldName: "proof" | "replacementPhoto") {
  const proof = fieldName === "proof";
  const error = proof ? "Selecione um comprovante PDF, PNG ou JPEG de até 3 MB." :
    "Selecione uma foto JPG, PNG ou WebP válida de até 3 MB.";
  const file = data.get(fieldName);
  if (file === null || file === "" || (file instanceof File && file.size === 0)) return undefined;
  if (!(file instanceof File) || file.size > attachmentLimit) {
    return invalid(error);
  }
  const content = Buffer.from(await file.arrayBuffer());
  const magic = content.subarray(0, 12).toString("hex");
  const mime = magic.startsWith("255044462d") ? "application/pdf" :
    magic.startsWith("89504e470d0a1a0a") ? "image/png" : magic.startsWith("ffd8ff") ? "image/jpeg" :
    magic.length === 24 && magic.startsWith("52494646") && magic.endsWith("57454250") ? "image/webp" : "";
  const allowed = proof ? mime === "application/pdf" || mime === "image/jpeg" || mime === "image/png" :
    Object.hasOwn(replacementPhotoTypes, mime);
  if (!allowed || mime !== file.type) return invalid(error);
  return { data: { mime, content, sha256: createHash("sha256").update(content).digest("hex") }, name: file.name.slice(0, 180) };
}

export async function registerDelivery(companyId: string, id: string, requestId: string | null, _: FormResult, data: FormData) {
  const result = await mutate(companyId, handlesStock, async (tx, scope, actorId) => {
    if (await tx.delivery.findUnique({ where: { companyId_id: { companyId, id }, actorId } })) return;
    const request = requestId ? await tx.equipmentRequest.findFirst({ where: { ...requestWhere(scope), id: requestId } }) : null;
    if (requestId && (!request || request.status !== "WAITING_DELIVERY")) return invalid("Esta solicitação não aguarda entrega.");
    const employeeId = request?.employeeId ?? field(data, "employee", "Colaborador");
    const employee = await tx.employee.findFirst({ where: { ...employeesWhere(scope), id: employeeId, active: true } });
    if (!employee || (request && request.unitId !== employee.unitId)) return invalid("O colaborador não está ativo na unidade da solicitação ou no seu escopo.");
    const [warehouseId, lotId] = field(data, "stock", "Almoxarifado e lote", 250).split("|");
    if (!warehouseId || !lotId) return invalid("Selecione um almoxarifado e lote.");
    const stock = await tx.stock.findUnique({
      where: { companyId_warehouseId_lotId: { companyId, warehouseId, lotId } },
      include: { lot: { include: { equipment: true } }, warehouse: { include: { unit: { select: { active: true } } } } },
    });
    if (!stock || !stock.warehouse.active || !stock.warehouse.unit.active || stock.warehouse.unitId !== employee.unitId) {
      return invalid("Selecione um lote com saldo no almoxarifado da unidade do colaborador.");
    }
    const { lot } = stock;
    const today = todayInBrazil();
    if (!lot.equipment.active || lot.blocked || (lot.expiresAt && lot.expiresAt < today)) return invalid("O lote está vencido, bloqueado ou vinculado a um item inativo.");
    if (request && request.equipmentId !== lot.equipmentId) return invalid("O lote deve pertencer ao item solicitado.");
    const quantity = request?.quantity ?? count(data);
    const deliveredAt = parseDay(text(data, "deliveredAt"));
    if (deliveredAt > today) return invalid("A data da entrega não pode ser futura.");
    if (request && deliveredAt < brazilDay(request.openedAt)) return invalid("A data não pode ser anterior à abertura da solicitação.");
    const proof = await readAttachment(data, "proof");
    const key = { companyId, warehouseId, lotId };
    const balance = await tx.stock.updateMany({
      where: { ...key, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } },
    });
    if (balance.count !== 1) return invalid("Saldo insuficiente para atender a quantidade completa.");
    await tx.delivery.create({
      data: { ...key, id, employeeId, actorId, equipmentId: lot.equipmentId, quantity, deliveredAt,
        requestId: request?.id, ...(proof && { proof: { create: { ...proof.data, name: proof.name } } }) },
    });
    await tx.stockMovement.create({ data: { ...key, actorId, delta: -quantity, deliveryId: id } });
    await tx.equipmentEvent.create({ data: { companyId, subjectId: id, actorId, kind: "DELIVERED" } });
    if (request) {
      await tx.equipmentRequest.update({ where: { companyId_id: { companyId, id: request.id } }, data: { status: "COMPLETED" } });
      await tx.equipmentEvent.create({ data: { companyId, subjectId: request.id, actorId, kind: "COMPLETED" } });
    }
  });
  if (result.success) redirect(`/${companyId}/entregas?registrada=1`);
  return result;
}

export async function confirmReceipt(companyId: string, deliveryId: string, _: FormResult) {
  return mutate(companyId, hasPersonalEquipment, async (tx, scope, actorId) => {
    const delivery = await tx.delivery.findUnique({
      where: { companyId_id: { companyId, id: deliveryId }, employeeId: ownEmployeeId(scope) },
      select: { receipt: { select: { deliveryId: true } } },
    });
    if (!delivery) return invalid("Esta entrega não está no seu histórico pessoal.");
    if (delivery.receipt) return;
    const confirmedAt = new Date();
    await tx.deliveryReceipt.create({ data: { companyId, deliveryId, actorId, confirmedAt } });
    await tx.equipmentEvent.create({ data: { companyId, subjectId: deliveryId, actorId, kind: "RECEIPT_CONFIRMED", occurredAt: confirmedAt } });
  });
}
