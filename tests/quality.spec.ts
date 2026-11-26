import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { plusDays, todayInBrazil } from "../lib/equipment";
import { seedScenario, testDb } from "./fixtures";

const db = testDb();
let scenario: Awaited<ReturnType<typeof seedScenario>>;

test.beforeAll(async () => {
  scenario = await seedScenario(db);
  await db.company.update({ where: { id: "tsa" }, data: { requestApprovalEnabled: true } });
});
test.afterAll(async () => { await db.$disconnect(); });

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/tsa$/);
}

async function signOut(page: Page) {
  await page.locator(".sidebar").getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("contrato sem saldo aparece e a entrega anterior preserva o saldo", async ({ page }) => {
  const companyId = "tsa";
  const name = `Contrato novo ${scenario.tag}`;
  await signIn(page, scenario.manager);
  await page.goto("/tsa/estoque?acao=contrato");
  await page.getByLabel("Número do contrato").fill(name);
  await page.getByLabel("Unidade").selectOption(scenario.unit.id);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/tsa\/estoque$/);
  const warehouseRow = page.getByRole("row").filter({ hasText: name });
  await expect(warehouseRow).toContainText("Aguardando primeira entrada");
  const warehouse = await db.warehouse.findFirstOrThrow({ where: { companyId, name } });
  await warehouseRow.getByRole("link", { name: "Registrar entrada" }).click();
  await expect(page.getByRole("combobox", { name: "Número do contrato", exact: true })).toHaveValue(warehouse.id);
  await page.getByRole("combobox", { name: "Item", exact: true }).selectOption(scenario.uniform.item.id);
  await page.getByLabel("Quantidade").fill("2");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/estoque\?entrada=1$/);
  await expect(page.getByText("Entrada registrada.")).toBeVisible();

  await page.goto(`/tsa/entregas?edit=ficha&colaborador=${scenario.worker.id}`);
  await expect(page.getByLabel("Colaborador")).toHaveValue(scenario.worker.id);
  await expect(page.getByRole("combobox", { name: "Número do contrato" })).toHaveCount(0);
  await page.getByRole("textbox", { name: /Número do contrato/ }).fill("CTR-HIST-001");
  await page.getByLabel("Item", { exact: true }).selectOption(scenario.uniform.item.id);
  await page.getByLabel("Quantidade").fill("4");
  await page.getByLabel("Data da entrega").fill("2025-10-07");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("Entrega anterior registrada.")).toBeVisible();
  await expect(page.getByLabel("Colaborador")).toHaveValue(scenario.worker.id);
  await expect(page.getByLabel("Data da entrega")).toHaveValue("2025-10-07");
  const recorded = await db.delivery.findFirstOrThrow({
    where: { companyId, employeeId: scenario.worker.id, warehouseId: null }, include: { movements: true, receipt: true },
  });
  expect(recorded).toMatchObject({
    lotId: null, quantity: 4, contractNumber: "CTR-HIST-001", movements: [],
    receipt: { historical: true, actorId: scenario.manager.id, verificationCode: null },
  });
  await page.goto("/tsa/entregas?recebimento=confirmado");
  await expect(page.getByRole("row").filter({ hasText: "CTR-HIST-001" })).toContainText("Aceito automaticamente");
  const csv = await (await page.request.get("/exportar/tsa")).text();
  expect(csv).toContain('"CTR-HIST-001"');
  expect(csv).toContain('"Aceito automaticamente"');
  const balance = await db.stock.findFirstOrThrow({ where: { companyId, warehouseId: warehouse.id } });
  expect(balance.quantity).toBe(2);

  await page.goto("/tsa/estoque");
  await db.warehouse.update({ where: { companyId_id: { companyId, id: scenario.warehouse.id } }, data: { contractNumber: null } });
  await page.reload();
  const priorContract = page.getByRole("row").filter({ hasText: scenario.warehouse.name }).filter({ hasText: "Informar número" });
  await priorContract.getByRole("link", { name: "Informar número" }).click();
  await page.getByLabel("Número do contrato").fill("CTR-OPER-001");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "CTR-OPER-001" }).first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "CTR-OPER-001" }).filter({ hasText: scenario.uniform.item.name })).toContainText("4");
  const linked = await db.warehouse.findUniqueOrThrow({ where: { companyId_id: { companyId, id: scenario.warehouse.id } } });
  expect(linked).toMatchObject({ name: scenario.warehouse.name, contractNumber: "CTR-OPER-001" });

  await signOut(page);
  await signIn(page, scenario.employeeAccount);
  await page.goto("/tsa/meus-epis");
  await expect(page.getByRole("region", { name: "Itens em uso" }).getByText("Aceito automaticamente")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmo que recebi" })).toHaveCount(0);
  expect((await page.request.get("/tsa/entregas?edit=ficha")).status()).toBe(404);
  await db.$transaction([
    db.deliveryReceipt.delete({ where: { companyId_deliveryId: { companyId, deliveryId: recorded.id } } }),
    db.delivery.delete({ where: { companyId_id: { companyId, id: recorded.id } } }),
  ]);
  await db.warehouse.update({ where: { companyId_id: { companyId, id: warehouse.id } }, data: { active: false } });
});

test("colaborador volta ao portal no mesmo navegador com uma sessão de sete dias", async ({ page, browser, baseURL }) => {
  await signIn(page, scenario.employeeAccount);
  const state = await page.context().storageState();
  const cookie = state.cookies.find(({ name }) => name === "epi-session");
  expect(cookie?.httpOnly).toBe(true);
  const remaining = cookie!.expires * 1000 - Date.now();
  expect(remaining).toBeGreaterThan(7 * 86_400_000 - 60_000);
  expect(remaining).toBeLessThanOrEqual(7 * 86_400_000);

  const returning = await browser.newContext({ baseURL, storageState: state });
  try {
    const nextPage = await returning.newPage();
    await nextPage.goto("/login");
    await expect(nextPage).toHaveURL(/\/tsa$/);
    await signOut(nextPage);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    await returning.close();
  }
});

test("uma entrega por item usa o saldo combinado do contrato", async ({ page }) => {
  const companyId = "tsa";
  const item = await db.equipment.create({ data: {
    companyId, name: `Uniforme com duas entradas ${scenario.tag}`, category: "UNIFORM", makerModel: "Teste", notes: "",
  } });
  const lots = await Promise.all(["A", "B"].map((code) => db.equipmentLot.create({
    data: { companyId, equipmentId: item.id, code },
  })));
  const warehouseId = scenario.warehouse.id;
  await db.stock.createMany({ data: lots.map(({ id }) => ({ companyId, warehouseId, lotId: id, quantity: 2 })) });
  await signIn(page, scenario.operator);
  await page.goto("/tsa/entregas?edit=novo");
  await page.getByLabel("Colaborador").selectOption(scenario.worker.id);
  await page.getByLabel("Número do contrato", { exact: true }).selectOption(warehouseId);
  await page.getByLabel("Item", { exact: true }).selectOption(item.id);
  await page.getByLabel("Quantidade").fill("3");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Entrega registrada e saldo atualizado.")).toBeVisible();
  const delivery = await db.delivery.findFirstOrThrow({ where: { companyId, equipmentId: item.id }, include: { movements: true } });
  expect(delivery.quantity).toBe(3);
  expect(delivery.movements.map(({ delta }) => delta).sort()).toEqual([-1, -2]);
  await db.deliveryReceipt.create({ data: { companyId, deliveryId: delivery.id, actorId: scenario.employeeAccount.id } });
});

