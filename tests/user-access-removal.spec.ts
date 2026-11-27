import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "../lib/password";
import { seedScenario, testDb } from "./fixtures";

test("apagar acesso revoga apenas a empresa selecionada, inclusive em sessão aberta", async ({ page, browser }) => {
  const db = testDb();
  const targetContext = await browser.newContext();
  try {
    const scenario = await seedScenario(db);
    const companyId = "tsa";
    const base = "/tsa/usuarios";
    const password = `Teste-acesso-${randomUUID()}`;
    const admin = await db.user.create({ data: {
      email: `admin-${randomUUID()}@example.test`,
      passwordHash: await hashPassword(password),
      scopes: { create: { companyId, name: "Administrador de teste", role: "ADMIN", allUnits: true } },
    } });
    await db.userScope.create({ data: {
      companyId: "lynx", userId: scenario.employeeAccount.id, name: "Gestor de teste", role: "MANAGER", allUnits: true,
    } });
    const login = async (session: Page, email: string, secret: string) => {
      await session.goto("/login");
      await session.getByLabel("E-mail").fill(email);
      await session.getByLabel("Senha", { exact: true }).fill(secret);
      await session.getByRole("button", { name: "Entrar" }).click();
      await expect(session).toHaveURL(/\/tsa$/);
    };
    await login(page, admin.email, password);
    const target = await targetContext.newPage();
    await login(target, scenario.employeeAccount.email, scenario.employeeAccount.password);
    expect((await target.request.get(`${base}?apagar=${admin.id}`)).status()).toBe(404);
    expect((await page.request.get(`${base}?apagar=${admin.id}`)).status()).toBe(404);

    await page.goto(base);
    const row = page.getByRole("row").filter({ hasText: scenario.employeeAccount.email });
    await row.getByRole("button", { name: /^Ações de/ }).click();
    await row.getByRole("link", { name: "Apagar acesso" }).click();
    await expect(page.getByText(scenario.employeeAccount.email, { exact: false })).toBeVisible();
    expect((await target.request.get("/tsa")).status()).toBe(200);
    await page.getByRole("button", { name: "Confirmar exclusão do acesso" }).click();
    await expect(page.getByRole("status")).toHaveText("Acesso apagado.");
    await expect(row).toHaveCount(0);
    expect((await target.request.get("/tsa")).status()).toBe(404);
    expect((await target.request.get("/lynx")).status()).toBe(200);
    expect(await db.employee.count({ where: { companyId, id: scenario.worker.id } })).toBe(1);
  } finally {
    await targetContext.close();
    await db.$disconnect();
  }
});
