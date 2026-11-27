import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { hashPassword } from "../lib/password";
import { seedScenario, testDb } from "./fixtures";

test("manutenção exige conta dedicada e importa fichas sem duplicar entregas", async ({ page }) => {
  const allowedId = process.env.EPI_MAINTENANCE_USER_ID;
  test.skip(!allowedId, "Configure uma conta dedicada de teste em EPI_MAINTENANCE_USER_ID.");
  const db = testDb();
  try {
    const scenario = await seedScenario(db);
    const run = randomUUID();
    const password = `Teste-import-${run}`;
    const passwordHash = await hashPassword(password);
    const admin = await db.user.upsert({
      where: { id: allowedId! },
      create: { id: allowedId, email: `import-${run}@example.test`, passwordHash,
        scopes: { create: { companyId: "tsa", name: "Importador de teste", role: "ADMIN", allUnits: true } } },
      update: { passwordHash },
    });
    const outsideAdmin = await db.user.create({
      data: { email: `outra-conta-${run}@example.test`, passwordHash,
        scopes: { create: { companyId: "tsa", name: "Outra conta de teste", role: "ADMIN", allUnits: true } } },
    });
    const login = async (email: string) => {
      await page.goto("/login");
      await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Senha", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page).toHaveURL(/\/tsa$/);
    };
    await login(outsideAdmin.email);
    expect((await page.request.get("/tsa/manutencao")).status()).toBe(404);
    await page.locator(".sidebar").getByRole("button", { name: "Sair" }).click();
    await login(admin.email);
    expect((await page.request.get("/lynx/manutencao")).status()).toBe(404);
    await page.goto("/tsa/manutencao");
    const registration = `IMPORT-${scenario.tag}`.toUpperCase();
    const personName = `Pessoa de teste ${scenario.tag}`;
    const item = scenario.uniform.item.name;
    const source = [
      `${registration};${personName};Técnico;${item};;2;06/10/2025`,
      `${scenario.worker.registration};${scenario.worker.name};;${item};;1;07/10/2025`,
    ].join("\n");
    await page.getByLabel("Unidade").selectOption(scenario.unit.id);
    await page.getByLabel("Contrato", { exact: true }).selectOption(scenario.warehouse.id);
    await page.getByLabel("Dados das entregas").fill(source);
    await page.getByRole("button", { name: "Gerar prévia" }).click();
    await expect(page.getByRole("row").filter({ hasText: personName })).toContainText("Cadastrar colaborador e registrar entrega.");
    expect(await db.employee.count({ where: { companyId: "tsa", registration } })).toBe(0);
    await page.getByRole("button", { name: "Confirmar importação" }).click();
    await expect(page.getByRole("status")).toContainText("Entregas importadas: 2. Colaboradores cadastrados: 1.");
    const records = await db.delivery.findMany({
      where: { actorId: admin.id, equipmentId: scenario.uniform.item.id },
      include: { employee: true, receipt: true, movements: true },
    });
    expect(records).toHaveLength(2);
    const created = records.find(({ employee }) => employee.registration === registration);
    expect(created).toMatchObject({ quantity: 2, lotId: null, warehouseId: null, movements: [],
      contractNumber: scenario.warehouse.contractNumber, receipt: { historical: true, verificationCode: null },
      employee: { name: personName, unitId: scenario.unit.id, contractId: scenario.warehouse.id } });
    await page.getByRole("button", { name: "Gerar prévia" }).click();
    await expect(page.getByText("Entrega idêntica já registrada ou repetida no arquivo.")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Confirmar importação" })).toHaveCount(0);
    await page.goto(`/tsa/manutencao?q=${registration}`);
    await expect(page.getByRole("region", { name: "Entregas" }).getByText(item)).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