test("gestor concede acesso de Gerência dentro das unidades autorizadas", async ({ page }) => {
  const companyId = "tsa";
  const person = await db.employee.create({ data: {
    companyId, unitId: scenario.unit.id, contractId: scenario.warehouse.id, registration: `LUK-${scenario.tag}`,
    name: `Técnica de segurança ${scenario.tag}`, contractorCompany: "LUK", department: "Segurança", jobTitle: "Técnica de segurança",
  } });
  const accessUrl = (id: string) => `/tsa/colaboradores?encarregado=${id}`;
  const openGrant = async (name: string) => {
    await page.goto("/tsa/colaboradores");
    const card = page.locator(".team-member").filter({ has: page.getByText(name, { exact: true }) });
    await card.locator(":scope > summary").click();
    await card.locator(".team-actions > summary").click();
    await card.getByRole("link", { name: "Dar acesso de Gerência" }).click();
  };

  await signIn(page, scenario.operator);
  expect((await page.request.get(accessUrl(person.id))).status()).toBe(404);
  await signOut(page);
  await signIn(page, scenario.manager);
  expect((await page.request.get(accessUrl(scenario.outside.id))).status()).toBe(404);
  expect((await page.request.get("/tsa/usuarios")).status()).toBe(404);

  await openGrant(person.name);
  await page.getByLabel("E-mail de acesso").fill(scenario.employeeAccount.email);
  await page.getByLabel("Senha temporária").fill("Inicial7");
  await page.getByRole("button", { name: "Dar acesso de Gerência" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Este e-mail já tem uma conta.");
  const email = `tecnica-luk-${scenario.tag}@example.test`;
  await page.getByLabel("E-mail de acesso").fill(email);
  await page.getByLabel("Senha temporária").fill("Inicial7");
  await page.getByRole("button", { name: "Dar acesso de Gerência" }).click();
  await expect(page.getByText("Acesso de Gerência ativo.")).toBeVisible();
  const created = await db.user.findUniqueOrThrow({ where: { email }, include: { scopes: true } });
  expect(created.mustChangePassword).toBe(true);
  expect(created.scopes).toMatchObject([{ companyId, employeeId: person.id, role: "SUPERVISOR", active: true, allUnits: false }]);

  const account = await db.user.create({
    data: { email: `promover-${scenario.tag}@example.test`, passwordHash: scenario.employeeAccount.passwordHash },
  });
  const existing = await db.employee.create({ data: {
    companyId, unitId: scenario.unit.id, contractId: scenario.warehouse.id, registration: `PROM-${scenario.tag}`,
    name: `Colaborador a promover ${scenario.tag}`, department: "Operação", jobTitle: "Técnico",
    scope: { create: { userId: account.id, name: "Acesso de teste", role: "EMPLOYEE", allUnits: false } },
  } });
  await openGrant(existing.name);
  await expect(page.getByLabel("Senha temporária")).toHaveCount(0);
  await page.getByRole("button", { name: "Dar acesso de Gerência" }).click();
  await expect(page.getByText("Acesso de Gerência ativo.")).toBeVisible();
  const promoted = await db.userScope.findUniqueOrThrow({
    where: { companyId_userId: { companyId, userId: account.id } }, include: { user: true },
  });
  expect(promoted).toMatchObject({ employeeId: existing.id, role: "SUPERVISOR", allUnits: false,
    user: { id: account.id, passwordHash: account.passwordHash, mustChangePassword: false } });

  const differentContract = await db.warehouse.create({ data: {
    companyId, unitId: scenario.unit.id, name: `Contrato separado ${scenario.tag}`, contractNumber: "CTR-SEPARADO",
  } });
  const differentPerson = await db.employee.create({ data: {
    companyId, unitId: scenario.unit.id, contractId: differentContract.id,
    name: `Pessoa de outro contrato ${scenario.tag}`, registration: `SEPARADO-${scenario.tag}`, jobTitle: "Planejamento",
  } });
  for (const responsible of [scenario.supervisor, { email: account.email, password: scenario.employeeAccount.password }]) {
    await signOut(page);
    await signIn(page, responsible);
    await page.goto("/tsa/colaboradores");
    await expect(page.locator(".team-member").filter({ hasText: scenario.worker.name })).toBeVisible();
    await expect(page.locator(".team-member").filter({ hasText: differentPerson.name })).toHaveCount(0);
    await page.goto("/tsa/estoque");
    await expect(page.getByText("CTR-SEPARADO", { exact: true })).toHaveCount(0);
  }
});

test("restringe histórico, exportação, comprovantes e pedidos à empresa e à unidade", async ({ page }) => {
  await signIn(page, scenario.manager);
  await page.goto("/tsa/entregas");
  await expect(page.getByRole("heading", { name: "Histórico", exact: true })).toBeVisible();
  await expect(page.getByText(scenario.hidden.item.name, { exact: true })).toHaveCount(0);
  const csv = await page.request.get("/exportar/tsa");
  expect(csv.ok()).toBe(true);
  expect(await csv.text()).not.toContain(scenario.hidden.item.name);
  expect((await page.request.get(`/exportar/tsa?unidade=${scenario.outsideUnit.id}`)).status()).toBe(400);
  expect((await page.request.get("/exportar/lynx")).status()).toBe(404);
  expect((await page.request.get("/lynx/relatorios")).status()).toBe(404);
  await page.goto("/tsa/relatorios");
  await page.getByLabel("Relatório", { exact: true }).selectOption("ficha");
  await expect(page.getByLabel("Colaborador").locator(`option[value="${scenario.outside.id}"]`)).toHaveCount(0);
  await page.goto(`/tsa/relatorios?tipo=ficha&colaborador=${scenario.outside.id}`);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("O colaborador não está disponível no seu escopo.");
  await expect(page.getByRole("button", { name: "Salvar em PDF" })).toHaveCount(0);
  expect((await page.request.get(`/comprovantes/tsa/${scenario.hiddenDelivery.id}`)).status()).toBe(404);

  await signOut(page);
  await signIn(page, scenario.supervisor);
  await expect(page.locator(".sidebar .account-info")).toContainText("Gerência");
  await page.getByRole("link", { name: /Pedidos aguardando sua decisão/ }).click();
  await expect(page).toHaveURL(/\/tsa\/solicitacoes\?status=PENDING_APPROVAL$/);
  await expect(page.getByRole("link", { name: "Meus pedidos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Da equipe" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(scenario.hidden.item.name, { exact: true })).toHaveCount(0);
  expect((await db.equipmentRequest.findUnique({ where: {
    companyId_id: { companyId: "tsa", id: scenario.outsideRequest.id },
  } }))?.status).toBe("PENDING_APPROVAL");
});

test("o servidor revalida a equipe quando uma aprovação já aberta é enviada", async ({ page }) => {
  const where = { companyId_id: { companyId: "tsa", id: scenario.worker.id } };
  const request = await db.equipmentRequest.create({
    data: {
      companyId: "tsa", id: randomUUID(), employeeId: scenario.worker.id, unitId: scenario.unit.id,
      equipmentId: scenario.scarce.item.id, quantity: 1, reason: "Pedido com escopo alterado", status: "PENDING_APPROVAL",
    },
  });
  await signIn(page, scenario.supervisor);
  await page.goto("/tsa/solicitacoes?status=PENDING_APPROVAL");
  const row = page.getByRole("article").filter({ hasText: request.reason });
  await row.getByText("Ver detalhes").click();
  try {
    await db.employee.update({ where, data: { contractId: null } });
    await row.getByRole("button", { name: "Aprovar", exact: true }).click();
    await expect(row.locator(".feedback.error")).toContainText("não está disponível");
    expect((await db.equipmentRequest.findUnique({
      where: { companyId_id: { companyId: "tsa", id: request.id } },
    }))?.status).toBe("PENDING_APPROVAL");
  } finally {
    await db.employee.update({ where, data: { contractId: scenario.warehouse.id } });
  }
});

test("perfil Gerência rejeita um pedido com justificativa e aprova outro para entrega", async ({ page }) => {
  await signIn(page, scenario.employeeAccount);
  for (const reason of ["Pedido para rejeição", "Pedido para entrega"]) {
    await page.goto("/tsa/minhas-solicitacoes?edit=novo");
    await page.getByLabel("Item", { exact: true }).selectOption(scenario.uniform.item.id);
    await page.getByLabel("Quantidade").fill("1");
    await page.getByLabel("Motivo").fill(reason);
    await page.getByRole("button", { name: "Enviar solicitação" }).click();
    await expect(page.getByRole("status")).toHaveText("Solicitação enviada.");
  }
  const requests = await db.equipmentRequest.findMany({
    where: { companyId: "tsa", employeeId: scenario.worker.id, equipmentId: scenario.uniform.item.id },
  });
  const rejected = requests.find(({ reason }) => reason === "Pedido para rejeição")!;
  const approved = requests.find(({ reason }) => reason === "Pedido para entrega")!;
  await signOut(page);
  await signIn(page, scenario.supervisor);
  await page.goto("/tsa/solicitacoes?status=PENDING_APPROVAL");
  for (const [id, reason, action] of [
    [rejected.id, rejected.reason, "Rejeitar"],
    [approved.id, approved.reason, "Aprovar"],
  ]) {
    const row = page.getByRole("article").filter({ hasText: reason });
    await row.getByText("Ver detalhes").click();
    if (action === "Rejeitar") await row.getByLabel("Justificativa").fill("Modelo solicitado será revisado pela equipe.");
    await row.getByRole("button", { name: action, exact: true }).click();
    await expect.poll(async () => (await db.equipmentRequest.findUnique({
      where: { companyId_id: { companyId: "tsa", id } },
    }))?.status).toBe(action === "Rejeitar" ? "REJECTED" : "WAITING_DELIVERY");
  }
  await signOut(page);
  await signIn(page, scenario.operator);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tsa/solicitacoes?fila=prontos");
  await page.getByRole("article").filter({ hasText: approved.reason }).getByRole("link", { name: "Atender pedido" }).click();
  await expect(page.getByLabel("Número do contrato", { exact: true })).toHaveValue(scenario.warehouse.id);
  await expect(page.locator(".delivery-summary")).toContainText(scenario.uniform.item.name);
  await page.getByRole("button", { name: "Confirmar entrega" }).click();
  await expect(page.getByRole("status")).toHaveText("Entrega registrada e saldo atualizado.");
  const delivery = await db.delivery.findUniqueOrThrow({
    where: { companyId_requestId: { companyId: "tsa", requestId: approved.id } }, include: { proof: true, receipt: true },
  });
  expect(delivery.proof).toBeNull();
  expect(delivery.receipt).toBeNull();
  await expect(page.getByRole("button", { name: "Confirmo que recebi" })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await signOut(page);
  await signIn(page, scenario.employeeAccount);
  await page.goto("/tsa/minhas-solicitacoes");
  const personalOrder = page.getByRole("article").filter({ hasText: approved.reason });
  await expect(personalOrder.locator('[aria-current="step"]')).toContainText("Entregue em");
  await personalOrder.getByRole("link", { name: "Ir para confirmação" }).click();
  await expect(page).toHaveURL(new RegExp(`#entrega-${delivery.id}$`));
  const awaitingReceipt = page.getByRole("region", { name: "Aguardando confirmação" });
  const inUse = page.getByRole("region", { name: "Itens em uso" });
  await expect(awaitingReceipt).toContainText(scenario.uniform.item.name);
  await expect(inUse).not.toContainText(scenario.uniform.item.name);
  if (process.env.EPI_RECEIPT_DEMO === "true") {
    await awaitingReceipt.getByRole("button", { name: "Confirmar recebimento" }).click();
    const dialog = page.getByRole("dialog", { name: "Ficha de EPI e Termo de Compromisso" });
    const sign = dialog.getByRole("button", { name: "Assinar e confirmar recebimento" });
    await expect(sign).toBeDisabled();
    await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    await awaitingReceipt.getByRole("button", { name: "Confirmar recebimento" }).click();
    await dialog.getByRole("checkbox").check();
    await sign.click();
    await expect(dialog).toBeHidden();
    await page.getByRole("link", { name: "Ver comprovante de aceite" }).first().click();
    await expect(page.getByRole("heading", { name: "Comprovante de aceite" })).toBeVisible();
    await expect(page.getByText("Termo de demonstração", { exact: true })).toBeVisible();
    await expect(page.getByText("Conta autenticada", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Voltar", exact: true }).click();
  } else {
    await awaitingReceipt.getByRole("button", { name: "Confirmo que recebi" }).click();
  }
  await expect(inUse).toContainText(scenario.uniform.item.name);
  await expect(inUse).toContainText("Confirmado em");
  await expect(awaitingReceipt).toHaveCount(0);
  const receipt = await db.deliveryReceipt.findUnique({
    where: { companyId_deliveryId: { companyId: "tsa", deliveryId: delivery.id } },
  });
  expect(receipt?.actorId).toBe(scenario.employeeAccount.id);
  await page.setViewportSize({ width: 320, height: 740 });
  const history = page.getByRole("region", { name: "Resultados" });
  await expect(history.getByRole("cell", { name: scenario.uniform.item.name })).toBeVisible();
  expect(await history.evaluate((element) => element.scrollWidth)).toBe(await history.evaluate((element) => element.clientWidth));
  await page.goto("/tsa/minhas-solicitacoes");
  await expect(personalOrder.locator('[aria-current="step"]')).toHaveText("Recebimento confirmado");
});

test("duas entregas simultâneas para a última unidade geram uma baixa", async ({ browser, page, baseURL }) => {
  await signIn(page, scenario.operator);
  const secondContext = await browser.newContext({ baseURL, storageState: await page.context().storageState() });
  try {
    const second = await secondContext.newPage();
    await Promise.all([page, second].map(async (entry) => {
      await entry.goto("/tsa/entregas?edit=novo");
      await entry.getByLabel("Colaborador", { exact: true }).selectOption(scenario.worker.id);
      await entry.getByLabel("Número do contrato", { exact: true }).selectOption(scenario.warehouse.id);
      await entry.getByLabel("Item", { exact: true }).selectOption(scenario.scarce.item.id);
      await expect(entry.getByLabel("Quantidade")).toHaveValue("1");
    }));
    await Promise.all([page, second].map((entry) => entry.getByRole("button", { name: "Salvar", exact: true }).click()));
    await expect.poll(async () => await Promise.all([page, second].map(async (entry) => (
      entry.url().endsWith("?registrada=1") || await entry.locator(".feedback.error").isVisible()
    )))).toEqual([true, true]);
    expect([page, second].filter((entry) => entry.url().endsWith("?registrada=1"))).toHaveLength(1);
    const key = { companyId: "tsa", warehouseId: scenario.warehouse.id, lotId: scenario.scarce.lot.id };
    const [stock, deliveries, deductions] = await Promise.all([
      db.stock.findUniqueOrThrow({ where: { companyId_warehouseId_lotId: key } }),
      db.delivery.count({ where: key }),
      db.stockMovement.count({ where: { ...key, delta: -1 } }),
    ]);
    expect([stock.quantity, deliveries, deductions]).toEqual([0, 1, 1]);
  } finally {
    await secondContext.close();
  }
});

test("o logout revoga a sessão e a resposta traz proteções de navegador", async ({ page, browser, baseURL }) => {
  const response = await page.goto("/login");
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  await signIn(page, scenario.manager);
  const state = await page.context().storageState();
  expect(state.cookies.find(({ name }) => name === "epi-session")?.httpOnly).toBe(true);
  await signOut(page);
  const old = await browser.newContext({ baseURL, storageState: state });
  try {
    expect((await old.request.get("/exportar/tsa")).status()).toBe(404);
  } finally {
    await old.close();
  }
});

test("login e resumo pessoal são navegáveis por teclado e em tela estreita", async ({ page }) => {
  const checkAccessibility = async () => {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))).toEqual([]);
  };
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("E-mail")).toBeFocused();
  await checkAccessibility();
  await signIn(page, scenario.employeeAccount);
  await page.keyboard.press("Tab");
  await page.getByRole("link", { name: "Ir para o conteúdo" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await expect(page.getByRole("heading", { name: "Meu resumo" })).toBeVisible();
  await checkAccessibility();
  await page.goto("/tsa/minhas-solicitacoes?edit=novo");
  await expect(page.getByRole("combobox", { name: "Item", exact: true })).toBeVisible();
  await checkAccessibility();
  await page.getByRole("searchbox", { name: "Buscar no catálogo" }).fill("zzzz sem correspondência");
  await expect(page.getByRole("combobox", { name: "Item", exact: true })).toHaveText("Nenhum item encontrado");
  await page.getByRole("button", { name: "Não encontrei o item" }).click();
  await expect(page.getByLabel("Qual item você precisa?")).toBeVisible();
});

test("colaborador retira item vencido de uso e justifica a troca sem apagar a entrega", async ({ page }) => {
  const companyId = "tsa";
  const today = todayInBrazil();
  const label = "Item vencido " + scenario.tag;
  const stockKey = await db.$transaction(async (tx) => {
    const item = await tx.equipment.create({ data: { companyId, name: label, category: "UNIFORM", makerModel: "Teste", notes: "" } });
    const lot = await tx.equipmentLot.create({ data: { companyId, equipmentId: item.id, code: scenario.tag, expiresAt: plusDays(today, -1) } });
    const key = { companyId, warehouseId: scenario.warehouse.id, lotId: lot.id };
    await tx.stock.create({ data: { ...key, quantity: 0 } });
    await tx.stockMovement.create({ data: { ...key, actorId: scenario.operator.id, delta: 2 } });
    for (const offset of [-4, -3]) {
      const delivery = await tx.delivery.create({ data: {
        ...key, id: randomUUID(), equipmentId: item.id, employeeId: scenario.worker.id, quantity: 1,
        deliveredAt: plusDays(today, offset), actorId: scenario.operator.id,
      } });
      await tx.deliveryReceipt.create({
        data: { companyId, deliveryId: delivery.id, actorId: scenario.employeeAccount.id },
      });
      await tx.stockMovement.create({ data: { ...key, actorId: scenario.operator.id, delta: -1, deliveryId: delivery.id } });
    }
    return key;
  });
  await signIn(page, scenario.employeeAccount);
  await page.goto("/tsa/meus-epis");
  const card = page.locator(".personal-equipment-card:not(.personal-retired-card)").filter({ hasText: label });
  await expect(card).toContainText("Vencido");
  await card.getByText("Mais opções", { exact: true }).click();
  await card.getByText("Retirar de uso", { exact: true }).click();
  await card.locator("select[name=retirementReason]").selectOption("EXPIRED");
  await card.getByLabel("Justificativa da retirada").fill("Validade conferida na etiqueta do lote.");
  await card.getByRole("button", { name: "Confirmar retirada" }).click();
  await expect(page.getByRole("status")).toContainText("Item retirado de uso");
  await expect(card).toHaveCount(0);
  const retiredCard = page.locator(".personal-retired-card").filter({ hasText: label });
  await retiredCard.getByText("Solicitar troca", { exact: true }).click();
  await retiredCard.getByLabel("Justificativa da troca").fill("Preciso repor o item retirado por vencimento.");
  await retiredCard.getByRole("button", { name: "Enviar pedido de troca" }).click();
  await expect(page.getByRole("status")).toHaveText("Solicitação enviada.");
  const replacement = await db.equipmentRequest.findFirstOrThrow({
    where: { companyId, employeeId: scenario.worker.id, reason: "Preciso repor o item retirado por vencimento." },
    include: { replacementFor: { include: { retirement: true } } },
  });
  expect(replacement.status).toBe("PENDING_APPROVAL");
  expect(replacement.replacementFor?.retirement?.actorId).toBe(scenario.employeeAccount.id);
  expect(replacement.replacementFor?.retirement?.reason).toBe("EXPIRED");
  expect(await db.delivery.count({ where: stockKey })).toBe(2);
  expect(await db.stockMovement.count({ where: stockKey })).toBe(3);
  await page.goto("/tsa/meus-epis");
  await expect(page.getByRole("link", { name: "Troca solicitada" })).toBeVisible();
});

test("troca aceita só foto e restringe a visualização ao solicitante e à equipe autorizada", async ({ page }) => {
  const companyId = "tsa";
  const source = await db.delivery.create({
    data: {
      companyId, id: randomUUID(), employeeId: scenario.worker.id, equipmentId: scenario.scarce.item.id,
      warehouseId: scenario.warehouse.id, lotId: scenario.scarce.lot.id, quantity: 1,
      deliveredAt: todayInBrazil(), actorId: scenario.operator.id,
      receipt: { create: { actorId: scenario.employeeAccount.id } },
    },
  });
  const photo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=", "base64");
  await signIn(page, scenario.employeeAccount);
  await page.goto("/tsa/meus-epis");
  const card = page.locator(".personal-equipment-card").filter({ hasText: scenario.scarce.item.name });
  await card.getByText("Solicitar troca", { exact: true }).click();
  const send = card.getByRole("button", { name: "Enviar pedido de troca" });
  const input = card.getByLabel("Foto da justificativa");
  await send.click();
  await expect(card.getByRole("alert")).toContainText("Escreva a justificativa ou anexe uma foto.");
  await input.setInputFiles({ name: "inválida.png", mimeType: "image/png", buffer: Buffer.from("arquivo inválido") });
  await send.click();
  await expect(card.getByRole("alert")).toContainText("Selecione uma foto JPG, PNG ou WebP válida");
  await input.setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: photo });
  await expect(card.getByRole("img", { name: "Prévia da foto selecionada" })).toBeVisible();
  await send.click();
  await expect(page.getByRole("status")).toHaveText("Solicitação enviada.");
  const replacement = await db.equipmentRequest.findFirstOrThrow({ where: { companyId, replacementForId: source.id } });
  expect(replacement.reason).toBe("");
  const url = `/fotos-de-troca/tsa/${replacement.id}`;
  const openPhoto = async () => {
    const request = page.getByRole("article").filter({ has: page.locator(`a[href="${url}"]`) });
    await request.getByText("Ver detalhes").click();
    await expect(request.getByRole("link", { name: "Ver foto em tamanho original" })).toHaveAttribute("href", url);
    const image = request.getByRole("img", { name: "Foto enviada como justificativa da troca" });
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  };
  await openPhoto();
  expect(await (await page.request.get(url)).body()).toEqual(photo);
  await signOut(page);
  expect((await page.request.get(url)).status()).toBe(404);
  await signIn(page, scenario.supervisor);
  await page.goto("/tsa/solicitacoes?status=PENDING_APPROVAL");
  await openPhoto();
  expect((await page.request.get(url)).headers()["content-disposition"]).toContain("inline");
  expect((await page.request.get(url.replace("/tsa/", "/lynx/"))).status()).toBe(404);
  const where = { companyId_id: { companyId, id: scenario.worker.id } };
  try {
    await db.employee.update({ where, data: { contractId: null } });
    expect((await page.request.get(url)).status()).toBe(404);
  } finally {
    await db.employee.update({ where, data: { contractId: scenario.warehouse.id } });
  }
});

test("pedidos vão direto para atendimento e os perfis operacionais veem o saldo da unidade", async ({ page }) => {
  test.setTimeout(60_000);
  const companyId = "tsa";
  await db.company.update({ where: { id: companyId }, data: { requestApprovalEnabled: false } });
  const expiredLot = await db.equipmentLot.create({ data: {
    companyId, equipmentId: scenario.uniform.item.id, code: `VENCIDO-${scenario.tag}`, expiresAt: plusDays(todayInBrazil(), -1),
  } });
  await db.stock.create({ data: { companyId, warehouseId: scenario.warehouse.id, lotId: expiredLot.id, quantity: 50 } });
  await signIn(page, scenario.employeeAccount);
  for (const [quantity, reason] of [["1", "Pedido com saldo"], ["8", "Pedido sem saldo suficiente"]]) {
    await page.goto("/tsa/minhas-solicitacoes?edit=novo");
    await page.getByLabel("Item", { exact: true }).selectOption(scenario.uniform.item.id);
    await page.getByLabel("Quantidade").fill(quantity);
    await page.getByLabel("Motivo").fill(reason);
    await page.getByRole("button", { name: "Enviar solicitação" }).click();
    await expect(page.getByRole("status")).toHaveText("Solicitação enviada.");
  }
  await page.goto("/tsa/minhas-solicitacoes?edit=novo");
  await page.getByRole("button", { name: "Não encontrei o item" }).click();
  await page.getByLabel("Qual item você precisa?").fill("Camiseta de reposição");
  await page.getByLabel("Quantidade").fill("1");
  await page.getByLabel("Motivo").fill("Pedido fora da lista");
  await page.getByRole("button", { name: "Enviar solicitação" }).click();
  await expect(page.getByRole("status")).toHaveText("Solicitação enviada.");
  await expect(page.getByRole("article").filter({ hasText: "Pedido sem saldo suficiente" })
    .locator('[aria-current="step"]')).toHaveText("Aguardando estoque");
  await signOut(page);
  for (const account of [scenario.manager, scenario.supervisor, scenario.operator]) {
    await signIn(page, account);
    await expect(page.getByRole("link", { name: /Pedidos aguardando sua decisão/ })).toHaveCount(0);
    const stockPriority = page.getByRole("region", { name: "Estoque baixo ou zerado" });
    await expect(stockPriority.getByText(/com saldo baixo/)).toBeVisible();
    await stockPriority.getByRole("link", { name: /itens com estoque baixo ou zerado/i }).click();
    await expect(page.getByRole("link", { name: /^Estoque baixo ou zerado/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("region", { name: "Alertas identificados" })).toContainText(scenario.uniform.item.name);
    await expect(page.getByText(scenario.hidden.item.name, { exact: true })).toHaveCount(0);
    await page.goto("/tsa/solicitacoes?status=WAITING_DELIVERY");
    await expect(page.getByRole("article").filter({ hasText: "Pedido com saldo" })).toContainText("Disponível em estoque");
    const shortage = page.getByRole("article").filter({ hasText: "Pedido sem saldo suficiente" });
    await expect(shortage).toContainText("Saldo insuficiente");
    await expect(shortage).toContainText("Verifique reposição ou compra");
    if (account !== scenario.operator) await signOut(page);
  }
  await page.goto("/tsa/alertas");
  const categories = page.getByRole("navigation", { name: "Categorias de alertas" });
  const alerts = page.getByRole("region", { name: "Alertas identificados" });
  await expect(alerts.getByRole("row").nth(1)).toContainText(/Estoque (baixo|zerado)/);
  await page.getByLabel("Unidade").selectOption(scenario.unit.id);
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(new RegExp(`unidade=${scenario.unit.id}`));
  await categories.getByRole("link", { name: /^Validade do produto/ }).click();
  await expect(alerts).toContainText("Vencido");
  await expect(alerts).not.toContainText("Estoque baixo");
  await expect(page.getByLabel("Unidade")).toHaveValue(scenario.unit.id);
  await categories.getByRole("link", { name: /^Saldo para pedidos/ }).click();
  const [warehouseId, lotId] = scenario.uniform.stockValue.split("|");
  const stock = await db.stock.findUniqueOrThrow({ where: { companyId_warehouseId_lotId: { companyId, warehouseId, lotId } } });
  const demand = alerts.getByRole("row").filter({ hasText: scenario.uniform.item.name });
  await expect(demand).toContainText(`9 pedidas · ${stock.quantity} disponíveis`);
  await expect(demand).toContainText(`Faltam ${9 - stock.quantity} un.`);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await demand.getByRole("link", { name: "Ver pedidos com falta de estoque" }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole("article").filter({ hasText: "Pedido com saldo" })).toHaveCount(0);
  await expect(page.getByRole("article").filter({ hasText: "Pedido sem saldo suficiente" })).toBeVisible();
  await page.goto("/tsa/solicitacoes?fila=identificar");
  const unknown = page.getByRole("article").filter({ hasText: "Camiseta de reposição" });
  await unknown.getByText("Ver detalhes").click();
  await unknown.getByLabel("Item correspondente").selectOption(scenario.uniform.item.id);
  await unknown.getByRole("button", { name: "Vincular ao catálogo" }).click();
  await expect(unknown).toHaveCount(0);
  const identified = await db.equipmentRequest.findFirstOrThrow({
    where: { companyId, employeeId: scenario.worker.id, reason: "Pedido fora da lista" },
  });
  expect(identified.status).toBe("WAITING_DELIVERY");
});

test("colaborador terceirizado pode liderar a equipe da unidade onde atua", async ({ page }) => {
  test.setTimeout(60_000);
  const companyId = "tsa";
  const name = `Gerência terceirizada ${scenario.tag}`;
  const registration = `EXT-${scenario.tag}`;
  const email = `gerencia-luk-${scenario.tag}@example.test`;
  const adminEmail = `admin-luk-${scenario.tag}@example.test`;
  const password = scenario.supervisor.password;
  const temporaryPassword = "Tmp-61";
  await db.user.create({ data: {
    email: adminEmail,
    passwordHash: scenario.supervisor.passwordHash,
    scopes: { create: { companyId, name: "Administrador de teste", role: "ADMIN", allUnits: true } },
  } });
  await signIn(page, { email: adminEmail, password });
  await page.goto("/tsa/itens-esperados");
  await page.locator('select[name="unit"]').selectOption(scenario.unit.id);
  await page.getByLabel("Função").fill("COLABORADOR");
  await page.locator('select[name="equipment"]').selectOption(scenario.hidden.item.id);
  await page.getByLabel("Quantidade").fill("2");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByRole("status")).toHaveText("Alterações salvas.");
  await db.warehouse.update({ where: { companyId_id: { companyId, id: scenario.warehouse.id } }, data: { contractNumber: "CTR-CADASTRO" } });
  await page.goto("/tsa/colaboradores?edit=novo");
  await page.getByLabel("Nome completo").fill(name);
  await page.getByLabel("Matrícula").fill(registration);
  await expect(page.getByLabel("Empresa", { exact: true })).toHaveAttribute("placeholder", "TSA");
  await page.getByLabel("Empresa", { exact: true }).fill("LUK");
  await page.locator('select[name="unit"]').selectOption(scenario.unit.id);
  await expect(page.getByLabel("Setor", { exact: true })).toHaveCount(0);
  await page.getByLabel("Contrato", { exact: true }).selectOption(scenario.warehouse.id);
  await page.getByLabel("Função").fill("Gerência");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/colaboradores$/);
  await page.goto("/tsa/colaboradores?q=luk");
  const contractor = page.getByRole("row").filter({ hasText: name });
  await expect(contractor.getByRole("cell", { name: "LUK", exact: true })).toBeVisible();
  const actions = contractor.getByRole("button", { name: `Ações de ${name}` });
  await expect(contractor.getByRole("link", { name: /Configurar acesso/ })).toBeHidden();
  await actions.press("Enter");
  await expect(contractor.getByRole("link", { name: /Configurar acesso/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(contractor.getByRole("link", { name: /Configurar acesso/ })).toBeHidden();
  await actions.click();
  await contractor.getByRole("link", { name: /Configurar acesso/ }).click();
  await expect(page.locator('select[name="employee"] option:checked')).toContainText("LUK");
  await page.getByLabel(/E-mail usado no login/).fill(email);
  await page.getByLabel(/Senha temporária/).fill(temporaryPassword);
  await page.getByLabel(/Perfil de trabalho/).selectOption("SUPERVISOR");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByRole("status")).toHaveText("Alterações salvas.");
  const worker = await db.employee.findFirstOrThrow({ where: { companyId, name, contractorCompany: "LUK" } });
  expect(worker.contractId).toBe(scenario.warehouse.id);
  await page.goto("/tsa/colaboradores");
  await expect(page.getByRole("row").filter({ hasText: name }).getByRole("cell", { name: "LUK", exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: name }).getByRole("cell", { name: "CTR-CADASTRO", exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: scenario.worker.name }).getByRole("cell", { name: "TSA", exact: true })).toBeVisible();
  const scope = await db.userScope.findFirstOrThrow({ where: { companyId, user: { email } } });
  expect(scope).toMatchObject({ role: "SUPERVISOR", employeeId: worker.id });

  await signOut(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(temporaryPassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/conta\/senha$/);
  const newPassword = "Nov-62";
  const firstSession = await page.context().storageState();
  await page.locator('input[name="currentPassword"]').fill(temporaryPassword);
  await page.locator('input[name="password"]').fill(newPassword);
  await page.locator('input[name="confirmation"]').fill(newPassword);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL(/\/tsa$/);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  const currentSession = await page.context().storageState();
  const sessionCookie = (state: typeof currentSession) => state.cookies.find(({ name }) => name === "epi-session")?.value;
  expect(sessionCookie(currentSession)).toBeTruthy();
  expect(sessionCookie(currentSession)).not.toBe(sessionCookie(firstSession));
  await page.context().addCookies(firstSession.cookies);
  expect((await page.request.get("/exportar/tsa")).status()).toBe(404);
  await page.context().addCookies(currentSession.cookies);
  await page.goto("/tsa/colaboradores");
  await expect(page.getByRole("heading", { name: "Minha equipe" })).toBeVisible();
  const member = page.locator(".team-member").filter({ hasText: scenario.worker.name });
  await member.locator(":scope > summary").click();
  await member.getByRole("tab", { name: "Itens esperados" }).click();
  await expect(member.locator(".team-details").getByText(scenario.hidden.item.name, { exact: true })).toBeVisible();
  await expect(member.locator(".team-details").getByText("Faltam 2 un.", { exact: true })).toBeVisible();
  await expect(page.getByText(scenario.outside.name, { exact: true })).toHaveCount(0);

  await page.locator(".sidebar").getByRole("link", { name: "Trocar senha" }).click();
  await page.locator('input[name="currentPassword"]').fill(newPassword);
  await page.locator('input[name="password"]').fill("Final-63");
  await page.locator('input[name="confirmation"]').fill("Final-63");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL(/\/tsa$/);
  expect((await page.request.get("/exportar/tsa")).ok()).toBe(true);
  await page.context().addCookies(currentSession.cookies);
  expect((await page.request.get("/exportar/tsa")).status()).toBe(404);
  await signIn(page, { email, password: "Final-63" });
});

test("o rótulo do menu recolhido aparece acima do banner ao usar mouse ou teclado", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page, scenario.manager);
  await page.getByRole("button", { name: "Recolher menu lateral" }).click();
  const link = page.locator('.sidebar a[href="/tsa/colaboradores"]');
  const label = link.locator(".nav-label");
  const aboveBanner = () => label.evaluate((element: HTMLElement) => {
    const labelBounds = element.getBoundingClientRect();
    const bannerBounds = document.querySelector(".hero")!.getBoundingClientRect();
    const left = Math.max(labelBounds.left, bannerBounds.left);
    const right = Math.min(labelBounds.right, bannerBounds.right);
    const top = Math.max(labelBounds.top, bannerBounds.top);
    const bottom = Math.min(labelBounds.bottom, bannerBounds.bottom);
    if (right <= left || bottom <= top) return false;
    element.style.pointerEvents = "auto";
    try {
      return document.elementFromPoint((left + right) / 2, (top + bottom) / 2) === element;
    } finally {
      element.style.removeProperty("pointer-events");
    }
  });
  await link.hover();
  await expect.poll(aboveBanner).toBe(true);
  await page.mouse.move(900, 700);
  await page.keyboard.press("Tab");
  await link.focus();
  await expect.poll(aboveBanner).toBe(true);
});

test("o gestor define um mínimo na unidade e o alerta usa o saldo elegível", async ({ page }) => {
  await signIn(page, scenario.manager);
  await page.goto("/tsa/estoque?acao=minimos");
  const units = page.locator('select[name="unit"]');
  await expect(units.locator(`option[value="${scenario.outsideUnit.id}"]`)).toHaveCount(0);
  await units.selectOption(scenario.unit.id);
  await page.locator('select[name="equipment"]').selectOption(scenario.hidden.item.id);
  await page.getByLabel(/Quantidade mínima/).fill("20");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByRole("status")).toHaveText("Alterações salvas.");
  await page.goto("/tsa/alertas?tipo=estoque");
  const alert = page.getByRole("region", { name: "Alertas identificados" })
    .getByRole("row").filter({ hasText: scenario.hidden.item.name });
  await expect(alert).toContainText("0 / 20 un.");
  await expect(alert).toContainText("Estoque zerado");
  await page.goto("/tsa/estoque?acao=minimos");
  await page.getByRole("button", { name: "Usar padrão" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: scenario.hidden.item.name })).toHaveCount(0);
  await page.goto("/tsa/alertas?tipo=estoque");
  await expect(alert).toHaveCount(0);
  await signOut(page);
  await signIn(page, scenario.operator);
  expect((await page.goto("/tsa/estoque?acao=minimos"))?.status()).toBe(404);
});

test("página pública interpreta GS1, compara fontes e salva um teste local", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route("**/api/teste-codigo-barras?*", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("gtin")).toBe("03017624010701");
    await route.fulfill({ json: { results: [
      { source: "food", status: "found", product: { name: "Produto de teste", brand: "Marca de teste" } },
      { source: "products", status: "missing" },
      { source: "upc", status: "unavailable", message: "Limite de consultas atingido." },
    ] } });
  });
  expect((await page.goto("/teste-codigo-barras"))?.status()).toBe(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.getByRole("button", { name: "Exemplo GS1 com lote e validade" }).click();
  await expect(page.getByLabel("Validade", { exact: true })).toHaveValue("2027-11-30");
  await expect(page.getByLabel("Lote", { exact: true })).toHaveValue("TESTE-01");
  await page.getByRole("button", { name: "Consultar fontes selecionadas" }).click();
  await expect(page.getByText("Produto não encontrado", { exact: true })).toBeVisible();
  await expect(page.getByText("Limite de consultas atingido.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Usar estes dados" }).click();
  await page.getByRole("button", { name: "Salvar teste no navegador" }).click();
  await page.reload();
  await expect(page.getByRole("region", { name: "Registros deste navegador" })).toContainText("Produto de teste");
  expect((await page.request.get("/api/teste-codigo-barras?gtin=12345678&source=food")).status()).toBe(400);
});

