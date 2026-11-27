"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { canAdminister, requireScope, type AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAddEmployees, canGrantSupervisorAccess, employeeHasDependencies, employeeRemovalSelect, employeesWhere, managedContracts, unitsWhere } from "@/lib/directory";
import { emailAddress, text, validEmail, type FormResult } from "@/lib/forms";
import { finishSave } from "@/lib/form-navigation";
import { roles } from "@/lib/organization";
import { hashPassword, passwordLengthText, validPassword, verifyPassword } from "@/lib/password";
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
        include: { company: true, units: { select: { unitId: true } }, employee: { select: { id: true, unitId: true, contractId: true, active: true,
          contractLinks: { select: { warehouseId: true, manages: true } } } } },
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
  const result = await save(companyId, async (tx) => {
    const name = required(data, "name", "o nome");
    await tx.company.update({ where: { id: companyId }, data: { name } });
  });
  return finishSave(result, data, `/${companyId}`);
}

export async function saveAlertDays(companyId: string, _: FormResult, data: FormData) {
  const result = await save(companyId, async (tx) => {
    const alertDays = ["short", "medium", "long"].map((name) => Number(text(data, name)));
    const [short, medium, long] = alertDays;
    if (!alertDays.every(Number.isInteger) || short < 1 || long > 365 || short >= medium || medium >= long) {
      throw new FormError("Informe três prazos diferentes, em ordem crescente, entre 1 e 365 dias.");
    }
    await tx.company.update({ where: { id: companyId }, data: { alertDays } });
  });
  return finishSave(result, data, `/${companyId}/alertas`);
}

export async function saveUnit(companyId: string, id: string | null, _: FormResult, data: FormData) {
  const result = await save(companyId, async (tx) => {
    const values = { name: required(data, "name", "o nome"), active: data.get("active") === "on" };
    if (id) await tx.unit.update({ where: { companyId_id: { companyId, id } }, data: values });
    else await tx.unit.create({ data: { companyId, ...values } });
  });
  return finishSave(result, data, `/${companyId}/unidades`);
}

export async function saveEmployee(companyId: string, id: string | null, _: FormResult, data: FormData) {
  const result = await save(companyId, async (tx, _, scope) => {
    const unitId = required(data, "unit", "a unidade");
    const contractId = text(data, "contract") || null;
    if (scope.role === "SUPERVISOR" && (!contractId || !managedContracts(scope).includes(contractId))) {
      throw new FormError("Selecione um contrato que você gerencia.");
    }
    if (scope.role === "SUPERVISOR" && !contractId) throw new FormError("Vincule seu cadastro a um contrato para cadastrar a equipe.");
    const contractorCompany = text(data, "contractorCompany");
    if (contractorCompany.length > 120) throw new FormError("Informe o nome da empresa com até 120 caracteres.");
    const values = {
      unitId,
      contractId,
      ...(data.has("contractorCompany") && { contractorCompany: contractorCompany || null }),
      registration: required(data, "registration", "a matrícula", 32).toUpperCase(),
      name: required(data, "name", "o nome"),
      jobTitle: required(data, "jobTitle", "a função"),
      active: data.get("active") === "on",
    };
    const unit = await tx.unit.findFirst({ where: { AND: [unitsWhere(scope), { id: unitId }] } });
    if (!unit) throw new FormError("Selecione uma unidade no seu escopo.");
    if (contractId && !await tx.warehouse.findFirst({
      where: { companyId, unitId, id: contractId, OR: [
        { active: true, contractNumber: { not: null } },
        ...(id ? [{ employees: { some: { id } } }] : []),
      ] },
      select: { id: true },
    })) throw new FormError("Selecione um contrato ativo da mesma unidade.");
    const person = id ? await tx.employee.update({ where: { companyId_id: { companyId, id } }, data: { ...values, supervisorId: null } }) :
      await tx.employee.create({ data: { companyId, ...values } });
    if (canAdminister(scope) && data.has("contractLinks")) {
      const linked = [...new Set([...(contractId ? [contractId] : []), ...data.getAll("additionalContract")
        .filter((value): value is string => typeof value === "string" && Boolean(value))])];
      const managed = new Set(data.getAll("managedContract"));
      if ([...managed].some((value) => typeof value !== "string" || !linked.includes(value))) {
        throw new FormError("Vincule o contrato antes de marcar Gerência para ele.");
      }
      const available = await tx.warehouse.findMany({ where: { companyId, id: { in: linked },
        OR: [{ active: true, unit: { active: true }, contractNumber: { not: null } },
          { employeeLinks: { some: { employeeId: person.id } } }, { id: contractId ?? "" }] }, select: { id: true } });
      if (available.length !== linked.length) throw new FormError("Selecione contratos disponíveis nesta empresa.");
      await tx.employeeContract.deleteMany({ where: { companyId, employeeId: person.id } });
      if (linked.length) await tx.employeeContract.createMany({ data: linked.map((warehouseId) => ({
        companyId, employeeId: person.id, warehouseId, manages: managed.has(warehouseId),
      })) });
      if (!linked.some((warehouseId) => managed.has(warehouseId))) {
        const supervisor = await tx.userScope.findFirst({ where: { companyId, employeeId: person.id, active: true, role: "SUPERVISOR" } });
        if (supervisor) throw new FormError("Marque pelo menos um contrato de Gerência ou altere o perfil em Acessos e perfis.");
      }
    }
  }, id ? canAdminister : canAddEmployees);
  return finishSave(result, data, `/${companyId}/colaboradores`);
}

