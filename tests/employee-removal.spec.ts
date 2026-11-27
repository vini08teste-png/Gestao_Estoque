import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { todayInBrazil } from "../lib/equipment";
import { hashPassword } from "../lib/password";
import { seedScenario, testDb } from "./fixtures";

test("administrador pode apagar um cadastro sem vínculos ou desativar um cadastro com histórico", async ({ page }) => {
  const db = testDb();
  try {
    const scenario = await seedScenario(db);
    const companyId = "tsa";
    const base = "/tsa/colaboradores";
    const disposable = await db.employee.create({ data: {
      companyId, unitId: scenario.unit.id, name: `Cadastro de teste ${scenario.tag}`,
      registration: `EXCLUIR-${scenario.tag}`, jobTitle: "Técnico",
    } });
    const delivery = await db.delivery.create({ data: {
      id: randomUUID(), companyId, employeeId: scenario.worker.id, actorId: scenario.operator.id,
      equipmentId: scenario.uniform.item.id, quantity: 1, deliveredAt: todayInBrazil(),
    } });
    const password = `Teste-remocao-${randomUUID()}`;
    const admin = await db.user.create({ data: {
      email: `remocao-${randomUUID()}@example.test`, passwordHash: await hashPassword(password),
      scopes: { create: { companyId, name: "Administrador de teste", role: "ADMIN", allUnits: true } },
    } });
    const login = async (email: string, password: string) => {
      await page.goto("/login");
      await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Senha", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page).toHaveURL(/\/tsa$/);
    };
    await login(scenario.manager.email, scenario.manager.password);
    expect((await page.request.get(`${base}?apagar=${disposable.id}`)).status()).toBe(404);
    await page.locator(".sidebar").getByRole("button", { name: "Sair" }).click();
    await login(admin.email, password);
    await page.goto(`${base}?q=${disposable.registration}`);
    await page.getByRole("button", { name: `Ações de ${disposable.name}` }).click();
    await page.getByRole("link", { name: "Apagar colaborador" }).click();
    await expect(page.getByText(disposable.name, { exact: true })).toBeVisible();
    expect(await db.employee.count({ where: { companyId, id: disposable.id } })).toBe(1);
    await page.getByRole("button", { name: "Apagar definitivamente" }).click();
    await expect(page.getByRole("status")).toHaveText("Colaborador apagado.");
    expect(await db.employee.count({ where: { companyId, id: disposable.id } })).toBe(0);

    await page.goto(`${base}?apagar=${scenario.worker.id}`);
    await expect(page.getByRole("button", { name: "Apagar definitivamente" })).toHaveCount(0);
    await page.getByRole("button", { name: "Desativar colaborador" }).click();
    await expect(page.getByRole("status")).toHaveText("Colaborador desativado.");
    const worker = await db.employee.findUniqueOrThrow({
      where: { companyId_id: { companyId, id: scenario.worker.id } }, include: { scope: true, deliveries: true },
    });
    expect(worker.active).toBe(false);
    expect(worker.scope?.active).toBe(false);
    expect(worker.deliveries).toContainEqual(expect.objectContaining({ id: delivery.id, voidedAt: null }));
  } finally {
    await db.$disconnect();
  }
});
