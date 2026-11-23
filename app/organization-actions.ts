"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { canAdminister, requireScope, type AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAddEmployees, unitsWhere } from "@/lib/directory";
import { emailAddress, text, validEmail, type FormResult } from "@/lib/forms";
import { roles } from "@/lib/organization";
import { hashPassword, validPassword, verifyPassword } from "@/lib/password";
import type { Role } from "@/generated/prisma/enums";

class FormError extends Error {}

function required(data: FormData, name: string, label: string, max = 120) {
  const value = text(data, name);
  if (!value || value.length > max) throw new FormError(`Preencha ${label} com até ${max} caracteres.`);
  return value;
}

async function save(companyId: string, operation: (tx: Prisma.TransactionClient, actor: string, scope: AccessScope) => Promise<void>,
  allowed = canAdminister): Promise<FormResult> {
  const { scope, viewer } = await requireScope(companyId);
  if (!allowed(scope)) notFound();
  try {
    await db.$transaction(async (tx) => {
      const permitted = await tx.userScope.findUnique({
        where: { companyId_userId: { companyId, userId: viewer.id }, active: true },
        include: { company: true, units: { select: { unitId: true } }, employee: { select: { id: true, unitId: true, active: true } } },
      });
      if (!permitted || !allowed(permitted)) throw new FormError("Seu acesso foi alterado. Atualize a página.");
      await operation(tx, viewer.id, permitted);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof FormError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case "P2002": return { error: "Já existe um cadastro com esses dados ou o colaborador já está vinculado a outro usuário." };
        case "P2003": return { error: "O registro tem vínculos incompatíveis com esta alteração. Confira a unidade e a equipe." };
        case "P2025": return { error: "Registro indisponível nesta empresa." };
        case "P2034": return { error: "Houve uma alteração simultânea. Atualize a página e tente novamente." };
      }
    }
    throw error;
  }
  revalidatePath("/", "layout");
  return { success: "Alterações salvas." };
}

export async function saveCompany(companyId: string, _: FormResult, data: FormData) {
  return save(companyId, async (tx) => {
    const name = required(data, "name", "o nome");
    await tx.company.update({ where: { id: companyId }, data: { name } });
  });
}

export async function saveAlertDays(companyId: string, _: FormResult, data: FormData) {
  return save(companyId, async (tx) => {
    const alertDays = ["short", "medium", "long"].map((name) => Number(text(data, name)));
    const [short, medium, long] = alertDays;
    if (!alertDays.every(Number.isInteger) || short < 1 || long > 365 || short >= medium || medium >= long) {
      throw new FormError("Informe três prazos diferentes, em ordem crescente, entre 1 e 365 dias.");
    }
    await tx.company.update({ where: { id: companyId }, data: { alertDays } });
  });
}

export async function saveUnit(companyId: string, id: string | null, _: FormResult, data: FormData) {
  return save(companyId, async (tx) => {
    const values = { name: required(data, "name", "o nome"), active: data.get("active") === "on" };
    if (id) await tx.unit.update({ where: { companyId_id: { companyId, id } }, data: values });
    else await tx.unit.create({ data: { companyId, ...values } });
  });
}

export async function saveEmployee(companyId: string, id: string | null, _: FormResult, data: FormData) {
  return save(companyId, async (tx, _, scope) => {
    const unitId = required(data, "unit", "a unidade");
    const supervisorId = scope.role === "SUPERVISOR" ? scope.employee?.id ?? null : text(data, "supervisor") || null;
    const values = {
      unitId,
      supervisorId,
      registration: required(data, "registration", "a matrícula", 32).toUpperCase(),
      name: required(data, "name", "o nome"),
      department: required(data, "department", "o setor"),
      jobTitle: required(data, "jobTitle", "a função"),
      active: data.get("active") === "on",
    };
    const unit = await tx.unit.findFirst({ where: { AND: [unitsWhere(scope), { id: unitId }] } });
    if (!unit) throw new FormError("Selecione uma unidade no seu escopo.");
    if (supervisorId) {
      const people = await tx.employee.findMany({
        where: { companyId, unitId }, select: { id: true, supervisorId: true },
      });
      const chain = new Map(people.map((person) => [person.id, person.supervisorId]));
      if (!chain.has(supervisorId)) throw new FormError("Selecione um encarregado da mesma unidade.");
      const seen = new Set(id ? [id] : []);
      for (let cursor: string | null = supervisorId; cursor; cursor = chain.get(cursor) ?? null) {
        if (seen.has(cursor)) throw new FormError("Este encarregado criaria um ciclo na equipe.");
        seen.add(cursor);
      }
    }
    if (id) await tx.employee.update({ where: { companyId_id: { companyId, id } }, data: values });
    else await tx.employee.create({ data: { companyId, ...values } });
  }, id ? canAdminister : canAddEmployees);
}