export async function removeEmployee(companyId: string, id: string, mode: "delete" | "deactivate", _: FormResult) {
  const result = await save(companyId, async (tx, actor) => {
    const key = { companyId_id: { companyId, id } };
    const employee = await tx.employee.findUnique({ where: key, select: employeeRemovalSelect });
    if (!employee) throw new FormError("Colaborador indisponível nesta empresa.");
    if (employee.scope?.userId === actor) throw new FormError("Outro administrador precisa alterar o cadastro vinculado à sua conta.");
    if (mode === "delete") {
      if (employeeHasDependencies(employee)) throw new FormError("Este cadastro tem vínculos. Reabra a confirmação para desativá-lo.");
      await tx.employee.delete({ where: key });
      return;
    }
    await tx.employee.update({ where: key, data: { active: false } });
    if (employee.scope?.active) {
      await tx.userScope.update({
        where: { companyId_userId: { companyId, userId: employee.scope.userId } },
        data: { active: false },
      });
    }
  });
  if (result.success) redirect(`/${companyId}/colaboradores?resultado=${mode === "delete" ? "apagado" : "desativado"}`);
  return result;
}

async function createUser(tx: Prisma.TransactionClient, email: string, password: FormDataEntryValue | null) {
  if (typeof password !== "string" || !validPassword(password)) {
    throw new FormError(`Um novo usuário precisa de uma senha inicial com ${passwordLengthText} caracteres.`);
  }
  return tx.user.create({
    data: { email, passwordHash: await hashPassword(password), mustChangePassword: true }, select: { id: true },
  });
}

export async function grantSupervisorAccess(companyId: string, employeeId: string, _: FormResult, data: FormData) {
  return save(companyId, async (tx, _actor, scope) => {
    const employee = await tx.employee.findFirst({
      where: { ...employeesWhere(scope), id: employeeId, active: true },
      select: { name: true, contractId: true, contractLinks: true, scope: { select: { userId: true, active: true, role: true } } },
    });
    if (!employee) throw new FormError("Colaborador ativo indisponível nas suas unidades.");
    const assigned = employee.contractLinks.filter(({ manages }) => manages).map(({ warehouseId }) => warehouseId);
    const destinationIds = assigned.length ? assigned : employee.contractId ? [employee.contractId] : [];
    if (!destinationIds.length || await tx.warehouse.count({ where: { companyId, id: { in: destinationIds },
      unit: unitsWhere(scope) } }) !== destinationIds.length) {
      throw new FormError("Marque um contrato de Gerência no cadastro do colaborador.");
    }
    if (!assigned.length && employee.contractLinks.some(({ warehouseId }) => warehouseId === employee.contractId)) {
      await tx.employeeContract.update({
        where: { companyId_employeeId_warehouseId: { companyId, employeeId, warehouseId: destinationIds[0] } },
        data: { manages: true },
      });
    }
    if (employee.scope) {
      const { active, role, userId } = employee.scope;
      if (active && role === "SUPERVISOR") return;
      if (!active || role !== "EMPLOYEE") {
        throw new FormError("Peça a um administrador para revisar o perfil atual desta pessoa.");
      }
      await tx.userScope.update({
        where: { companyId_userId: { companyId, userId } },
        data: { role: "SUPERVISOR", allUnits: false, units: { deleteMany: {} } },
      });
      return;
    }
    const email = emailAddress(data);
    if (!validEmail(email)) throw new FormError("Informe um e-mail válido.");
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new FormError("Este e-mail já tem uma conta. Peça a um administrador para revisar o vínculo.");
    }
    const user = await createUser(tx, email, data.get("password"));
    await tx.userScope.create({
      data: { companyId, userId: user.id, employeeId, name: employee.name, role: "SUPERVISOR", allUnits: false },
    });
  }, canGrantSupervisorAccess);
}

export async function saveUser(companyId: string, id: string | null, _: FormResult, data: FormData) {
  const result = await save(companyId, async (tx, actor) => {
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
    const employee = employeeId ? await tx.employee.findUnique({ where: { companyId_id: { companyId, id: employeeId } }, include: { contractLinks: true } }) : null;
    if (employeeId && !employee) {
      throw new FormError("Selecione um colaborador desta empresa.");
    }
    if (role === "SUPERVISOR" && active && !employee?.contractLinks.some(({ manages }) => manages)) {
      if (!employee?.contractId) throw new FormError("Marque um contrato de Gerência no cadastro do colaborador.");
      await tx.employeeContract.updateMany({
        where: { companyId, employeeId: employee.id, warehouseId: employee.contractId }, data: { manages: true },
      });
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
    const user = existing ?? await createUser(tx, email, password);
    await tx.userScope.create({
      data: { companyId, userId: user.id, ...values, units: { createMany: { data: unitIds.map((unitId) => ({ unitId })) } } },
    });
  });
  return finishSave(result, data, `/${companyId}/usuarios`);
}

export async function removeUserAccess(companyId: string, userId: string, _: FormResult) {
  const result = await save(companyId, async (tx, actor) => {
    if (actor === userId) throw new FormError("Outro administrador precisa remover o seu acesso.");
    await tx.userScope.delete({ where: { companyId_userId: { companyId, userId } } });
  });
  if (result.success) redirect(`/${companyId}/usuarios?resultado=apagado`);
  return result;
}

export async function resetUserPassword(companyId: string, userId: string, _: FormResult, data: FormData) {
  return save(companyId, async (tx, actor) => {
    if (actor === userId) throw new FormError("Use Trocar senha no menu da sua conta.");
    const password = data.get("temporaryPassword");
    if (typeof password !== "string" || !validPassword(password)) throw new FormError(`Informe uma senha temporária de ${passwordLengthText} caracteres.`);
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
