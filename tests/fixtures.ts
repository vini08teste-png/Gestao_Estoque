import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import type { Role } from "../generated/prisma/enums";
import { todayInBrazil } from "../lib/equipment";
import { hashPassword } from "../lib/password";
import { testDatabaseUrl } from "./test-database";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=", "base64");

export const testDb = () => new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});

export async function seedScenario(db: PrismaClient) {
  const run = randomUUID();
  const tag = run.slice(0, 8);
  const password = `Teste-epi-${run}`;
  const passwordHash = await hashPassword(password);
  const companyId = "tsa";
  const name = (label: string) => `${label} ${tag}`;
  const user = async (role: Role, employeeId: string | null, unitId: string | null) => {
    const email = `${role.toLowerCase()}-${run}@example.test`;
    const account = await db.user.create({ data: { email, passwordHash } });
    await db.userScope.create({
      data: { companyId, userId: account.id, name: name(role), role, employeeId, allUnits: role === "ADMIN",
        ...(unitId && { units: { create: { unitId } } }) },
    });
    return { ...account, password };
  };
  await Promise.all([
    db.company.upsert({ where: { id: companyId }, create: { id: companyId, name: "TSA" }, update: {} }),
    db.company.upsert({ where: { id: "lynx" }, create: { id: "lynx", name: "TSA Lynx" }, update: {} }),
  ]);
  const [unit, outsideUnit] = await Promise.all([
    db.unit.create({ data: { companyId, name: name("Unidade de teste") } }),
    db.unit.create({ data: { companyId, name: name("Unidade restrita") } }),
  ]);

  const employee = (label: string, unitId: string, supervisorId?: string) => db.employee.create({
    data: { companyId, unitId, name: name(label), registration: `${tag}-${label}`, department: "Operação",
      jobTitle: label, supervisorId },
  });
  const supervisorEmployee = await employee("Gerência", unit.id);
  const worker = await employee("Colaborador", unit.id, supervisorEmployee.id);
  const outside = await employee("Pessoa restrita", outsideUnit.id);
  const [manager, supervisor, employeeAccount, operator] = await Promise.all([
    user("MANAGER", null, unit.id),
    user("SUPERVISOR", supervisorEmployee.id, null),
    user("EMPLOYEE", worker.id, null),
    user("WAREHOUSE", null, unit.id),
  ]);
  const [warehouse, outsideWarehouse] = await Promise.all([
    db.warehouse.create({ data: { companyId, unitId: unit.id, name: name("Almoxarifado teste") } }),
    db.warehouse.create({ data: { companyId, unitId: outsideUnit.id, name: name("Almoxarifado restrito") } }),
  ]);
  const addStock = async (label: string, warehouseId: string, quantity: number) => {
    const item = await db.equipment.create({
      data: { companyId, name: name(label), category: "UNIFORM", makerModel: "Modelo de teste", notes: "" },
    });
    const lot = await db.equipmentLot.create({ data: { companyId, equipmentId: item.id, code: tag } });
    await db.$transaction([
      db.stock.create({ data: { companyId, warehouseId, lotId: lot.id, quantity } }),
      db.stockMovement.create({ data: { companyId, warehouseId, lotId: lot.id, delta: quantity, actorId: operator.id } }),
    ]);
    return { item, lot, stockValue: `${warehouseId}|${lot.id}` };
  };
  const [uniform, scarce, hidden] = await Promise.all([
    addStock("Camisa de teste", warehouse.id, 4),
    addStock("Última unidade", warehouse.id, 1),
    addStock("Material restrito", outsideWarehouse.id, 2),
  ]);
  const hiddenDelivery = await db.delivery.create({
    data: {
      companyId, id: randomUUID(), employeeId: outside.id, equipmentId: hidden.item.id,
      warehouseId: outsideWarehouse.id, lotId: hidden.lot.id, actorId: operator.id, quantity: 1, deliveredAt: todayInBrazil(),
      proof: { create: { name: "teste.png", mime: "image/png", content: png, sha256: createHash("sha256").update(png).digest("hex") } },
    },
  });
  await db.$transaction([
    db.stock.update({ where: { companyId_warehouseId_lotId: {
      companyId, warehouseId: outsideWarehouse.id, lotId: hidden.lot.id,
    } }, data: { quantity: { decrement: 1 } } }),
    db.stockMovement.create({ data: { companyId, warehouseId: outsideWarehouse.id, lotId: hidden.lot.id, delta: -1,
      actorId: operator.id, deliveryId: hiddenDelivery.id } }),
  ]);
  const outsideRequest = await db.equipmentRequest.create({ data: {
    companyId, id: randomUUID(), employeeId: outside.id, unitId: outsideUnit.id, equipmentId: hidden.item.id,
    quantity: 1, status: "PENDING_APPROVAL", reason: "Pedido fora da equipe de teste.",
  } });
  return { tag, worker, outside, unit, outsideUnit, manager, supervisor, employeeAccount, operator,
    uniform, scarce, hidden, hiddenDelivery, outsideRequest, warehouse };
}