export async function saveUser(companyId: string, id: string | null, _: FormResult, data: FormData) {
  return save(companyId, async (tx, actor) => {
    const name = required(data, "name", "o nome");
    const role = text(data, "role") as Role;
    if (!Object.hasOwn(roles, role)) throw new FormError("Selecione um perfil.");
    const active = data.get("active") === "on";
    const usesEmployee = role === "EMPLOYEE" || role === "SUPERVISOR";
    if (id === actor && (!active || role !== "ADMIN")) {
      throw new FormError("Outra conta administradora precisa alterar o seu próprio acesso.");
    }
    const allUnits = role === "ADMIN" || (!usesEmployee && data.get("allUnits") === "on");
    const unitIds = allUnits || usesEmployee ? [] :
      [...new Set(data.getAll("units").filter((unit): unit is string => typeof unit === "string"))];
    if (!allUnits && !usesEmployee && !unitIds.length) throw new FormError("Selecione pelo menos uma unidade.");
    if (unitIds.length && await tx.unit.count({ where: { companyId, id: { in: unitIds } } }) !== unitIds.length) {
      throw new FormError("Selecione apenas unidades desta empresa.");
    }
    const employeeId = usesEmployee ? required(data, "employee", "o vínculo com um colaborador") : text(data, "employee") || null;
    if (employeeId && !await tx.employee.findUnique({ where: { companyId_id: { companyId, id: employeeId } } })) {
      throw new FormError("Selecione um colaborador desta empresa.");
    }
    const values = { name, role, active, allUnits, employeeId };
    if (id) {
      await tx.userScope.update({
        where: { companyId_userId: { companyId, userId: id } },
        data: { ...values, units: { deleteMany: {}, createMany: { data: unitIds.map((unitId) => ({ unitId })) } } },
      });
      return;
    }
    const email = emailAddress(data);
    if (!validEmail(email)) throw new FormError("Informe um e-mail válido.");
    const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
    const password = data.get("password");
    if (existing && password) throw new FormError("Para vincular uma conta existente, deixe a senha inicial em branco.");
    if (!existing && (typeof password !== "string" || !validPassword(password))) {
      throw new FormError("Um novo usuário precisa de uma senha inicial com 12 a 128 caracteres.");
    }
    const user = existing ?? await tx.user.create({
      data: { email, passwordHash: await hashPassword(password as string), mustChangePassword: true }, select: { id: true },
    });
    await tx.userScope.create({
      data: { companyId, userId: user.id, ...values, units: { createMany: { data: unitIds.map((unitId) => ({ unitId })) } } },
    });
  });
}

export async function resetUserPassword(companyId: string, userId: string, _: FormResult, data: FormData) {
  return save(companyId, async (tx, actor) => {
    if (actor === userId) throw new FormError("Use Trocar senha no menu da sua conta.");
    const password = data.get("temporaryPassword");
    if (typeof password !== "string" || !validPassword(password)) throw new FormError("Informe uma senha temporária de 12 a 128 caracteres.");
    const target = await tx.user.findUnique({
      where: { id: userId }, select: { scopes: { select: { companyId: true } }, passwordHash: true },
    });
    if (!target?.scopes.some((scope) => scope.companyId === companyId)) throw new FormError("Conta indisponível nesta empresa.");
    const administered = await tx.userScope.count({
      where: { userId: actor, active: true, role: "ADMIN", allUnits: true, companyId: { in: target.scopes.map((scope) => scope.companyId) } },
    });
    if (administered !== target.scopes.length) throw new FormError("A redefinição precisa de um administrador com acesso a todas as empresas desta conta.");
    if (await verifyPassword(password, target.passwordHash)) throw new FormError("Defina uma senha temporária diferente da atual.");
    const passwordHash = await hashPassword(password);
    await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId } });
  });
}