test("cadastra o item sem sair da entrega anterior ou da entrada de estoque", async ({ page }) => {
  const companyId = "tsa";
  await signIn(page, scenario.manager);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/tsa/entregas?edit=ficha&colaborador=${scenario.worker.id}`);
  await page.getByLabel("Data da entrega").fill("2025-10-07");
  await page.getByLabel("Quantidade").fill("2");
  await page.getByRole("button", { name: "Cadastrar novo item" }).click();
  await expect(page.getByLabel("Colaborador")).toHaveValue(scenario.worker.id);
  await expect(page.getByLabel("Quantidade")).toHaveValue("2");
  await expect(page.getByLabel("Data da entrega")).toHaveValue("2025-10-07");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  const epiName = `Óculos novos ${scenario.tag}`;
  await page.getByLabel("CA", { exact: true }).fill("12345");
  await page.getByLabel("Validade do CA").fill("2029-10-07");
  await page.getByLabel("Nome do item").fill(epiName);
  await page.getByLabel("Fabricante e modelo").fill("Fabricante de teste");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("Entrega anterior registrada.")).toBeVisible();
  const epi = await db.equipment.findFirstOrThrow({ where: { companyId, name: epiName.toLocaleUpperCase("pt-BR") },
    include: { deliveries: true, lots: true } });
  expect(epi).toMatchObject({ certificate: "12345", lots: [], deliveries: [{ employeeId: scenario.worker.id, quantity: 2, warehouseId: null }] });

  await page.getByRole("button", { name: "Escolher item existente" }).click();
  await page.getByRole("combobox", { name: "Item", exact: true }).selectOption(scenario.uniform.item.id);
  await expect(page.getByLabel("Data da entrega")).toHaveValue("2025-10-07");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect.poll(() => db.delivery.count({ where: {
    companyId, employeeId: scenario.worker.id, warehouseId: null, deliveredAt: new Date("2025-10-07"),
  } })).toBe(2);

  await page.goto(`/tsa/estoque?acao=entrada&almoxarifado=${scenario.warehouse.id}`);
  await page.getByRole("button", { name: "Cadastrar novo item" }).click();
  await expect(page.getByRole("combobox", { name: "Número do contrato", exact: true })).toHaveValue(scenario.warehouse.id);
  await page.getByRole("combobox", { name: "Tipo de item" }).selectOption("UNIFORM");
  await expect(page.getByLabel("CA", { exact: true })).toHaveCount(0);
  const uniformName = `Uniforme novo ${scenario.tag}`;
  await page.getByLabel("Nome do item").fill(uniformName);
  await page.getByLabel("Fabricante e modelo").fill("Modelo de teste");
  await page.getByLabel("Quantidade").fill("3");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByRole("status")).toHaveText("Entrada registrada.");
  const uniform = await db.equipment.findFirstOrThrow({ where: { companyId, name: uniformName.toLocaleUpperCase("pt-BR") },
    include: { lots: { include: { stocks: true } } } });
  expect(uniform).toMatchObject({ category: "UNIFORM", certificate: null, lots: [{ stocks: [{ warehouseId: scenario.warehouse.id, quantity: 3 }] }] });

  await page.getByRole("button", { name: "Escolher item existente" }).click();
  await page.getByRole("combobox", { name: "Item", exact: true }).selectOption(uniform.id);
  await page.getByLabel("Quantidade").fill("2");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  const key = { companyId, warehouseId: scenario.warehouse.id, lotId: uniform.lots[0].id };
  await expect.poll(async () => (await db.stock.findUniqueOrThrow({ where: { companyId_warehouseId_lotId: key } })).quantity).toBe(5);
});

test("administrador corrige e apaga entregas com auditoria e saldo consistente", async ({ page }) => {
  test.setTimeout(60_000);
  const companyId = "tsa";
  const email = `admin-historico-${scenario.tag}@example.test`;
  const admin = await db.user.create({ data: {
    email, passwordHash: scenario.manager.passwordHash,
    scopes: { create: { companyId, name: "Administrador de teste", role: "ADMIN", allUnits: true } },
  } });
  const original = await db.delivery.create({ data: {
    companyId, id: randomUUID(), employeeId: scenario.worker.id, equipmentId: scenario.uniform.item.id,
    actorId: admin.id, quantity: 2, deliveredAt: new Date("2025-10-06"),
  } });
  const originalWhere = { companyId_id: { companyId, id: original.id } };
  const historyRow = (item: string, employee: string) => page.getByRole("row").filter({ hasText: item }).filter({ hasText: employee });

  await signIn(page, scenario.manager);
  expect((await page.request.get(`/tsa/entregas?edit=${original.id}`)).status()).toBe(404);
  expect((await page.request.get(`/tsa/entregas?apagar=${original.id}`)).status()).toBe(404);
  await signOut(page);
  await signIn(page, { email, password: scenario.manager.password });
  await page.goto("/tsa/entregas");
  const paperRow = historyRow(scenario.uniform.item.name, scenario.worker.name).filter({ hasText: "06/10/2025" });
  const recordedAt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    .format(original.createdAt);
  await expect(page.getByRole("columnheader", { name: "Registrado em" })).toBeVisible();
  await expect(paperRow.getByRole("cell", { name: recordedAt, exact: true })).toBeVisible();
  const paperActions = paperRow.getByRole("button", { name: /^Ações de/ });
  await expect(paperRow.getByRole("link", { name: "Editar", exact: true })).toBeHidden();
  await paperActions.press("Enter");
  await expect(paperRow.getByRole("link", { name: "Apagar", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(paperRow.getByRole("link", { name: "Apagar", exact: true })).toBeHidden();
  await paperActions.click();
  await paperRow.getByRole("link", { name: "Editar", exact: true }).click();
  await page.getByRole("combobox", { name: "Colaborador" }).selectOption(scenario.outside.id);
  await page.getByRole("combobox", { name: "Item", exact: true }).selectOption(scenario.scarce.item.id);
  await page.getByLabel("Quantidade").fill("3");
  await page.getByLabel("Data da entrega").fill("2025-10-08");
  await page.getByLabel("Motivo da correção").fill("Corrigido após conferência do registro.");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Entrega atualizada.")).toBeVisible();
  expect(await db.delivery.findUniqueOrThrow({ where: originalWhere, include: { movements: true } })).toMatchObject({
    employeeId: scenario.outside.id, equipmentId: scenario.scarce.item.id, quantity: 3, movements: [],
  });
  const corrected = historyRow(scenario.scarce.item.name, scenario.outside.name);
  await expect(corrected.getByRole("cell", { name: recordedAt, exact: true })).toBeVisible();
  await corrected.getByRole("button", { name: /^Ações de/ }).click();
  await corrected.getByRole("link", { name: "Apagar", exact: true }).click();
  await page.getByLabel("Motivo da exclusão").fill("Registro duplicado.");
  await page.getByRole("button", { name: "Apagar entrega" }).click();
  await expect(page.getByText("Entrega removida do histórico.")).toBeVisible();
  await expect(corrected).toHaveCount(0);
  expect((await db.delivery.findUniqueOrThrow({ where: originalWhere })).voidedAt).toBeInstanceOf(Date);

  const item = await db.equipment.create({ data: {
    companyId, name: `Item corrigido ${scenario.tag}`, category: "UNIFORM", makerModel: "Teste", notes: "",
  } });
  const warehouseId = scenario.warehouse.id;
  const lot = await db.equipmentLot.create({ data: { companyId, equipmentId: item.id, code: "CORRECAO" } });
  const key = { companyId, warehouseId, lotId: lot.id };
  await db.stock.create({ data: { ...key, quantity: 8 } });
  const balance = async () => (await db.stock.findUniqueOrThrow({ where: { companyId_warehouseId_lotId: key } })).quantity;
  await page.goto("/tsa/entregas?edit=novo");
  await page.getByRole("combobox", { name: "Colaborador" }).selectOption(scenario.worker.id);
  await page.getByRole("combobox", { name: "Número do contrato" }).selectOption(warehouseId);
  await page.getByRole("combobox", { name: "Item", exact: true }).selectOption(item.id);
  await page.getByLabel("Quantidade").fill("3");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  const stocked = historyRow(item.name, scenario.worker.name);
  await expect(stocked).toBeVisible();
  expect(await balance()).toBe(5);
  const delivery = await db.delivery.findFirstOrThrow({ where: { companyId, equipmentId: item.id } });
  await db.deliveryReceipt.create({ data: { companyId, deliveryId: delivery.id, actorId: scenario.employeeAccount.id } });
  await stocked.getByRole("button", { name: /^Ações de/ }).click();
  await stocked.getByRole("link", { name: "Editar", exact: true }).click();
  await page.getByLabel("Quantidade").fill("2");
  await page.getByLabel("Motivo da correção").fill("A quantidade correta era duas unidades.");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("Entrega atualizada.")).toBeVisible();
  expect(await balance()).toBe(6);
  expect(await db.deliveryReceipt.count({ where: { companyId, deliveryId: delivery.id } })).toBe(0);
  await page.getByRole("link", { name: "Voltar ao Histórico" }).click();
  await stocked.getByRole("button", { name: /^Ações de/ }).click();
  await stocked.getByRole("link", { name: "Apagar", exact: true }).click();
  await page.getByLabel("Motivo da exclusão").fill("A entrega foi lançada em duplicidade.");
  await page.getByRole("button", { name: "Apagar entrega" }).click();
  await expect(page.getByText("Entrega removida do histórico.")).toBeVisible();
  await expect(stocked).toHaveCount(0);
  expect(await balance()).toBe(8);
  expect(await db.equipmentEvent.count({ where: {
    companyId, actorId: admin.id, subjectId: { in: [original.id, delivery.id] }, kind: { in: ["DELIVERY_EDITED", "DELIVERY_VOIDED"] },
  } })).toBe(4);

  const request = await db.equipmentRequest.create({ data: {
    companyId, id: randomUUID(), employeeId: scenario.worker.id, unitId: scenario.unit.id,
    equipmentId: item.id, quantity: 2, reason: "Pedido para conferir o estorno.", status: "WAITING_DELIVERY",
  } });
  await page.goto(`/tsa/entregas?solicitacao=${request.id}`);
  await page.getByRole("button", { name: "Confirmar entrega" }).click();
  await expect(stocked).toBeVisible();
  expect(await balance()).toBe(6);
  await stocked.getByRole("button", { name: /^Ações de/ }).click();
  await stocked.getByRole("link", { name: "Apagar", exact: true }).click();
  await page.getByLabel("Motivo da exclusão").fill("Atendimento lançado antes da entrega.");
  await page.getByRole("button", { name: "Apagar entrega" }).click();
  await expect(page.getByText("Entrega removida do histórico.")).toBeVisible();
  await expect(stocked).toHaveCount(0);
  const reopened = await db.equipmentRequest.findUniqueOrThrow({
    where: { companyId_id: { companyId, id: request.id } }, include: { delivery: true },
  });
  expect(reopened).toMatchObject({ status: "WAITING_DELIVERY", delivery: null });
  expect(await balance()).toBe(8);
});

test("filtra e ordena o Histórico dentro da unidade autorizada", async ({ page }) => {
  const companyId = "tsa";
  const item = await db.equipment.create({ data: {
    companyId, name: `Uniforme para filtro ${scenario.tag}`, category: "UNIFORM", makerModel: "Teste", notes: "",
  } });
  const dates = [
    { employeeId: scenario.worker.id, deliveredAt: new Date("2025-08-20"), createdAt: new Date("2025-11-01T12:00:00Z") },
    { employeeId: scenario.worker.id, deliveredAt: new Date("2025-08-10"), createdAt: new Date("2025-11-02T12:00:00Z") },
    { employeeId: scenario.outside.id, deliveredAt: new Date("2025-08-15"), createdAt: new Date("2025-11-03T12:00:00Z") },
  ];
  await db.delivery.createMany({ data: dates.map((row) => ({
    companyId, id: randomUUID(), equipmentId: item.id, actorId: scenario.manager.id, quantity: 1, ...row,
  })) });
  await signIn(page, scenario.manager);
  await page.goto("/tsa/entregas");
  const search = page.getByRole("form", { name: "Filtros do histórico" });
  const rows = page.getByRole("row").filter({ hasText: item.name });
  await search.getByRole("searchbox").fill(item.name.toUpperCase());
  await search.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/\?q=/);
  await expect(page.getByRole("row").filter({ has: page.getByRole("cell", { name: item.name, exact: true }) })).toHaveCount(2);
  await expect(rows.first()).toContainText("10/08/2025");
  const order = search.getByRole("combobox", { name: "Ordenar por" });
  await order.selectOption("entrega-recente");
  await search.getByRole("button", { name: "Aplicar" }).click();
  await expect(rows.first()).toContainText("20/08/2025");
  await search.getByLabel("Entrega de").fill("2025-08-11");
  await search.getByLabel("Entrega até").fill("2025-08-20");
  await search.getByRole("combobox", { name: "Recebimento" }).selectOption("anterior");
  await search.getByRole("button", { name: "Aplicar" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("20/08/2025");
  await search.getByRole("combobox", { name: "Recebimento" }).selectOption("confirmado");
  await search.getByRole("button", { name: "Aplicar" }).click();
  await expect(rows).toHaveCount(0);
  await search.getByRole("link", { name: "Limpar" }).click();
  await expect(page).toHaveURL(/\/entregas$/);
  await expect(rows).toHaveCount(2);
});

test("captura, revisa e salva uma foto como comprovante de entrega", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      const stream = canvas.captureStream(10);
      const refresh = window.setInterval(() => {
        if (!stream.active) { window.clearInterval(refresh); return; }
        context.fillStyle = "teal";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }, 50);
      return stream;
    };
  });
  await signIn(page, scenario.operator);
  await page.goto(`/tsa/entregas?edit=ficha&colaborador=${scenario.worker.id}`);
  await page.getByRole("combobox", { name: "Item", exact: true }).selectOption(scenario.uniform.item.id);
  await page.getByLabel("Data da entrega").fill("2025-07-15");
  await page.getByText("Comprovante (opcional)", { exact: true }).click();
  const takePhoto = page.getByRole("button", { name: "Tirar foto" });
  const capture = page.getByRole("button", { name: "Capturar foto" });
  const preview = page.getByRole("img", { name: "Prévia do comprovante" });
  await takePhoto.click();
  await capture.click();
  await expect(preview).toBeVisible();
  await page.getByRole("button", { name: "Remover foto" }).click();
  await expect(preview).toHaveCount(0);
  await takePhoto.click();
  await capture.click();
  await expect(preview).toBeVisible();
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("Entrega anterior registrada.")).toBeVisible();
  await expect(preview).toHaveCount(0);
  const delivery = await db.delivery.findFirstOrThrow({
    where: { companyId: "tsa", employeeId: scenario.worker.id, deliveredAt: new Date("2025-07-15") }, include: { proof: true },
  });
  expect(delivery.proof).toMatchObject({ mime: "image/jpeg", name: "comprovante.jpg" });
  expect((await page.request.get(`/comprovantes/tsa/${delivery.id}`)).status()).toBe(200);
});

test("troca registra a data de devolução e conserva o saldo do item recebido para descarte", async ({ page }) => {
  const companyId = "tsa";
  const warehouseId = scenario.warehouse.id;
  await db.warehouse.update({ where: { companyId_id: { companyId, id: warehouseId } }, data: { contractNumber: "CTR-FICHA-001" } });
  const originalItem = await db.equipment.create({ data: {
    companyId, name: `EPI antigo ${scenario.tag}`, category: "EPI", certificate: "33835", makerModel: "Teste", notes: "",
  } });
  const oldLot = await db.equipmentLot.create({ data: { companyId, equipmentId: originalItem.id, code: "ORIGINAL" } });
  const oldKey = { companyId, warehouseId, lotId: oldLot.id };
  await db.stock.create({ data: { ...oldKey, quantity: 3 } });
  const original = await db.delivery.create({ data: {
    ...oldKey, id: randomUUID(), employeeId: scenario.worker.id, actorId: scenario.operator.id,
    equipmentId: originalItem.id, quantity: 2, deliveredAt: new Date("2025-04-07"),
    receipt: { create: { actorId: scenario.employeeAccount.id } },
  } });
  const request = await db.equipmentRequest.create({ data: {
    companyId, id: randomUUID(), employeeId: scenario.worker.id, unitId: scenario.unit.id,
    equipmentId: scenario.uniform.item.id, quantity: 1, reason: "Substituição parcial.", status: "WAITING_DELIVERY",
    replacementForId: original.id,
  } });
  const balance = async () => (await db.stock.findUniqueOrThrow({ where: { companyId_warehouseId_lotId: oldKey } })).quantity;
  const handledRequest = async () => db.equipmentRequest.findUniqueOrThrow({
    where: { companyId_id: { companyId, id: request.id } }, include: { itemReturn: true },
  });
  await signIn(page, scenario.operator);
  await page.goto(`/tsa/entregas?solicitacao=${request.id}`);
  const returnedAt = page.getByLabel("Data da devolução");
  await expect(returnedAt).toHaveValue("");
  await expect(returnedAt).toHaveAttribute("required", "");
  await page.getByRole("button", { name: "Confirmar entrega" }).click();
  expect((await handledRequest()).status).toBe("WAITING_DELIVERY");
  await returnedAt.fill("2025-04-11");
  await page.getByRole("button", { name: "Confirmar entrega" }).click();
  await expect(page.getByText("Entrega registrada e saldo atualizado.")).toBeVisible();
  expect(await handledRequest()).toMatchObject({ status: "COMPLETED", itemReturn: {
    deliveryId: original.id, returnedAt: new Date("2025-04-11"), quantity: 1, actorId: scenario.operator.id,
  } });
  expect(await balance()).toBe(3);
  await expect(page.getByRole("row").filter({ hasText: originalItem.name })).toContainText("11/04/2025");
  await page.goto("/tsa/relatorios");
  const deliveries = page.getByRole("table", { name: "Entregas" });
  const delivery = deliveries.getByRole("row").filter({ hasText: originalItem.name });
  await expect(delivery.locator('[data-column="Colaborador"]')).toContainText(scenario.worker.registration, { ignoreCase: true });
  await expect(delivery.locator('[data-column="Data de devolução"]')).toHaveText("11/04/2025");
  await expect(deliveries.getByRole("columnheader", { name: "Almoxarifado" })).toHaveCount(0);
  const csv = await (await page.request.get("/exportar/tsa")).text();
  expect(csv).toContain('"Número do contrato";"Data de entrega";"Data de devolução"');
  expect(csv).toContain('"07/04/2025";"11/04/2025"');
  await page.getByLabel("Relatório", { exact: true }).selectOption("ficha");
  await page.getByLabel("Colaborador").selectOption(scenario.worker.id);
  await page.getByRole("button", { name: "Gerar ficha" }).click();
  const sheet = page.getByRole("region", { name: "Ficha individual de controle de EPIs" });
  await expect(sheet).toContainText(scenario.worker.registration, { ignoreCase: true });
  await expect(sheet.getByRole("row").filter({ hasText: originalItem.name }).locator('[data-column="Nº do CA"]')).toHaveText("33835");
  await expect(sheet.getByText("11/04/2025")).toBeVisible();
  await expect(sheet.getByText("CTR-FICHA-001", { exact: true }).first()).toBeVisible();
  await expect(sheet.locator('tbody [data-column^="Rubrica"]').first()).toBeEmpty();
  await expect(sheet.getByText("Setor")).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  await expect(sheet).toBeVisible();
  await expect(page.getByLabel("Relatório", { exact: true })).toBeHidden();
  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  await page.emulateMedia({ media: "screen" });
  await signOut(page);
  await signIn(page, scenario.employeeAccount);
  await page.goto("/tsa/meus-epis");
  const originalCard = page.getByRole("region", { name: "Itens em uso" }).getByRole("article").filter({ hasText: originalItem.name });
  await expect(originalCard.locator("dd").first()).toHaveText("1");
});

test("consulta a base importada e pede escolha para um CA com variantes", async ({ page }) => {
  const url = "/api/ca-catalogo?empresa=tsa&ca=13";
  expect((await page.request.get(url)).status()).toBe(401);
  await signIn(page, scenario.operator);
  const response = await page.request.get(url);
  expect(response.ok()).toBe(true);
  const { exportedOn, results } = await response.json();
  expect(results).toHaveLength(1);
  const [entry] = results;
  await page.goto("/tsa/epis?edit=novo");
  await page.getByLabel("CA", { exact: true }).fill("00013");
  await page.getByRole("button", { name: "Consultar CA" }).click();
  await expect(page.getByRole("status")).toContainText(exportedOn.split("-").reverse().join("/"));
  await expect(page.getByLabel("Nome do item")).toHaveValue(entry.name.toLocaleUpperCase("pt-BR"));
  await expect(page.getByLabel("Validade do CA")).toHaveValue(entry.expires);
  await page.getByLabel("CA", { exact: true }).fill("7536");
  await page.getByRole("button", { name: "Consultar CA" }).click();
  const options = page.getByRole("button", { name: "Usar estes dados" });
  await expect(options).toHaveCount(2);
  await expect(page.getByLabel("Validade do CA")).toHaveValue("");
  await options.first().click();
  await expect(page.getByLabel("Validade do CA")).not.toHaveValue("");
  expect((await page.request.get("/api/ca-catalogo?empresa=lynx&ca=13")).status()).toBe(403);
});

test("Equipe filtra pendências e diferencia validades e configuração de itens esperados", async ({ page }) => {
  const companyId = "tsa";
  const unit = await db.unit.create({ data: { companyId, name: `Unidade sem regras ${scenario.tag}` } });
  const email = `painel-equipe-${scenario.tag}@example.test`;
  await db.user.create({ data: { email, passwordHash: scenario.manager.passwordHash, scopes: { create: {
    companyId, name: "Gestor do painel de teste", role: "MANAGER", allUnits: false,
    units: { create: [{ unitId: scenario.unit.id }, { unitId: unit.id }] },
  } } } });
  const teamContract = await db.warehouse.create({ data: {
    companyId, unitId: scenario.unit.id, name: `Contrato da equipe ${scenario.tag}`, contractNumber: "CTR-EQUIPE",
  } });
  const person = await db.employee.create({ data: {
    companyId, unitId: scenario.unit.id,
    name: `Pessoa com recebimento ${scenario.tag}`, registration: `F-${scenario.tag}`,
    contractId: teamContract.id, jobTitle: "Função sem regra aplicável",
  } });
  const other = await db.employee.create({ data: {
    companyId, unitId: unit.id, name: `Pessoa sem configuração ${scenario.tag}`,
    registration: `N-${scenario.tag}`, department: "Operação", jobTitle: "Técnica",
  } });
  await db.expectedItem.upsert({
    where: { companyId_id: { companyId, id: `painel-${scenario.tag}` } },
    create: { companyId, id: `painel-${scenario.tag}`, unitId: person.unitId, jobTitle: "OUTRA FUNÇÃO",
      equipmentId: scenario.uniform.item.id, quantity: 1 }, update: {},
  });
  const item = await db.equipment.create({ data: {
    companyId, name: `Protetor de teste ${scenario.tag}`, makerModel: "Modelo de teste", notes: "",
    category: "EPI", certificate: "12345", caExpiresAt: new Date("2030-01-01"),
  } });
  const lot = await db.equipmentLot.create({ data: { companyId, equipmentId: item.id, code: "EQUIPE", expiresAt: new Date("2025-02-25") } });
  const balance = { companyId, warehouseId: scenario.warehouse.id, lotId: lot.id };
  await db.stock.create({ data: balance });
  await db.delivery.createMany({ data: ["2025-02-20", "2025-02-21"].map((date) => ({
    ...balance, id: randomUUID(), employeeId: person.id, equipmentId: item.id, actorId: scenario.operator.id, quantity: 1, deliveredAt: new Date(date),
  })) });
  await db.equipmentRequest.create({ data: {
    companyId, id: randomUUID(), employeeId: person.id, unitId: person.unitId, equipmentId: item.id,
    quantity: 1, reason: "Pedido para teste de equipe.", status: "WAITING_DELIVERY",
  } });

  await signIn(page, { email, password: scenario.manager.password });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tsa/colaboradores");
  const filters = page.getByRole("form", { name: "Filtros da equipe" });
  await expect(page.locator(".team-member[open]")).toHaveCount(0);
  await expect(filters.getByRole("combobox", { name: "Unidade" })).toHaveCount(0);
  await filters.locator(".team-extra-filters > summary").click();
  await expect(filters.getByRole("combobox", { name: "Unidade" }).locator(`option[value="${scenario.outsideUnit.id}"]`)).toHaveCount(0);
  await filters.getByRole("combobox", { name: "Unidade" }).selectOption(person.unitId);
  await filters.getByRole("combobox", { name: "Contrato", exact: true }).selectOption(teamContract.id);
  await filters.getByRole("combobox", { name: "Pendências" }).selectOption("confirmacao");
  await filters.getByRole("button", { name: "Filtrar" }).click();
  const card = page.locator(".team-member");
  await expect(card).toHaveCount(1);
  await expect(card.locator(":scope > summary")).toContainText(person.registration);
  await expect(card.locator(":scope > summary")).toContainText(person.jobTitle);
  await expect(page.getByRole("region", { name: "Resumo da equipe" })).toContainText("Recebimentos pendentes");
  await card.locator(":scope > summary").click();
  const waiting = card.getByRole("tab", { name: "A confirmar" });
  await expect(waiting).toHaveAttribute("aria-selected", "true");
  const table = card.getByRole("table", { name: "Recebimentos a confirmar" });
  await expect(table.getByRole("columnheader", { name: "Validade do equipamento" })).toHaveCount(1);
  await expect(table.getByRole("columnheader", { name: "Validade do CA" })).toHaveCount(1);
  await expect(table).toContainText("25/02/2025");
  await expect(table).toContainText("01/01/2030");
  await expect(table).toContainText("Vencida");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await waiting.focus();
  await page.keyboard.press("End");
  await expect(card.getByRole("tabpanel", { name: "Itens esperados" })).toContainText("Nenhum item esperado para esta função pelas regras cadastradas.");
  await card.getByRole("tab", { name: "Pedidos em aberto" }).click();
  await expect(card.getByRole("tabpanel", { name: "Pedidos em aberto" })).toContainText(item.name);
  const results = await new AxeBuilder({ page }).include(".team-member").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);

  await page.goto("/tsa/colaboradores?pendencia=sem-configuracao");
  await expect(card).toHaveCount(1);
  await expect(card.locator(":scope > summary")).toContainText(other.name);
  await card.locator(":scope > summary").click();
  await expect(card.getByRole("tabpanel", { name: "Itens esperados" })).toContainText("Itens esperados ainda não configurados para esta unidade.");
  await expect(card.getByLabel(`Ações de ${other.name}`)).toHaveText("⋯");

  await page.goto("/tsa/epis");
  const itemRow = page.getByRole("row").filter({ hasText: item.name });
  await expect(itemRow.getByRole("cell", { name: "12345", exact: true })).toHaveCSS("white-space", "nowrap");
  await expect(itemRow.getByRole("cell", { name: "01/01/2030", exact: true })).toHaveCSS("white-space", "nowrap");
  const uniformRow = page.getByRole("row").filter({ hasText: scenario.uniform.item.name });
  await expect(uniformRow.getByRole("cell", { name: "Uniforme", exact: true })).toHaveCSS("white-space", "nowrap");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});
