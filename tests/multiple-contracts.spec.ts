import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { hashPassword } from "../lib/password";
import { seedScenario, testDb } from "./fixtures";

test("colaborador escolhe outro contrato e seu pedido só fica visível à Gerência autorizada", async ({ page, browser, baseURL }) => {
  test.setTimeout(60_000);
  const db = testDb();
  const second = await browser.newContext({ baseURL });
  try {
    const scenario = await seedScenario(db);
    const companyId = "tsa";
    await db.company.update({ where: { id: companyId }, data: { requestApprovalEnabled: false } });
    const otherWarehouse = await db.warehouse.findFirstOrThrow({ where: { companyId, unitId: scenario.outsideUnit.id } });
    const secret = `Teste-contratos-${randomUUID()}`;
    const admin = await db.user.create({ data: {
      email: `contratos-${randomUUID()}@example.test`, passwordHash: await hashPassword(secret),
      scopes: { create: { companyId, name: "Admin de contratos", role: "ADMIN", allUnits: true } },
    } });
    const login = async (tab: Page, email: string, password: string) => {
      await tab.goto("/login");
      await tab.getByLabel("E-mail").fill(email);
      await tab.getByLabel("Senha", { exact: true }).fill(password);
      await tab.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(tab).toHaveURL(/\/tsa$/);
    };
    await login(page, admin.email, secret);
    await page.goto(`/tsa/colaboradores?edit=${scenario.worker.id}`);
    await page.getByRole("checkbox", { name: `${otherWarehouse.contractNumber} · ${scenario.outsideUnit.name}`, exact: true }).check();
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page).toHaveURL(/\/colaboradores$/);
    const member = page.getByRole("row").filter({ hasText: scenario.worker.name });
    await expect(member).toContainText(otherWarehouse.contractNumber!);
    await expect(member).toContainText(scenario.warehouse.contractNumber!);

    const worker = await second.newPage();
    await login(worker, scenario.employeeAccount.email, scenario.employeeAccount.password);
    await worker.goto("/tsa/minhas-solicitacoes?edit=novo");
    await expect(worker.getByLabel("Contrato")).toHaveValue("");
    await worker.getByLabel("Contrato").selectOption(otherWarehouse.id);
    await worker.getByLabel("Item", { exact: true }).selectOption(scenario.hidden.item.id);
    await worker.getByLabel("Quantidade").fill("1");
    const reason = `Pedido no contrato alternativo ${scenario.tag}`;
    await worker.getByLabel("Motivo").fill(reason);
    await worker.getByRole("button", { name: "Enviar solicitação" }).click();
    await expect(worker.getByText("Solicitação enviada.")).toBeVisible();
    const request = await db.equipmentRequest.findFirstOrThrow({ where: { companyId, reason } });
    expect(request).toMatchObject({ employeeId: scenario.worker.id, unitId: scenario.outsideUnit.id,
      contractId: otherWarehouse.id, status: "WAITING_DELIVERY" });

    await page.locator(".sidebar").getByRole("button", { name: "Sair" }).click();
    await login(page, scenario.supervisor.email, scenario.supervisor.password);
    await page.goto("/tsa/colaboradores");
    await expect(page.getByText(scenario.worker.name, { exact: true })).toBeVisible();
    expect((await page.request.get(`/tsa/entregas?solicitacao=${request.id}`)).status()).toBe(404);
    await page.locator(".sidebar").getByRole("button", { name: "Sair" }).click();
    await login(page, admin.email, secret);
    await page.goto(`/tsa/entregas?solicitacao=${request.id}`);
    await expect(page.getByLabel("Número do contrato")).toHaveValue(otherWarehouse.id);
    await page.getByRole("button", { name: "Confirmar entrega" }).click();
    await expect(page.getByText("Entrega registrada e saldo atualizado.")).toBeVisible();
    const result = await db.equipmentRequest.findUniqueOrThrow({
      where: { companyId_id: { companyId, id: request.id } }, include: { delivery: true },
    });
    expect(result.delivery?.warehouseId).toBe(otherWarehouse.id);
    await worker.goto("/tsa/meus-epis");
    await expect(worker.getByRole("article").filter({ hasText: scenario.hidden.item.name })).toContainText(otherWarehouse.contractNumber!);

    const pending = await db.equipmentRequest.create({ data: {
      companyId, id: randomUUID(), employeeId: scenario.worker.id, unitId: scenario.unit.id,
      contractId: scenario.warehouse.id, equipmentId: scenario.hidden.item.id, quantity: 1,
      reason: "Teste de encaminhamento entre contratos", status: "WAITING_DELIVERY",
    } });
    await page.goto("/tsa/solicitacoes?fila=falta-estoque");
    const card = page.getByRole("article").filter({ hasText: pending.reason });
    await card.getByText("Ver detalhes").click();
    await card.getByLabel("Contrato de destino").selectOption(otherWarehouse.id);
    await card.getByRole("button", { name: "Encaminhar pedido" }).click();
    await expect.poll(async () => (await db.equipmentRequest.findUnique({
      where: { companyId_id: { companyId, id: pending.id } },
    }))?.contractId).toBe(otherWarehouse.id);
  } finally {
    await second.close();
    await db.$disconnect();
  }
});
