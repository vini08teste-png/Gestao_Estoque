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

test("almoxarifado sem saldo aparece e a entrega anterior preserva o saldo", async ({ page }) => {
  const companyId = "tsa";
  const name = `Almoxarifado novo ${scenario.tag}`;
  await signIn(page, scenario.manager);
  await page.goto("/tsa/estoque?acao=almoxarifado");
  await page.getByLabel("Nome do almoxarifado").fill(name);
  await page.getByLabel("Unidade").selectOption(scenario.unit.id);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/tsa\/estoque$/);
  const warehouseRow = page.getByRole("row").filter({ hasText: name });
  await expect(warehouseRow).toContainText("Aguardando primeira entrada");
  const warehouse = await db.warehouse.findFirstOrThrow({ where: { companyId, name } });
  await warehouseRow.getByRole("link", { name: "Registrar entrada" }).click();
  await expect(page.getByRole("combobox", { name: "Almoxarifado", exact: true })).toHaveValue(warehouse.id);
  await page.getByRole("combobox", { name: "Item", exact: true }).selectOption(scenario.uniform.item.id);
  await page.getByLabel("Quantidade").fill("2");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/estoque\?entrada=1$/);
  await expect(page.getByText("Entrada registrada.")).toBeVisible();

  await page.goto(`/tsa/entregas?edit=ficha&colaborador=${scenario.worker.id}`);
  await expect(page.getByLabel("Colaborador")).toHaveValue(scenario.worker.id);
  await expect(page.getByLabel("Almoxarifado")).toHaveCount(0);
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
  expect(recorded).toMatchObject({ lotId: null, quantity: 4, movements: [], receipt: null });
  const balance = await db.stock.findFirstOrThrow({ where: { companyId, warehouseId: warehouse.id } });
  expect(balance.quantity).toBe(2);

  await signOut(page);
  await signIn(page, scenario.employeeAccount);
  await page.goto("/tsa/meus-epis");
  await expect(page.getByRole("region", { name: "Itens em uso" }).getByText(scenario.uniform.item.name)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmo que recebi" })).toHaveCount(0);
  expect((await page.request.get("/tsa/entregas?edit=ficha")).status()).toBe(404);
  await db.delivery.delete({ where: { companyId_id: { companyId, id: recorded.id } } });
  await db.warehouse.update({ where: { companyId_id: { companyId, id: warehouse.id } }, data: { active: false } });
});

test("uma entrega por item usa o saldo combinado do almoxarifado", async ({ page }) => {
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
  await page.getByLabel("Almoxarifado", { exact: true }).selectOption(warehouseId);
  await page.getByLabel("Item", { exact: true }).selectOption(item.id);
  await page.getByLabel("Quantidade").fill("3");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Entrega registrada e saldo atualizado.")).toBeVisible();
  const delivery = await db.delivery.findFirstOrThrow({ where: { companyId, equipmentId: item.id }, include: { movements: true } });
  expect(delivery.quantity).toBe(3);
  expect(delivery.movements.map(({ delta }) => delta).sort()).toEqual([-1, -2]);
  await db.deliveryReceipt.create({ data: { companyId, deliveryId: delivery.id, actorId: scenario.employeeAccount.id } });
});

