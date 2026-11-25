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
import { canSetStockMinimum, deliveryCorrectionFields, handlesStock, hasPersonalEquipment, ownEmployeeId, requestWhere } from "@/lib/equipment-access";
import { brazilDay, jobTitleKey, retirementLabels, todayInBrazil } from "@/lib/equipment";
import { text, type FormResult } from "@/lib/forms";
import { finishSave } from "@/lib/form-navigation";
import { contractNumberLabel } from "@/lib/organization";
import { availableLotWhere } from "@/lib/stock-availability";

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

function equipmentValues(data: FormData) {
  const category = text(data, "category");
  if (category !== "EPI" && category !== "UNIFORM") return invalid("Selecione o tipo de item.");
  return {
    name: field(data, "name", "Nome"),
    category: category as ItemCategory,
    makerModel: field(data, "makerModel", "Fabricante e modelo"),
    certificate: category === "EPI" ? field(data, "certificate", "CA", 60) : null,
    caExpiresAt: category === "EPI" ? parseDay(text(data, "caExpiresAt")) : null,
    notes: field(data, "notes", "Observações", 500, true),
  };
}

async function resolveEquipment(tx: Prisma.TransactionClient, companyId: string, data: FormData, existingId: string | null) {
  if (existingId === "") return invalid("Selecione um item ativo desta empresa.");
  if (existingId === null && data.get("createEquipment") === "on") {
    const values = equipmentValues(data);
    if (await tx.equipment.findFirst({
      where: { companyId, active: true, category: values.category, certificate: values.certificate,
        name: { equals: values.name, mode: "insensitive" }, makerModel: { equals: values.makerModel, mode: "insensitive" } },
      select: { id: true },
    })) return invalid("Este item já está cadastrado. Use a opção Escolher item existente.");
    const item = await tx.equipment.create({ data: { companyId, ...values }, select: { id: true } });
    return item.id;
  }
  const id = existingId ?? field(data, "equipment", "Item");
  if (!await tx.equipment.findUnique({ where: { companyId_id: { companyId, id }, active: true }, select: { id: true } })) {
    return invalid("Selecione um item ativo desta empresa.");
  }
  return id;
}

export async function saveEquipment(companyId: string, id: string | null, _: FormResult, data: FormData) {
  const result = await mutate(companyId, id ? canAdminister : handlesStock, async (tx) => {
    const values = { ...equipmentValues(data), active: data.get("active") === "on" };
    if (id) await tx.equipment.update({ where: { companyId_id: { companyId, id } }, data: values });
    else await tx.equipment.create({ data: { companyId, ...values } });
  });
  return finishSave(result, data, `/${companyId}/epis`);
}

export async function saveWarehouse(companyId: string, warehouseId: string, _: FormResult, data: FormData) {
  const result = await mutate(companyId, handlesStock, async (tx, scope) => {
    const contractNumber = field(data, "contractNumber", contractNumberLabel);
    if (warehouseId) {
      const updated = await tx.warehouse.updateMany({
        where: { companyId, id: warehouseId, active: true, unit: { ...unitsWhere(scope), active: true },
          ...(!canAdminister(scope) && { contractNumber: null }) },
        data: { contractNumber },
      });
      if (!updated.count) return invalid("Registro de estoque indisponível no seu escopo.");
      return;
    }
    const unitId = field(data, "unit", "Unidade");
    const unit = await tx.unit.findFirst({ where: { AND: [unitsWhere(scope), { id: unitId, active: true }] } });
    if (!unit) return invalid("Selecione uma unidade ativa no seu escopo.");
    await tx.warehouse.create({ data: { companyId, unitId, name: contractNumber, contractNumber } });
  });
  return finishSave(result, data, `/${companyId}/estoque`);
}

