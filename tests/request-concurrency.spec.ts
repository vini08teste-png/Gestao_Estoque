import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { seedScenario, testDb } from "./fixtures";

test("dois responsáveis só conseguem atender o mesmo pedido uma vez", async ({ page, browser, baseURL }) => {
  const db = testDb();
  const second = await browser.newContext({ baseURL });
  try {
    const scenario = await seedScenario(db);
    const companyId = "tsa";
    const request = await db.equipmentRequest.create({ data: {
      companyId, id: randomUUID(), employeeId: scenario.worker.id, unitId: scenario.unit.id,
      equipmentId: scenario.uniform.item.id, quantity: 1, reason: "Pedido de teste simultâneo", status: "WAITING_DELIVERY",
    } });
    const other = await second.newPage();
    const open = async (tab: Page, account: { email: string; password: string }) => {
      await tab.goto("/login");
      await tab.getByLabel("E-mail").fill(account.email);
      await tab.getByLabel("Senha", { exact: true }).fill(account.password);
      await tab.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(tab).toHaveURL(/\/tsa$/);
      await tab.goto(`/tsa/entregas?solicitacao=${request.id}`);
      await expect(tab.getByRole("button", { name: "Confirmar entrega" })).toBeVisible();
    };
    await Promise.all([open(page, scenario.manager), open(other, scenario.supervisor)]);
    await Promise.all([page, other].map((tab) => tab.getByRole("button", { name: "Confirmar entrega" }).click()));
    await Promise.all([page, other].map((tab) => expect(tab.getByRole("status")).toContainText(/já foi atendido|Entrega registrada/)));
    const stale = page.url().includes("solicitacao=") ? page : other;
    await expect(stale.getByRole("status")).toContainText("Este pedido já foi atendido.");
    await stale.getByRole("link", { name: "Ver entrega registrada" }).click();
    await expect(stale.getByRole("row").filter({ hasText: scenario.uniform.item.name })).toHaveCount(1);
    const recorded = await db.equipmentRequest.findUniqueOrThrow({
      where: { companyId_id: { companyId, id: request.id } }, include: { delivery: { include: { movements: true } } },
    });
    expect(recorded.status).toBe("COMPLETED");
    expect(recorded.delivery?.movements.map(({ delta }) => delta)).toEqual([-1]);
    const stock = await db.stock.findUniqueOrThrow({ where: { companyId_warehouseId_lotId: {
      companyId, warehouseId: scenario.warehouse.id, lotId: scenario.uniform.lot.id,
    } } });
    expect(stock.quantity).toBe(3);
    await stale.goto("/tsa/solicitacoes?status=COMPLETED");
    const card = stale.getByRole("article").filter({ hasText: scenario.uniform.item.name });
    await expect(card.getByRole("link", { name: "Ver entrega" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Atender pedido" })).toHaveCount(0);
  } finally {
    await second.close();
    await db.$disconnect();
  }
});