test("gestor concede acesso de encarregado dentro das unidades autorizadas", async ({ page }) => {
  const companyId = "tsa";
  const person = await db.employee.create({ data: {
    companyId, unitId: scenario.unit.id, registration: `LUK-${scenario.tag}`,
    name: `Técnica de segurança ${scenario.tag}`, contractorCompany: "LUK", department: "Segurança", jobTitle: "Técnica de segurança",
  } });
  const accessUrl = (id: string) => `/tsa/colaboradores?encarregado=${id}`;
  const openGrant = async (name: string) => {
    await page.goto("/tsa/colaboradores");
    const card = page.locator(".team-member").filter({ has: page.getByText(name, { exact: true }) });
    await card.locator("summary").click();
    await card.getByRole("link", { name: "Dar acesso de encarregado" }).click();
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
  await page.getByRole("button", { name: "Dar acesso de encarregado" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Este e-mail já tem uma conta.");
  const email = `tecnica-luk-${scenario.tag}@example.test`;
  await page.getByLabel("E-mail de acesso").fill(email);
  await page.getByLabel("Senha temporária").fill("Inicial7");
  await page.getByRole("button", { name: "Dar acesso de encarregado" }).click();
  await expect(page.getByText("Acesso de encarregado ativo.")).toBeVisible();
  const created = await db.user.findUniqueOrThrow({ where: { email }, include: { scopes: true } });
  expect(created.mustChangePassword).toBe(true);
  expect(created.scopes).toMatchObject([{ companyId, employeeId: person.id, role: "SUPERVISOR", active: true, allUnits: false }]);

  const account = await db.user.create({
    data: { email: `promover-${scenario.tag}@example.test`, passwordHash: scenario.employeeAccount.passwordHash },
  });
  const existing = await db.employee.create({ data: {
    companyId, unitId: scenario.unit.id, registration: `PROM-${scenario.tag}`,
    name: `Colaborador a promover ${scenario.tag}`, department: "Operação", jobTitle: "Técnico",
    scope: { create: { userId: account.id, name: "Acesso de teste", role: "EMPLOYEE", allUnits: false } },
  } });
  await openGrant(existing.name);
  await expect(page.getByLabel("Senha temporária")).toHaveCount(0);
  await page.getByRole("button", { name: "Dar acesso de encarregado" }).click();
  await expect(page.getByText("Acesso de encarregado ativo.")).toBeVisible();
  const promoted = await db.userScope.findUniqueOrThrow({
    where: { companyId_userId: { companyId, userId: account.id } }, include: { user: true },
  });
  expect(promoted).toMatchObject({ employeeId: existing.id, role: "SUPERVISOR", allUnits: false,
    user: { id: account.id, passwordHash: account.passwordHash, mustChangePassword: false } });
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
  expect((await page.request.get(`/comprovantes/tsa/${scenario.hiddenDelivery.id}`)).status()).toBe(404);

  await signOut(page);
  await signIn(page, scenario.supervisor);
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
    await db.employee.update({ where, data: { supervisorId: null } });
    await row.getByRole("button", { name: "Aprovar", exact: true }).click();
    await expect(row.locator(".feedback.error")).toContainText("não está disponível");
    expect((await db.equipmentRequest.findUnique({
      where: { companyId_id: { companyId: "tsa", id: request.id } },
    }))?.status).toBe("PENDING_APPROVAL");
  } finally {
    await db.employee.update({ where, data: { supervisorId: scenario.worker.supervisorId } });
  }
});

test("encarregado rejeita um pedido com justificativa e aprova outro para entrega", async ({ page }) => {
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
  await expect(page.getByLabel("Almoxarifado", { exact: true })).toHaveValue(scenario.warehouse.id);
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
  await awaitingReceipt.getByRole("button", { name: "Confirmo que recebi" }).click();
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
      await entry.getByLabel("Almoxarifado", { exact: true }).selectOption(scenario.warehouse.id);
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
    await db.employee.update({ where, data: { supervisorId: null } });
    expect((await page.request.get(url)).status()).toBe(404);
  } finally {
    await db.employee.update({ where, data: { supervisorId: scenario.worker.supervisorId } });
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
    await page.getByRole("link", { name: /Itens com estoque baixo ou zerado/ }).click();
    await expect(page.getByRole("heading", { name: "Alertas de estoque" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Estoque baixo ou zerado" })).toContainText(scenario.uniform.item.name);
    await expect(page.getByText(scenario.hidden.item.name, { exact: true })).toHaveCount(0);
    await page.goto("/tsa/solicitacoes?status=WAITING_DELIVERY");
    await expect(page.getByRole("article").filter({ hasText: "Pedido com saldo" })).toContainText("Disponível em estoque");
    const shortage = page.getByRole("article").filter({ hasText: "Pedido sem saldo suficiente" });
    await expect(shortage).toContainText("Saldo insuficiente");
    await expect(shortage).toContainText("Verifique reposição ou compra");
    if (account !== scenario.operator) await signOut(page);
  }
  await page.goto("/tsa/alertas?tipo=demanda");
  const [warehouseId, lotId] = scenario.uniform.stockValue.split("|");
  const stock = await db.stock.findUniqueOrThrow({ where: { companyId_warehouseId_lotId: { companyId, warehouseId, lotId } } });
  const demand = page.getByRole("region", { name: "Saldo para pedidos em aberto" }).getByRole("listitem")
    .filter({ hasText: scenario.uniform.item.name });
  await expect(demand).toContainText(`9 pedidas · ${stock.quantity} disponíveis`);
  await expect(demand).toContainText(`Faltam ${9 - stock.quantity} un.`);
  await page.goto("/tsa/solicitacoes?fila=falta-estoque");
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
  const name = `Encarregado terceirizado ${scenario.tag}`;
  const registration = `EXT-${scenario.tag}`;
  const email = `encarregado-luk-${scenario.tag}@example.test`;
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
  await page.goto("/tsa/colaboradores?edit=novo");
  await page.getByLabel("Nome completo").fill(name);
  await page.getByLabel("Matrícula").fill(registration);
  await page.getByLabel(/Empresa terceirizada/).fill("LUK");
  await page.locator('select[name="unit"]').selectOption(scenario.unit.id);
  await page.getByLabel("Setor").fill("Operação");
  await page.getByLabel("Função").fill("Encarregado");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/colaboradores$/);
  await page.goto("/tsa/colaboradores?q=luk");
  const contractor = page.getByRole("row").filter({ hasText: name });
  await expect(contractor.getByRole("cell", { name: "LUK", exact: true })).toBeVisible();
  await contractor.getByRole("link", { name: /Configurar acesso/ }).click();
  await expect(page.locator('select[name="employee"] option:checked')).toContainText("LUK");
  await page.getByLabel(/E-mail usado no login/).fill(email);
  await page.getByLabel(/Senha temporária/).fill(temporaryPassword);
  await page.getByLabel(/Perfil de trabalho/).selectOption("SUPERVISOR");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByRole("status")).toHaveText("Alterações salvas.");
  const worker = await db.employee.findFirstOrThrow({ where: { companyId, name, contractorCompany: "LUK" } });
  const scope = await db.userScope.findFirstOrThrow({ where: { companyId, user: { email } } });
  expect(scope).toMatchObject({ role: "SUPERVISOR", employeeId: worker.id });

  await page.goto(`/tsa/colaboradores?edit=${scenario.worker.id}`);
  const supervisorField = page.locator('select[name="supervisor"]');
  await expect(supervisorField.locator(`option[value="${worker.id}"]`)).toContainText("LUK");
  await supervisorField.selectOption(worker.id);
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByRole("status")).toHaveText("Alterações salvas.");

  await signOut(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(temporaryPassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/conta\/senha$/);
  const newPassword = "Nov-62";
  await page.locator('input[name="currentPassword"]').fill(temporaryPassword);
  await page.locator('input[name="password"]').fill(newPassword);
  await page.locator('input[name="confirmation"]').fill(newPassword);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL(/\/login\?senha=alterada$/);
  await signIn(page, { email, password: newPassword });
  await page.goto("/tsa/colaboradores");
  await expect(page.getByRole("heading", { name: "Minha equipe" })).toBeVisible();
  const member = page.locator(".team-member").filter({ hasText: scenario.worker.name });
  await member.locator("summary").click();
  await expect(member.locator(".team-details").getByText(scenario.hidden.item.name, { exact: true })).toBeVisible();
  await expect(member.locator(".team-details").getByText("Faltam 2 un.", { exact: true })).toBeVisible();
  await expect(page.getByText(scenario.outside.name, { exact: true })).toHaveCount(0);
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
  const alert = page.getByRole("region", { name: "Estoque baixo ou zerado" })
    .getByRole("listitem").filter({ hasText: scenario.hidden.item.name });
  await expect(alert).toContainText("Mínimo 20 un.");
  await expect(alert).toContainText("Sem saldo disponível");
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
  const epi = await db.equipment.findFirstOrThrow({ where: { companyId, name: epiName },
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
  await expect(page.getByRole("combobox", { name: "Almoxarifado", exact: true })).toHaveValue(scenario.warehouse.id);
  await page.getByRole("combobox", { name: "Tipo de item" }).selectOption("UNIFORM");
  await expect(page.getByLabel("CA", { exact: true })).toHaveCount(0);
  const uniformName = `Uniforme novo ${scenario.tag}`;
  await page.getByLabel("Nome do item").fill(uniformName);
  await page.getByLabel("Fabricante e modelo").fill("Modelo de teste");
  await page.getByLabel("Quantidade").fill("3");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByRole("status")).toHaveText("Entrada registrada.");
  const uniform = await db.equipment.findFirstOrThrow({ where: { companyId, name: uniformName },
    include: { lots: { include: { stocks: true } } } });
  expect(uniform).toMatchObject({ category: "UNIFORM", certificate: null, lots: [{ stocks: [{ warehouseId: scenario.warehouse.id, quantity: 3 }] }] });

  await page.getByRole("button", { name: "Escolher item existente" }).click();
  await page.getByRole("combobox", { name: "Item", exact: true }).selectOption(uniform.id);
  await page.getByLabel("Quantidade").fill("2");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  const key = { companyId, warehouseId: scenario.warehouse.id, lotId: uniform.lots[0].id };
  await expect.poll(async () => (await db.stock.findUniqueOrThrow({ where: { companyId_warehouseId_lotId: key } })).quantity).toBe(5);
});