export async function addStock(companyId: string, movementId: string, _: FormResult, data: FormData) {
  const result = await mutate(companyId, handlesStock, async (tx, scope, actorId) => {
    if (await tx.stockMovement.findUnique({ where: { id: movementId, companyId, actorId }, select: { id: true } })) return;
    const warehouseId = field(data, "warehouse", contractNumberLabel);
    const quantity = count(data);
    const warehouse = await tx.warehouse.findFirst({
      where: { companyId, id: warehouseId, active: true, unit: { ...unitsWhere(scope), active: true } },
    });
    if (!warehouse) return invalid("Selecione um registro de estoque ativo da sua unidade.");
    const date = text(data, "expiresAt");
    const expiresAt = date ? parseDay(date) : null;
    const equipmentId = await resolveEquipment(tx, companyId, data, null);
    const code = `@ESTOQUE:${date || "SEM-VALIDADE"}`;
    const lot = await tx.equipmentLot.upsert({
      where: { companyId_equipmentId_code: { companyId, equipmentId, code } },
      create: { companyId, equipmentId, code, expiresAt }, update: {}, select: { id: true, blocked: true },
    });
    if (lot.blocked) return invalid("Este item está bloqueado para esta validade.");
    const key = { companyId, warehouseId, lotId: lot.id };
    const balance = await tx.stock.findUnique({ where: { companyId_warehouseId_lotId: key }, select: { quantity: true } });
    if ((balance?.quantity ?? 0) > 2_147_483_647 - quantity) return invalid("A entrada ultrapassa o limite de quantidade.");
    await tx.stock.upsert({
      where: { companyId_warehouseId_lotId: key }, create: { ...key, quantity }, update: { quantity: { increment: quantity } },
    });
    await tx.stockMovement.create({ data: { ...key, id: movementId, actorId, delta: quantity } });
  });
  if (!result.success) return result;
  return finishSave({ success: "Entrada registrada." }, data, `/${companyId}/estoque?entrada=1`);
}

