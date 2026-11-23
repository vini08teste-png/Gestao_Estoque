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
  await page.goto(`/tsa/entregas?solicitacao=${approved.id}`);
  await page.getByLabel("Almoxarifado e lote").selectOption(scenario.uniform.stockValue);
  await page.getByRole("button", { name: "Confirmar entrega" }).click();
  await expect(page.getByRole("status")).toHaveText("Entrega registrada e saldo atualizado.");
  const delivery = await db.delivery.findUniqueOrThrow({
    where: { companyId_requestId: { companyId: "tsa", requestId: approved.id } }, include: { proof: true, receipt: true },
  });
  expect(delivery.proof).toBeNull();
  expect(delivery.receipt).toBeNull();
  await expect(page.getByRole("button", { name: "Confirmo que recebi" })).toHaveCount(0);
  await signOut(page);
  await signIn(page, scenario.employeeAccount);
  await page.goto("/tsa/meus-epis");
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
});

test("duas entregas simultâneas para a última unidade geram uma baixa", async ({ browser, page, baseURL }) => {
  await signIn(page, scenario.operator);
  const secondContext = await browser.newContext({ baseURL, storageState: await page.context().storageState() });
  try {
    const second = await secondContext.newPage();
    await Promise.all([page, second].map(async (entry) => {
      await entry.goto("/tsa/entregas?edit=novo");
      await entry.getByLabel("Colaborador", { exact: true }).selectOption(scenario.worker.id);
      await entry.getByLabel("Almoxarifado e lote").selectOption(scenario.scarce.stockValue);
      await expect(entry.getByLabel("Quantidade")).toHaveValue("1");
    }));
    await Promise.all([page, second].map((entry) => entry.getByRole("button", { name: "Confirmar entrega" }).click()));
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
  await page.goto("/tsa/solicitacoes?status=WAITING_CATALOG");
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