export async function saveStockMinimum(companyId: string, _: FormResult, data: FormData) {
  const result = await mutate(companyId, canSetStockMinimum, async (tx, scope) => {
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
  return finishSave(result, data, `/${companyId}/estoque?acao=minimos#minimos-cadastrados`);
}

export async function resetStockMinimum(companyId: string, unitId: string, equipmentId: string, _: FormResult) {
  return mutate(companyId, canSetStockMinimum, async (tx, scope) => {
    await tx.stockMinimum.deleteMany({ where: { companyId, unitId, equipmentId, unit: unitsWhere(scope) } });
  });
}

export async function saveExpectedItem(companyId: string, _: FormResult, data: FormData) {
  const result = await mutate(companyId, canAdminister, async (tx) => {
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
  return finishSave(result, data, `/${companyId}/itens-esperados#itens-configurados`);
}

export async function removeExpectedItem(companyId: string, id: string, _: FormResult, _data: FormData) {
  return mutate(companyId, canAdminister, async (tx) => {
    await tx.expectedItem.deleteMany({ where: { companyId, id } });
  });
}

export async function saveRule(companyId: string, _: FormResult, data: FormData) {
  const result = await mutate(companyId, canAdminister, async (tx) => {
    const unitId = field(data, "unit", "Unidade");
    const equipmentId = field(data, "equipment", "EPI", 120, true) || null;
    const previous = await tx.approvalRule.findFirst({ where: { companyId, unitId, equipmentId } });
    const required = data.get("required") === "yes";
    if (previous) await tx.approvalRule.update({ where: { id: previous.id }, data: { required } });
    else await tx.approvalRule.create({ data: { companyId, unitId, equipmentId, required } });
  });
  return finishSave(result, data, `/${companyId}/regras-aprovacao#regras-cadastradas`);
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
    where: { companyId_id: { companyId, id: deliveryId }, employeeId, voidedAt: null },
    select: {
      equipmentId: true, warehouseId: true, equipment: { select: { name: true, active: true } },
      quantity: true, returnedQuantity: true,
      receipt: { select: { deliveryId: true } }, retirement: { select: { deliveryId: true } },
    },
  });
  if (!delivery) return invalid("A entrega não está disponível na sua área pessoal.");
  const latest = await tx.delivery.findFirst({
    where: { companyId, employeeId, equipmentId: delivery.equipmentId, voidedAt: null,
      ...((delivery.receipt || !delivery.warehouseId) && { OR: [{ receipt: { isNot: null } }, { warehouseId: null }] }) },
    orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (delivery.returnedQuantity === delivery.quantity) return invalid("O item desta entrega já foi devolvido para descarte.");
  if (latest?.id !== deliveryId && !delivery.returnedQuantity) return invalid("Use a entrega mais recente desse item.");
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
    const quantity = count(data);
    if (source && quantity > source.quantity - source.returnedQuantity) {
      return invalid("A quantidade da troca ultrapassa a quantidade que ainda pode ser devolvida desta entrega.");
    }
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
        quantity, reason, ...(photo && { photo: { create: photo.data } }) },
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

async function deliveryStock(tx: Prisma.TransactionClient, companyId: string, warehouseId: string, equipmentId: string, unitId: string, today: Date) {
  return tx.stock.findMany({
    where: { companyId, warehouseId, quantity: { gt: 0 }, warehouse: { active: true, unitId },
      lot: { ...availableLotWhere(today), equipmentId } },
    orderBy: [{ lot: { expiresAt: { sort: "asc", nulls: "last" } } }, { lotId: "asc" }],
    select: { lotId: true, quantity: true },
  });
}

async function deductDeliveryStock(tx: Prisma.TransactionClient, location: { companyId: string; warehouseId: string },
  deliveryId: string, actorId: string, stocks: { lotId: string; quantity: number }[], quantity: number) {
  if (stocks.reduce((total, stock) => total + stock.quantity, 0) < quantity) {
    return invalid("O estoque selecionado não tem saldo disponível suficiente para este item.");
  }
  let remaining = quantity;
  for (const stock of stocks) {
    if (!remaining) break;
    const allocated = Math.min(remaining, stock.quantity);
    const key = { ...location, lotId: stock.lotId };
    const balance = await tx.stock.updateMany({
      where: { ...key, quantity: { gte: allocated } }, data: { quantity: { decrement: allocated } },
    });
    if (balance.count !== 1) return invalid("O saldo mudou. Confira a quantidade disponível e tente novamente.");
    await tx.stockMovement.create({ data: { ...key, actorId, delta: -allocated, deliveryId } });
    remaining -= allocated;
  }
}

export async function registerDelivery(companyId: string, id: string, requestId: string | null, paper: boolean, _: FormResult, data: FormData) {
  const result = await mutate(companyId, handlesStock, async (tx, scope, actorId) => {
    if (await tx.delivery.findUnique({ where: { companyId_id: { companyId, id }, actorId } })) return;
    const request = requestId ? await tx.equipmentRequest.findFirst({
      where: { ...requestWhere(scope), id: requestId },
      include: {
        replacementFor: { select: { id: true, employeeId: true, deliveredAt: true, voidedAt: true, quantity: true, returnedQuantity: true } },
        itemReturn: { select: { returnedAt: true } },
      },
    }) : null;
    if (requestId && (!request || request.status !== "WAITING_DELIVERY")) return invalid("Esta solicitação não aguarda entrega.");
    const employeeId = request?.employeeId ?? field(data, "employee", "Colaborador");
    const employee = await tx.employee.findFirst({ where: { ...employeesWhere(scope), id: employeeId, active: true, unit: { active: true } } });
    if (!employee || (request && request.unitId !== employee.unitId)) return invalid("O colaborador não está ativo na unidade da solicitação ou no seu escopo.");
    const equipmentId = await resolveEquipment(tx, companyId, data, request ? request.equipmentId ?? "" : paper ? null : field(data, "equipment", "Item"));
    const today = todayInBrazil();
    const quantity = request?.quantity ?? count(data);
    const deliveredAt = parseDay(text(data, "deliveredAt"));
    if (deliveredAt > today) return invalid("A data da entrega não pode ser futura.");
    if (request && deliveredAt < brazilDay(request.openedAt)) return invalid("A data não pode ser anterior à abertura da solicitação.");
    const source = request?.replacementFor;
    if (source && request) {
      if (source.voidedAt || source.employeeId !== employeeId) return invalid("A entrega original está indisponível para troca.");
      const returnedAt = request.itemReturn?.returnedAt ?? parseDay(field(data, "returnedAt", "Data da devolução", 10));
      if (returnedAt < source.deliveredAt || returnedAt > deliveredAt) {
        return invalid("A data de devolução deve ficar entre a entrega original e a entrega de substituição.");
      }
      if (!request.itemReturn) {
        if (quantity > source.quantity - source.returnedQuantity) return invalid("O pedido ultrapassa a quantidade disponível para devolução.");
        await tx.deliveryReturn.create({ data: { companyId, requestId: request.id, deliveryId: source.id, actorId, quantity, returnedAt } });
        await tx.delivery.update({
          where: { companyId_id: { companyId, id: source.id } }, data: { returnedQuantity: { increment: quantity } },
        });
        await tx.equipmentEvent.create({
          data: { companyId, subjectId: source.id, actorId, kind: "RETURNED_FOR_DISPOSAL", note: request.id },
        });
      }
    }
    const proof = await readAttachment(data, "proof");
    const warehouseId = paper ? null : field(data, "warehouse", contractNumberLabel);
    const contractNumber = paper ? field(data, "contractNumber", contractNumberLabel, 120, true) || null : null;
    const stocks = warehouseId ? await deliveryStock(tx, companyId, warehouseId, equipmentId, employee.unitId, today) : [];
    if (warehouseId && !stocks.length) {
      return invalid("O estoque selecionado não tem saldo disponível suficiente para este item.");
    }
    await tx.delivery.create({
      data: { companyId, warehouseId, lotId: stocks[0]?.lotId ?? null, id, employeeId, actorId, equipmentId, quantity, deliveredAt, contractNumber,
        requestId: request?.id, ...(proof && { proof: { create: { ...proof.data, name: proof.name } } }) },
    });
    if (warehouseId) await deductDeliveryStock(tx, { companyId, warehouseId }, id, actorId, stocks, quantity);
    await tx.equipmentEvent.create({ data: { companyId, subjectId: id, actorId, kind: paper ? "PAPER_RECORDED" : "DELIVERED" } });
    if (request) {
      await tx.equipmentRequest.update({ where: { companyId_id: { companyId, id: request.id } }, data: { status: "COMPLETED" } });
      await tx.equipmentEvent.create({ data: { companyId, subjectId: request.id, actorId, kind: "COMPLETED" } });
    }
  });
  if (!result.success) return result;
  if (paper) return { success: "Entrega anterior registrada." };
  if (data.get("continue") === "on" && !requestId) return { success: "Entrega registrada e saldo atualizado." };
  redirect(`/${companyId}/entregas?registrada=1`);
}

async function restoreDeliveryStock(tx: Prisma.TransactionClient, companyId: string, warehouseId: string, deliveryId: string,
  actorId: string, recordedQuantity: number, restoreQuantity: number) {
  const movements = await tx.stockMovement.findMany({ where: { companyId, warehouseId, deliveryId },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }], select: { lotId: true, delta: true } });
  const net = new Map<string, number>();
  for (const { lotId, delta } of movements) net.set(lotId, (net.get(lotId) ?? 0) - delta);
  const positions = Array.from(net.entries()).reverse();
  if (positions.some(([, quantity]) => quantity < 0) || positions.reduce((sum, [, quantity]) => sum + quantity, 0) !== recordedQuantity) {
    return invalid("Não foi possível conferir as baixas desta entrega para devolver o saldo.");
  }
  let remaining = restoreQuantity;
  for (const [lotId, quantity] of positions) {
    if (!remaining) break;
    const delta = Math.min(remaining, quantity);
    if (!delta) continue;
    const key = { companyId, warehouseId, lotId };
    const balance = await tx.stock.updateMany({
      where: { ...key, quantity: { lte: 2_147_483_647 - delta } }, data: { quantity: { increment: delta } },
    });
    if (balance.count !== 1) return invalid("Não foi possível devolver essa quantidade ao estoque.");
    await tx.stockMovement.create({ data: { ...key, deliveryId, actorId, delta } });
    remaining -= delta;
  }
}

export async function editDelivery(companyId: string, id: string, _: FormResult, data: FormData) {
  const result = await mutate(companyId, canAdminister, async (tx, scope, actorId) => {
    const key = { companyId_id: { companyId, id } };
    const delivery = await tx.delivery.findUnique({ where: { ...key, voidedAt: null }, include: {
      employee: { select: { unitId: true } }, receipt: true, retirement: { select: { retiredAt: true } },
      request: { select: { openedAt: true, itemReturn: { select: { returnedAt: true } } } },
      returns: { orderBy: { returnedAt: "asc" }, take: 1, select: { returnedAt: true } },
      _count: { select: { replacementRequests: true } }, proof: { select: { sha256: true } },
    } });
    if (!delivery) return invalid("Entrega indisponível no histórico.");
    const note = field(data, "note", "Motivo da correção", 500);
    const deliveredAt = parseDay(text(data, "deliveredAt"));
    const today = todayInBrazil();
    if (deliveredAt > today) return invalid("A data da entrega não pode ser futura.");
    if (delivery.request && deliveredAt < brazilDay(delivery.request.openedAt)) return invalid("A data não pode ser anterior à abertura da solicitação.");
    if (delivery.request?.itemReturn && deliveredAt < delivery.request.itemReturn.returnedAt) return invalid("A substituição não pode anteceder a devolução registrada.");
    if (delivery.returns[0] && deliveredAt > delivery.returns[0].returnedAt) return invalid("A entrega original não pode ser posterior à devolução registrada.");
    if (delivery.receipt && deliveredAt > brazilDay(delivery.receipt.confirmedAt)) return invalid("A entrega deve anteceder ou coincidir com a confirmação de recebimento.");
    if (delivery.retirement && deliveredAt > brazilDay(delivery.retirement.retiredAt)) return invalid("A entrega deve anteceder ou coincidir com a retirada de uso.");
    const editable = deliveryCorrectionFields(delivery);
    const quantity = editable.quantity ? count(data) : delivery.quantity;
    const employeeId = editable.assignment ? field(data, "employee", "Colaborador") : delivery.employeeId;
    const equipmentId = editable.assignment ? field(data, "equipment", "Item") : delivery.equipmentId;
    const contractNumber = !delivery.warehouseId && data.has("contractNumber") ?
      field(data, "contractNumber", contractNumberLabel, 120, true) || null : delivery.contractNumber;
    if (employeeId !== delivery.employeeId && !await tx.employee.findFirst({
      where: { ...employeesWhere(scope), id: employeeId, active: true }, select: { id: true },
    })) return invalid("Selecione um colaborador ativo desta empresa.");
    if (equipmentId !== delivery.equipmentId && !await tx.equipment.findUnique({
      where: { companyId_id: { companyId, id: equipmentId }, active: true }, select: { id: true },
    })) return invalid("Selecione um item ativo desta empresa.");
    const proof = await readAttachment(data, "proof");
    const difference = quantity - delivery.quantity;
    if (!difference && deliveredAt.getTime() === delivery.deliveredAt.getTime() &&
        employeeId === delivery.employeeId && equipmentId === delivery.equipmentId && contractNumber === delivery.contractNumber && !proof) return;
    if (delivery.warehouseId && difference > 0) {
      const stocks = await deliveryStock(tx, companyId, delivery.warehouseId, equipmentId, delivery.employee.unitId, today);
      await deductDeliveryStock(tx, { companyId, warehouseId: delivery.warehouseId }, id, actorId, stocks, difference);
    }
    if (delivery.warehouseId && difference < 0) {
      await restoreDeliveryStock(tx, companyId, delivery.warehouseId, id, actorId, delivery.quantity, -difference);
    }
    if (difference && delivery.receipt) await tx.deliveryReceipt.delete({ where: { companyId_deliveryId: { companyId, deliveryId: id } } });
    const updatedProof = proof && { ...proof.data, name: proof.name };
    await tx.delivery.update({
      where: key, data: { deliveredAt, quantity, employeeId, equipmentId, contractNumber,
        ...(updatedProof && { proof: { upsert: { create: updatedProof, update: updatedProof } } }) },
    });
    await tx.equipmentEvent.create({ data: { companyId, subjectId: id, actorId, kind: "DELIVERY_EDITED", note: JSON.stringify({
      reason: note,
      before: { deliveredAt: delivery.deliveredAt, quantity: delivery.quantity, employeeId: delivery.employeeId,
        equipmentId: delivery.equipmentId, contractNumber: delivery.contractNumber, proofHash: delivery.proof?.sha256, receipt: difference ? delivery.receipt : undefined },
      after: { deliveredAt, quantity, employeeId, equipmentId, contractNumber, proofHash: updatedProof?.sha256 ?? delivery.proof?.sha256 },
    }) } });
  });
  return finishSave(result.success ? { success: "Entrega atualizada." } : result, data, `/${companyId}/entregas?registrada=editada`);
}

export async function voidDelivery(companyId: string, id: string, _: FormResult, data: FormData) {
  const result = await mutate(companyId, canAdminister, async (tx, _scope, actorId) => {
    const key = { companyId_id: { companyId, id } };
    const delivery = await tx.delivery.findUnique({ where: key, select: { voidedAt: true, warehouseId: true, quantity: true, requestId: true, returnedQuantity: true,
      request: { select: { replacementFor: { select: { voidedAt: true } } } },
      replacementRequests: { where: { status: { in: ["WAITING_CATALOG", "PENDING_APPROVAL", "WAITING_DELIVERY"] } }, select: { id: true } },
    } });
    if (!delivery) return invalid("Entrega indisponível no histórico.");
    if (delivery.voidedAt) return;
    if (delivery.returnedQuantity) return invalid("Esta entrega tem uma devolução registrada para descarte e precisa permanecer no histórico.");
    const note = field(data, "note", "Motivo da exclusão", 500);
    if (delivery.warehouseId) {
      await restoreDeliveryStock(tx, companyId, delivery.warehouseId, id, actorId, delivery.quantity, delivery.quantity);
    }
    await tx.delivery.update({ where: key, data: { voidedAt: new Date(), requestId: null } });
    if (delivery.requestId) {
      const status = delivery.request?.replacementFor?.voidedAt ? "CANCELLED" : "WAITING_DELIVERY";
      await tx.equipmentRequest.update({ where: { companyId_id: { companyId, id: delivery.requestId } }, data: { status } });
      await tx.equipmentEvent.create({ data: { companyId, subjectId: delivery.requestId, actorId, kind: status, note: id } });
    }
    for (const { id: replacementId } of delivery.replacementRequests) {
      await tx.equipmentRequest.update({ where: { companyId_id: { companyId, id: replacementId } }, data: { status: "CANCELLED" } });
      await tx.equipmentEvent.create({ data: { companyId, subjectId: replacementId, actorId, kind: "CANCELLED", note: id } });
    }
    await tx.equipmentEvent.create({ data: { companyId, subjectId: id, actorId, kind: "DELIVERY_VOIDED", note: JSON.stringify({
      reason: note, requestId: delivery.requestId, quantity: delivery.quantity,
    }) } });
  });
  if (result.success) redirect(`/${companyId}/entregas?registrada=apagada`);
  return result;
}

export async function confirmReceipt(companyId: string, deliveryId: string, _: FormResult) {
  return mutate(companyId, hasPersonalEquipment, async (tx, scope, actorId) => {
    const delivery = await tx.delivery.findUnique({
      where: { companyId_id: { companyId, id: deliveryId }, employeeId: ownEmployeeId(scope), voidedAt: null },
      select: { receipt: { select: { deliveryId: true } }, quantity: true, returnedQuantity: true },
    });
    if (!delivery) return invalid("Esta entrega não está no seu histórico pessoal.");
    if (delivery.receipt) return;
    if (delivery.returnedQuantity === delivery.quantity) return invalid("Esta entrega já foi devolvida para descarte.");
    const confirmedAt = new Date();
    await tx.deliveryReceipt.create({ data: { companyId, deliveryId, actorId, confirmedAt } });
    await tx.equipmentEvent.create({ data: { companyId, subjectId: deliveryId, actorId, kind: "RECEIPT_CONFIRMED", occurredAt: confirmedAt } });
  });
}
