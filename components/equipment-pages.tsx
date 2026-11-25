import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  addStock, confirmReceipt, decideRequest, editDelivery, identifyItem, openRequest, registerDelivery, requestReplacement, retireDelivery,
  removeExpectedItem, resetStockMinimum, saveEquipment, saveExpectedItem, saveRule, saveStockMinimum, saveWarehouse, voidDelivery,
} from "@/app/equipment-actions";
import { ActionForm } from "@/components/action-form";
import { DeliveryFields } from "@/components/delivery-fields";
import { EquipmentPicker } from "@/components/equipment-picker";
import { ItemCategoryFields } from "@/components/item-category-fields";
import { RequestEquipmentField } from "@/components/request-equipment-field";
import { ReplacementPhotoField } from "@/components/replacement-photo-field";
import { Icon } from "@/components/icon";
import { canAdminister, type AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { employeesWhere, unitsWhere } from "@/lib/directory";
import { canSetStockMinimum, deliveryCorrectionFields, handlesStock, hasPersonalEquipment, operationalDeliveryWhere, ownEmployeeId, personalDeliveryWhere, requestWhere } from "@/lib/equipment-access";
import { brazilDay, formatDay, inputDay, latestByItem, requestLabels, retirementLabels, todayInBrazil } from "@/lib/equipment";
import { inventoryTitle, itemCatalogTitle, operationRequestTab } from "@/lib/organization";
import { openRequestStatuses } from "@/lib/reporting";
import { availableLotWhere, defaultStockMinimum, requestAvailability, stockBalances, stockKey } from "@/lib/stock-availability";
import type { RequestStatus } from "@/generated/prisma/enums";

function Heading({ title, note, action }: { title: string; note?: string; action?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1>{note && <p>{note}</p>}</div>{action}</header>;
}

function Records({ columns, rows, cardsOnMobile = false }: { columns: string[]; rows: [string, ...ReactNode[]][]; cardsOnMobile?: boolean }) {
  return <section className="panel">
    {rows.length ? <div className={`table-scroll${cardsOnMobile ? " records-mobile-cards" : ""}`} role="region" aria-label="Resultados" tabIndex={0}>
      <table role={cardsOnMobile ? "table" : undefined}>
        <thead role={cardsOnMobile ? "rowgroup" : undefined}><tr role={cardsOnMobile ? "row" : undefined}>
          {columns.map((column) => <th scope="col" role={cardsOnMobile ? "columnheader" : undefined} key={column}>{column}</th>)}
        </tr></thead>
        <tbody role={cardsOnMobile ? "rowgroup" : undefined}>{rows.map(([id, ...cells]) =>
          <tr key={id} role={cardsOnMobile ? "row" : undefined}>{cells.map((cell, index) =>
            <td key={index} role={cardsOnMobile ? "cell" : undefined}>
              {cardsOnMobile ? <><span className="records-mobile-label" aria-hidden="true">{columns[index]}</span><div>{cell}</div></> : cell}
            </td>)}</tr>)}</tbody>
      </table>
    </div> : <p className="empty">Nenhum registro encontrado.</p>}
  </section>;
}

function Editor({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel editor operation-editor">
    <div className="panel-heading"><h2>{title}</h2></div>{children}
  </section>;
}

function Choose({ label, name, values, empty = "Selecione", optional = false, selected = "" }: {
  label: string; name: string; values: { id: string; name: string }[]; empty?: string; optional?: boolean; selected?: string;
}) {
  return <label className="field">{label}
    <select name={name} required={!optional} defaultValue={selected}>
      <option value="">{empty}</option>
      {values.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
    </select>
  </label>;
}

const textField = (label: string, name: string, value?: string, maxLength = 120) =>
  <label className="field">{label}<input name={name} defaultValue={value} maxLength={maxLength} required /></label>;
const quantityField = <label className="field">Quantidade<input name="quantity" type="number" min={1} max={1_000_000} required /></label>;
const receiptDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const deliveryFeedback: Record<string, string> = {
  "1": "Entrega registrada e saldo atualizado.",
  ficha: "Entrega anterior registrada.",
  editada: "Entrega atualizada.",
  apagada: "Entrega removida do histórico.",
};

export async function Catalog({ scope, edit }: { scope: AccessScope; edit: string }) {
  if (!handlesStock(scope)) notFound();
  const { companyId } = scope;
  const root = `/${companyId}/epis`;
  const admin = canAdminister(scope);
  const editing = Boolean(edit && edit !== "novo");
  if (editing && !admin) notFound();
  const item = editing ? await db.equipment.findUnique({
    where: { companyId_id: { companyId, id: edit } },
  }) : null;
  if (editing && !item) notFound();
  const items = edit ? [] : await db.equipment.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  return <>
    <Heading title={itemCatalogTitle} note="EPIs e uniformes" action={edit ? <Link className="button" href={root}>Voltar à lista de itens</Link> :
      <Link className="button primary" href={`${root}?edit=novo`}>Novo item</Link>} />
    {edit ? <Editor title={item ? "Editar item" : "Novo item"}>
      <ActionForm key={edit} action={saveEquipment.bind(null, companyId, item?.id ?? null)} continueLabel="Salvar e continuar" reset={!item}>
        <div className="form-grid">
          {textField("Nome do item", "name", item?.name)}
          {textField("Fabricante e modelo", "makerModel", item?.makerModel)}
          <ItemCategoryFields initial={item?.category ?? "EPI"} certificate={item?.certificate ?? undefined}
            expires={item?.caExpiresAt ? inputDay(item.caExpiresAt) : undefined} />
        </div>
        <label className="field">Observações<textarea name="notes" rows={2} maxLength={500} defaultValue={item?.notes} /></label>
        <label className="check"><input type="checkbox" name="active" defaultChecked={item?.active ?? true} /> Item ativo</label>
      </ActionForm>
    </Editor> : <Records columns={["Item", "Tipo", "Fabricante e modelo", "CA", "Validade do CA", "Situação", ...(admin ? ["Ação"] : [])]}
      rows={items.map((row) => [row.id, row.name, row.category === "UNIFORM" ? "Uniforme" : "EPI", row.makerModel, row.certificate ?? "—",
        row.caExpiresAt ? formatDay(row.caExpiresAt) : "—", row.active ? "Ativo" : "Inativo",
        ...(admin ? [<Link className="text-action" href={`${root}?edit=${row.id}`}>Editar</Link>] : [])])} />}
  </>;
}

export async function Inventory({ scope, operation, warehouseId = "", registered = false }: {
  scope: AccessScope; operation: string; warehouseId?: string; registered?: boolean;
}) {
  const { companyId } = scope;
  const admin = canAdminister(scope);
  if (!handlesStock(scope)) notFound();
  if (operation === "minimos") return <StockMinimums scope={scope} />;
  if (operation && !["entrada", "almoxarifado"].includes(operation)) notFound();
  const root = `/${companyId}/estoque`;
  const [stocks, warehouses, items, units] = await Promise.all([
    !operation ? db.stock.findMany({
      where: { companyId, warehouse: { active: true, unit: { ...unitsWhere(scope), active: true } } },
      include: { warehouse: { include: { unit: true } }, lot: { include: { equipment: true } } },
      orderBy: [{ warehouse: { name: "asc" } }, { lot: { equipment: { name: "asc" } } }],
    }) : [],
    operation !== "almoxarifado" ? db.warehouse.findMany({
      where: { companyId, active: true, unit: { ...unitsWhere(scope), active: true } }, include: { unit: true }, orderBy: { name: "asc" },
    }) : [],
    operation === "entrada" ? db.equipment.findMany({ where: { companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    operation === "almoxarifado" ? db.unit.findMany({ where: { ...unitsWhere(scope), active: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const today = todayInBrazil();
  const totals = new Map<string, { warehouse: typeof warehouses[number]; item: string; available: number; unavailable: number }>();
  for (const { warehouse, lot, quantity } of stocks) {
    const key = JSON.stringify([warehouse.id, lot.equipmentId]);
    const row = totals.get(key) ?? { warehouse, item: lot.equipment.name, available: 0, unavailable: 0 };
    if (lot.equipment.active && !lot.blocked && (!lot.expiresAt || lot.expiresAt >= today)) row.available += quantity;
    else row.unavailable += quantity;
    totals.set(key, row);
  }
  const warehousesWithItems = new Set(stocks.map(({ warehouseId }) => warehouseId));
  return <>
    <Heading title={operation === "entrada" ? "Registrar entrada" : operation === "almoxarifado" ? "Novo almoxarifado" : inventoryTitle}
      action={operation ? <Link className="button" href={root}>Voltar ao estoque</Link> : <div className="operation-actions">
        {admin && <Link className="button" href={`/${companyId}/usuarios?perfil=WAREHOUSE`}>Gerenciar responsáveis</Link>}
        {canSetStockMinimum(scope) && <Link className="button" href={`${root}?acao=minimos`}>Estoque mínimo</Link>}
        <Link className="button" href={`${root}?acao=almoxarifado`}>Novo almoxarifado</Link>
        <Link className="button primary" href={`${root}?acao=entrada`}>Registrar entrada</Link>
      </div>} />
    {!operation && registered && <p className="feedback success operation-feedback" role="status">Entrada registrada.</p>}
    {operation === "almoxarifado" ? <Editor title="Dados do almoxarifado"><ActionForm action={saveWarehouse.bind(null, companyId)} continueLabel="Salvar e continuar" reset>
      {textField("Nome do almoxarifado", "name")}
      <Choose label="Unidade" name="unit" values={units} />
    </ActionForm></Editor> : operation === "entrada" ? <Editor title="Item recebido">
      {warehouses.length ? <ActionForm action={addStock.bind(null, companyId, randomUUID())} continueLabel="Salvar e continuar" reset>
        <Choose label="Almoxarifado" name="warehouse"
          selected={warehouses.some(({ id }) => id === warehouseId) ? warehouseId : warehouses.length === 1 ? warehouses[0].id : ""}
          values={warehouses.map((row) => ({ id: row.id, name: `${row.name} · ${row.unit.name}` }))} />
        <EquipmentPicker items={items} />
        <div className="form-grid">
          {quantityField}
          <label className="field">Validade do produto (opcional)<input type="date" name="expiresAt" /></label>
        </div>
      </ActionForm> : <p className="empty">Para registrar uma entrada, cadastre um <Link href={`${root}?acao=almoxarifado`}
        className="text-action">almoxarifado</Link>.</p>}
    </Editor> : <>
      <h2 className="section-title">Almoxarifados</h2>
      <Records cardsOnMobile columns={["Almoxarifado", "Unidade", "Situação", "Ação"]}
        rows={warehouses.map((row) => [row.id, row.name, row.unit.name, warehousesWithItems.has(row.id) ? "Com itens cadastrados" : "Aguardando primeira entrada",
          <Link className="text-action" href={`${root}?acao=entrada&almoxarifado=${encodeURIComponent(row.id)}`}>Registrar entrada</Link>])} />
      <h2 className="section-title">Saldo por item</h2>
      <Records cardsOnMobile columns={["Item", "Almoxarifado", "Unidade", "Disponível", "Indisponível"]}
        rows={[...totals].map(([key, { warehouse, item, available, unavailable }]) =>
          [key, item, warehouse.name, warehouse.unit.name, available, unavailable])} />
    </>}
  </>;
}

async function StockMinimums({ scope }: { scope: AccessScope }) {
  if (!canSetStockMinimum(scope)) notFound();
  const { companyId } = scope;
  const [units, items, settings] = await Promise.all([
    db.unit.findMany({ where: { ...unitsWhere(scope), active: true }, orderBy: { name: "asc" } }),
    db.equipment.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" } }),
    db.stockMinimum.findMany({ where: { companyId, unit: unitsWhere(scope) }, include: { unit: true, equipment: true },
      orderBy: [{ unit: { name: "asc" } }, { equipment: { name: "asc" } }] }),
  ]);
  return <>
    <Heading title="Estoque mínimo" note={`O alerta aparece quando o saldo atinge o mínimo. O padrão é de ${defaultStockMinimum} unidades por item e unidade.`}
      action={<Link className="button" href={`/${companyId}/estoque`}>Voltar ao estoque</Link>} />
    <Editor title="Definir mínimo">
      <ActionForm action={saveStockMinimum.bind(null, companyId)} continueLabel="Salvar e continuar">
        <div className="form-grid">
          <Choose label="Unidade" name="unit" values={units} />
          <Choose label="Item" name="equipment" values={items} />
          <label className="field">Quantidade mínima
            <input name="quantity" type="number" min={0} max={1_000_000} defaultValue={defaultStockMinimum} required />
            <small>Use 0 para alertar apenas quando o saldo zerar.</small>
          </label>
        </div>
      </ActionForm>
    </Editor>
    <h2 className="section-title" id="minimos-cadastrados">Mínimos por item e unidade</h2>
    <Records cardsOnMobile columns={["Item", "Unidade", "Quantidade mínima", "Ação"]}
      rows={settings.map((row) => [JSON.stringify([row.unitId, row.equipmentId]), row.equipment.name, row.unit.name, row.quantity,
        <ActionForm action={resetStockMinimum.bind(null, companyId, row.unitId, row.equipmentId)} label="Usar padrão" />])} />
  </>;
}

export async function ExpectedItems({ scope }: { scope: AccessScope }) {
  if (!canAdminister(scope)) notFound();
  const { companyId } = scope;
  const [rules, units, equipment, functions] = await Promise.all([
    db.expectedItem.findMany({ where: { companyId }, include: { unit: true, equipment: true },
      orderBy: [{ unit: { name: "asc" } }, { jobTitle: "asc" }, { equipment: { name: "asc" } }] }),
    db.unit.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" } }),
    db.equipment.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { companyId, active: true }, distinct: ["jobTitle"], select: { jobTitle: true }, orderBy: { jobTitle: "asc" } }),
  ]);
  return <>
    <Heading title="Itens esperados" note="Defina o que cada unidade ou função deve receber. A lista aparece no acompanhamento da equipe." />
    <Editor title="Definir item esperado">
      <ActionForm action={saveExpectedItem.bind(null, companyId)} continueLabel="Salvar e continuar" reset>
        <p>Selecione uma unidade, informe uma função ou combine os dois campos para limitar a lista.</p>
        <div className="form-grid">
          <Choose label="Unidade" name="unit" values={units} optional empty="Todas as unidades" />
          <label className="field">Função<input name="jobTitle" list="funcoes-equipe" maxLength={120} placeholder="Todas as funções" />
            <datalist id="funcoes-equipe">{functions.map(({ jobTitle }) => <option value={jobTitle} key={jobTitle} />)}</datalist>
          </label>
          <Choose label="Item" name="equipment" values={equipment} />
          <label className="field">Quantidade<input name="quantity" type="number" min={1} max={1_000_000} defaultValue={1} required /></label>
        </div>
      </ActionForm>
    </Editor>
    <h2 className="section-title" id="itens-configurados">Itens configurados</h2>
    <Records cardsOnMobile columns={["Item", "Unidade", "Função", "Quantidade", "Ação"]}
      rows={rules.map((row) => [row.id, row.equipment.name, row.unit?.name ?? "Todas", row.jobTitle || "Todas", row.quantity,
        <ActionForm action={removeExpectedItem.bind(null, companyId, row.id)} label="Remover da lista" />])} />
  </>;
}

export async function Rules({ scope }: { scope: AccessScope }) {
  if (!canAdminister(scope)) notFound();
  const { companyId } = scope;
  const [rules, units, equipment] = await Promise.all([
    db.approvalRule.findMany({ where: { companyId }, include: { equipment: true, unit: true }, orderBy: { unit: { name: "asc" } } }),
    db.unit.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" } }),
    db.equipment.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" } }),
  ]);
  return <>
    <Heading title="Regras de aprovação" note={scope.company.requestApprovalEnabled ?
      "A regra de um item tem prioridade sobre a regra geral da unidade." :
      "Aprovação desativada. Os pedidos seguem para o almoxarifado. Você pode guardar regras para uso futuro."} />
    <Editor title="Definir regra">
      <ActionForm action={saveRule.bind(null, companyId)} continueLabel="Salvar e continuar" reset>
        <Choose label="Unidade" name="unit" values={units} />
        <Choose label="Item" name="equipment" values={equipment} optional empty="Regra geral da unidade" />
        <label className="field">Aprovação<select name="required" defaultValue="yes"><option value="yes">Exigir</option><option value="no">Dispensar</option></select></label>
      </ActionForm>
    </Editor>
    <h2 className="section-title" id="regras-cadastradas">Regras cadastradas</h2>
    <Records columns={["Unidade", "Item", "Aprovação"]} rows={rules.map((row) => [row.id, row.unit.name, row.equipment?.name ?? "Regra geral", row.required ? "Exigida" : "Dispensada"])} />
  </>;
}

const queueLabels = { prontos: "Pronto para entregar", "falta-estoque": "Falta estoque", identificar: "Item a identificar" };
type QueueKey = keyof typeof queueLabels;

function RequestProgress({ status, available, delivered, received }: {
  status: RequestStatus; available: boolean | undefined; delivered?: Date; received?: Date;
}) {
  if (status === "CANCELLED" || status === "REJECTED") return <p className="request-availability">Pedido enviado · {requestLabels[status]}</p>;
  const pending = status === "WAITING_CATALOG" ? "Item a identificar" : status === "PENDING_APPROVAL" ? "Aguardando aprovação" :
    available === false ? "Aguardando estoque" : "Aguardando entrega";
  const stage = received ? 3 : delivered ? 2 : 1;
  const steps = ["Pedido enviado", delivered ? "Em atendimento" : pending,
    delivered ? `Entregue em ${formatDay(delivered)}` : "Entregue", received ? "Recebimento confirmado" : "Confirmação de recebimento"];
  return <ol className="request-progress" aria-label="Acompanhamento do pedido">
    {steps.map((step, index) => <li key={index} aria-current={index === stage ? "step" : undefined}
      className={index < stage ? "progress-done" : undefined}>{step}</li>)}
  </ol>;
}

export async function Requests({ scope, edit, status, sent, queue = "", personal = false }: {
  scope: AccessScope; edit: string; status: string; sent: boolean; queue?: string; personal?: boolean;
}) {
  const { companyId } = scope;
  const own = personal || scope.role === "EMPLOYEE";
  if (own && !hasPersonalEquipment(scope)) notFound();
  const root = `/${companyId}/${own ? "minhas-solicitacoes" : "solicitacoes"}`;
  const tabs = scope.role !== "EMPLOYEE" && hasPersonalEquipment(scope) &&
    <nav className="request-tabs" aria-label="Listas de solicitações">
      <Link href={`/${companyId}/minhas-solicitacoes`} aria-current={own ? "page" : undefined}>Meus pedidos</Link>
      <Link href={`/${companyId}/solicitacoes`} aria-current={own ? undefined : "page"}>{operationRequestTab(scope.role)}</Link>
    </nav>;
  if (edit === "novo") {
    if (!own) notFound();
    const equipment = await db.equipment.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" } });
    return <>
      <Heading title="Solicitar item" action={<Link className="button" href={root}>Voltar a meus pedidos</Link>} />
      <Editor title="Dados da solicitação"><ActionForm action={openRequest.bind(null, companyId, randomUUID())} label="Enviar solicitação">
        <RequestEquipmentField options={equipment} />
        {quantityField}
        <label className="field">Motivo<textarea name="reason" required maxLength={500} rows={3} /></label>
      </ActionForm></Editor>
    </>;
  }
  const list = await db.equipmentRequest.findMany({
    where: { ...(own ? { companyId, employeeId: ownEmployeeId(scope) } : requestWhere(scope)),
      ...(status === "aberto" ? { status: { in: [...openRequestStatuses()] } } :
        Object.hasOwn(requestLabels, status) ? { status: status as RequestStatus } : {}) },
    include: { equipment: true, employee: true, unit: true, photo: { select: { requestId: true } },
      delivery: { select: { id: true, deliveredAt: true, receipt: { select: { confirmedAt: true } }, retirement: { select: { deliveryId: true } } } } },
    orderBy: { openedAt: "desc" },
  });
  const catalog = !own && handlesStock(scope) && list.some((row) => row.status === "WAITING_CATALOG") ?
    await db.equipment.findMany({ where: { companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const awaitingDelivery = list.filter((row) => row.status === "WAITING_DELIVERY" && row.equipmentId &&
    (!own || row.unitId === scope.employee?.unitId));
  const balances = awaitingDelivery.length ? await stockBalances(scope,
    [...new Set(awaitingDelivery.map((row) => row.unitId))],
    [...new Set(awaitingDelivery.flatMap((row) => row.equipmentId ? [row.equipmentId] : []))], own) : new Map();
  const selectedQueue = !own && Object.hasOwn(queueLabels, queue) ? queue as QueueKey : "";
  const cards = list.map((row) => {
    const availability = row.status === "WAITING_DELIVERY" && row.equipmentId && (!own || row.unitId === scope.employee?.unitId) ?
      requestAvailability(balances.get(stockKey(row.unitId, row.equipmentId)), row.quantity) : null;
    const category: QueueKey | null = row.status === "WAITING_CATALOG" ? "identificar" :
      availability ? (availability.ready ? "prontos" : "falta-estoque") : null;
    return { row, availability, category };
  });
  const results = selectedQueue ? cards.filter(({ category }) => category === selectedQueue) : cards;
  const queuePath = (category: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (category) params.set("fila", category);
    return params.size ? `${root}?${params}` : root;
  };
  return <>
    <Heading title="Solicitações"
      note={own ? "Acompanhe seus pedidos de EPIs e uniformes." : "Veja quais pedidos podem ser entregues, precisam de estoque ou precisam ser identificados."}
      action={own && <Link className="button primary" href={`${root}?edit=novo`}>Solicitar item</Link>} />
    {tabs}
    {!own && <nav className="queue-tabs" aria-label="Prioridades da fila">
      <Link className="button" href={queuePath("")} aria-current={!selectedQueue ? "page" : undefined}>Todos</Link>
      {(Object.entries(queueLabels) as [QueueKey, string][]).map(([key, label]) =>
        <Link key={key} className="button" href={queuePath(key)} aria-current={selectedQueue === key ? "page" : undefined}>
          {label} <span className="badge">{cards.filter(({ category }) => category === key).length}</span>
        </Link>)}
    </nav>}
    {own && sent && <p className="feedback success operation-feedback" role="status">Solicitação enviada.</p>}
    <form action={root} className="filters">
      {selectedQueue && <input type="hidden" name="fila" value={selectedQueue} />}
      <label className="field">Situação<select name="status" defaultValue={status === "aberto" || Object.hasOwn(requestLabels, status) ? status : ""}>
        <option value="">Todas</option><option value="aberto">Em aberto</option>
        {Object.entries(requestLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
      <button className="button" type="submit">Filtrar</button>
    </form>
    {results.length ? <div className="request-list">{results.map(({ row, availability, category }) => {
      const photoUrl = row.photo && `/fotos-de-troca/${companyId}/${row.id}`;
      return (
      <article className="panel request-card" key={row.id}>
        <div className="request-card-main">
          <Icon name="receipt_long" />
          <div><h2>{row.equipment?.name ?? row.requestedItem}</h2>
            <p>{!own && `${row.employee.name} · ${row.unit.name} · `}Qtd. {row.quantity} · {formatDay(brazilDay(row.openedAt))}</p>
          </div>
          <span className={`badge ${row.status === "COMPLETED" || (!own && category === "prontos") ? "active" :
            !own && category === "falta-estoque" ? "deadline-warning" : ""}`}>{!own && category ? queueLabels[category] : requestLabels[row.status]}</span>
        </div>
        {own && <RequestProgress status={row.status} available={availability?.ready}
          delivered={row.delivery?.deliveredAt} received={row.delivery?.receipt?.confirmedAt} />}
        {own && row.delivery && !row.delivery.receipt && <Link className="button primary request-action"
          href={`/${companyId}/meus-epis${row.delivery.retirement ? "" : "#entrega-" + row.delivery.id}`}>Ir para confirmação</Link>}
        {!own && availability && <p className="request-availability">
          <span className={`badge ${availability.tone}`}>{availability.label}</span>
          <span>{availability.detail}</span>
        </p>}
        {!own && availability?.ready && handlesStock(scope) &&
          <Link className="button primary request-action" href={`/${companyId}/entregas?solicitacao=${row.id}`}>Atender pedido</Link>}
        <details className="record-details"><summary>Ver detalhes</summary>
          {row.replacementForId && <p><strong>Solicitação de troca</strong></p>}
          {row.reason && <p>{row.reason}</p>}
          {photoUrl && <div className="replacement-photo">
            <img src={photoUrl} alt="Foto enviada como justificativa da troca" loading="lazy" />
            <a className="text-action" href={photoUrl} target="_blank" rel="noopener">Ver foto em tamanho original</a>
          </div>}
          {row.decisionNote && <p><strong>Justificativa:</strong> {row.decisionNote}</p>}
          {row.requestedItem && <p><strong>Item informado:</strong> {row.requestedItem}</p>}
          {!own && handlesStock(scope) && row.status === "WAITING_CATALOG" && <>
            <ActionForm action={identifyItem.bind(null, companyId, row.id)} label="Vincular ao catálogo">
              <Choose label="Item correspondente" name="equipment" values={catalog} />
            </ActionForm>
            <Link className="text-action" href={`/${companyId}/epis?edit=novo`}>Cadastrar um novo item</Link>
          </>}
          {!own && scope.company.requestApprovalEnabled && scope.role === "SUPERVISOR" && row.status === "PENDING_APPROVAL" && <>
            <ActionForm action={decideRequest.bind(null, companyId, row.id, "approve")} label="Aprovar" />
            <ActionForm action={decideRequest.bind(null, companyId, row.id, "reject")} label="Rejeitar">
              <label className="field">Justificativa<textarea name="note" required maxLength={500} rows={2} /></label>
            </ActionForm>
          </>}
          {!own && availability && !availability.ready && handlesStock(scope) &&
            <Link className="text-action" href={`/${companyId}/estoque`}>Consultar estoque</Link>}
          {(own || canAdminister(scope)) && ["WAITING_CATALOG", "PENDING_APPROVAL", "WAITING_DELIVERY"].includes(row.status) &&
            <ActionForm action={decideRequest.bind(null, companyId, row.id, "cancel")} label="Cancelar solicitação" />}
        </details>
      </article>);
    })}</div> : <div className="panel"><p className="empty">Nenhuma solicitação encontrada.</p></div>}
  </>;
}

async function DeliveryCorrection({ scope, id, remove }: { scope: AccessScope; id: string; remove: boolean }) {
  const { companyId } = scope;
  if (!canAdminister(scope)) notFound();
  const row = await db.delivery.findUnique({
    where: { companyId_id: { companyId, id }, voidedAt: null },
    include: {
      employee: { select: { id: true, name: true } }, equipment: { select: { id: true, name: true } },
      proof: { select: { deliveryId: true } }, receipt: { select: { confirmedAt: true } },
      retirement: { select: { retiredAt: true } }, request: { select: { openedAt: true } },
      _count: { select: { replacementRequests: true } },
    },
  });
  if (!row) notFound();
  const fields = deliveryCorrectionFields(row);
  const [people, items] = !remove && fields.assignment ? await Promise.all([
    db.employee.findMany({
      where: { companyId, OR: [{ active: true }, { id: row.employeeId }] },
      select: { id: true, name: true, registration: true, unit: { select: { name: true } } }, orderBy: { name: "asc" },
    }),
    db.equipment.findMany({
      where: { companyId, OR: [{ active: true }, { id: row.equipmentId }] },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
  ]) : [[], []];
  const title = remove ? "Apagar entrega" : "Editar entrega";
  return <>
    <Heading title={title} note={`${row.equipment.name} · ${row.employee.name}`}
      action={<Link className="button" href={`/${companyId}/entregas`}>Voltar ao Histórico</Link>} />
    <Editor title={remove ? "Confirmar exclusão" : "Dados da entrega"}>
      {remove ? <ActionForm action={voidDelivery.bind(null, companyId, id)} label="Apagar entrega" destructive>
        <dl className="delivery-summary">
          <div><dt>Data da entrega</dt><dd>{formatDay(row.deliveredAt)}</dd></div>
          <div><dt>Quantidade</dt><dd>{row.quantity}</dd></div>
        </dl>
        <p>O registro sairá do Histórico e de Meus itens. {row.warehouseId ?
          "A quantidade será devolvida ao estoque de origem." : "O saldo do estoque será preservado."}</p>
        {row.requestId && <p>A solicitação vinculada voltará para atendimento, quando aplicável.</p>}
        <label className="field">Motivo da exclusão<textarea name="note" rows={3} maxLength={500} required /></label>
      </ActionForm> : <ActionForm action={editDelivery.bind(null, companyId, id)} continueLabel="Salvar e continuar">
        <div className="form-grid">
          {fields.assignment && <>
            <Choose label="Colaborador" name="employee" selected={row.employeeId} values={people.map((person) => ({
              id: person.id, name: `${person.name} · ${person.registration} · ${person.unit.name}`,
            }))} />
            <Choose label="Item" name="equipment" selected={row.equipmentId} values={items} />
          </>}
          <label className="field">Data da entrega<input type="date" name="deliveredAt" defaultValue={inputDay(row.deliveredAt)}
            max={inputDay(todayInBrazil())} min={row.request ? inputDay(brazilDay(row.request.openedAt)) : undefined} required /></label>
          <label className="field">Quantidade<input type="number" name="quantity" min={1} max={1_000_000}
            defaultValue={row.quantity} readOnly={!fields.quantity} required /></label>
        </div>
        {!fields.quantity && <p>A quantidade está vinculada a uma solicitação, troca ou retirada de uso.</p>}
        {fields.quantity && row.warehouseId && <p>Alterar a quantidade ajusta o saldo do almoxarifado.
          {row.receipt && " O colaborador precisará confirmar o recebimento da quantidade corrigida."}</p>}
        <label className="field">Comprovante (opcional)<input type="file" name="proof" accept="application/pdf,image/png,image/jpeg" />
          <small>{row.proof ? "Anexe um arquivo para substituir o comprovante atual." : "PDF, PNG ou JPEG de até 3 MB."}</small>
        </label>
        <label className="field">Motivo da correção<textarea name="note" rows={3} maxLength={500} required /></label>
      </ActionForm>}
    </Editor>
  </>;
}

export async function Deliveries({ scope, create, requestId, registered, paper = false, employeeId = "", personal = false, retired = false,
  correction = "", remove = "" }: {
  scope: AccessScope; create: boolean; requestId: string; registered: string; paper?: boolean; employeeId?: string; personal?: boolean; retired?: boolean;
  correction?: string; remove?: string;
}) {
  const { companyId } = scope;
  const root = `/${companyId}/entregas`;
  const own = personal || scope.role === "EMPLOYEE";
  if (own && !hasPersonalEquipment(scope)) notFound();
  const operator = !own && handlesStock(scope);
  const admin = operator && canAdminister(scope);
  if (correction || remove) return <DeliveryCorrection scope={scope} id={remove || correction} remove={Boolean(remove)} />;
  if (create || requestId || paper) {
    if (!operator) notFound();
    if (paper && requestId) notFound();
    const request = requestId ? await db.equipmentRequest.findFirst({
      where: { ...requestWhere(scope), id: requestId, status: "WAITING_DELIVERY" },
      include: { employee: true, equipment: true },
    }) : null;
    if (requestId && (!request || !request.equipment)) notFound();
    const today = todayInBrazil();
    const [people, warehouses, stocks, items] = await Promise.all([
      request ? [] : db.employee.findMany({
        where: { ...employeesWhere(scope), active: true, unit: { active: true } },
        select: { id: true, name: true, unitId: true, unit: { select: { name: true } } }, orderBy: { name: "asc" },
      }),
      paper ? [] : db.warehouse.findMany({
        where: { companyId, active: true, unit: { ...unitsWhere(scope), active: true, ...(request && { id: request.unitId }) } },
        orderBy: { name: "asc" }, select: { id: true, name: true, unitId: true },
      }),
      paper ? [] : db.stock.findMany({
        where: { companyId, quantity: { gt: 0 },
          warehouse: { active: true, unit: { ...unitsWhere(scope), active: true, ...(request && { id: request.unitId }) } },
          lot: { ...availableLotWhere(today), ...(request?.equipmentId && { equipmentId: request.equipmentId }) } },
        select: { warehouseId: true, quantity: true, lot: { select: { equipment: { select: { id: true, name: true } } } } },
        orderBy: { lot: { equipment: { name: "asc" } } },
      }),
      paper ? db.equipment.findMany({ where: { companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    ]);
    if (paper && employeeId && !people.some(({ id }) => id === employeeId)) notFound();
    const totals = new Map<string, { warehouseId: string; item: typeof items[number]; quantity: number }>();
    for (const { warehouseId, lot: { equipment }, quantity } of stocks) {
      const key = JSON.stringify([warehouseId, equipment.id]);
      const row = totals.get(key) ?? { warehouseId, item: equipment, quantity: 0 };
      row.quantity += quantity;
      totals.set(key, row);
    }
    const canSubmit = request ? [...totals.values()].some(({ quantity }) => quantity >= request.quantity) :
      people.length && (paper || warehouses.length > 0);
    return <>
      <Heading title={paper ? "Registrar entregas anteriores" : request ? "Atender pedido" : "Nova entrega"}
        note={paper ? "Registre itens já entregues ao colaborador sem movimentar o estoque." : undefined}
        action={<Link className="button" href={request ? `/${companyId}/solicitacoes?fila=prontos` : root}>Voltar</Link>} />
      {canSubmit ? <Editor title={paper ? "Item já entregue" : "Dados da entrega"}>
        <ActionForm action={registerDelivery.bind(null, companyId, randomUUID(), requestId || null, paper)}
          label={paper ? "Salvar e continuar" : request ? "Confirmar entrega" : "Salvar"}
          continueLabel={paper || request ? undefined : "Salvar e continuar"} reset={!request}>
          <DeliveryFields key={employeeId} people={people} warehouses={warehouses} stocks={[...totals.values()]} items={items}
            paper={paper} employeeId={employeeId} today={inputDay(today)} request={request ? {
            name: request.employee.name, equipment: request.equipment!.name, unitId: request.unitId,
            quantity: request.quantity, minDate: inputDay(brazilDay(request.openedAt)),
          } : undefined} />
        </ActionForm>
      </Editor> : <section className="panel"><p className="empty">{request ?
        <>Nenhum almoxarifado da unidade tem saldo suficiente. <Link className="text-action" href={`/${companyId}/estoque?acao=entrada`}>Registrar entrada</Link></> : !people.length ?
        "Nenhum colaborador ativo está disponível no seu escopo." :
        <>A unidade precisa de um almoxarifado para registrar entregas. <Link className="text-action" href={`/${companyId}/estoque?acao=almoxarifado`}>Cadastrar almoxarifado</Link></>}</p></section>}
    </>;
  }

  const rows = await db.delivery.findMany({
    where: own ? personalDeliveryWhere(scope) : operationalDeliveryWhere(scope),
    include: {
      employee: { select: { name: true } }, equipment: { select: { name: true } },
      stock: { select: { warehouse: { select: { name: true } }, lot: { select: { expiresAt: true } } } },
      actor: { select: { scopes: { where: { companyId }, select: { name: true } } } },
      proof: { select: { deliveryId: true } },
      receipt: { select: { confirmedAt: true } },
      retirement: { select: { reason: true, note: true, retiredAt: true } },
      replacementRequests: { where: { status: { in: ["WAITING_CATALOG", "PENDING_APPROVAL", "WAITING_DELIVERY"] } },
        select: { id: true }, take: 1 },
    },
    orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const personalRows = own ? rows : [];
  const latest = latestByItem(personalRows);
  const latestIds = new Set(latest.map((row) => row.id));
  const confirmed = latestByItem(personalRows.filter((row) => row.receipt || !row.warehouseId));
  const current = confirmed.filter((row) => !row.retirement);
  const pending = personalRows.filter((row) => row.warehouseId && !row.receipt && !row.retirement);
  const pendingIds = new Set(pending.map((row) => row.id));
  const outOfUse = [...latest, ...confirmed.filter((row) => !latestIds.has(row.id))].filter((row) => row.retirement);
  const today = todayInBrazil();
  const replacement = (row: (typeof rows)[number]) => row.replacementRequests.length ?
    <Link className="text-action" href={`/${companyId}/minhas-solicitacoes`}>Troca solicitada</Link> :
    <details className="record-details personal-item-action">
      <summary>Solicitar troca</summary>
      <ActionForm action={requestReplacement.bind(null, companyId, row.id, randomUUID())} label="Enviar pedido de troca">
        <label className="field">Quantidade<input name="quantity" type="number" min={1} max={1_000_000} defaultValue={row.quantity} required /></label>
        <p>Descreva o motivo da troca, anexe uma foto ou envie os dois.</p>
        <label className="field">Justificativa da troca<textarea name="reason" rows={2} maxLength={500} /></label>
        <ReplacementPhotoField />
      </ActionForm>
    </details>;
  const receiptCell = (row: (typeof rows)[number], canConfirm: boolean) => row.receipt ?
    <span className="badge active">Confirmado em {receiptDate.format(row.receipt.confirmedAt)}</span> :
    !row.warehouseId ? <span className="badge">Entrega anterior</span> :
    canConfirm ? <ActionForm action={confirmReceipt.bind(null, companyId, row.id)} label="Confirmo que recebi" /> : "Aguardando confirmação";
  const itemCard = (row: (typeof rows)[number], allowActions: boolean) =>
    <article className={`panel personal-equipment-card${pendingIds.has(row.id) ? " awaiting-receipt" : ""}`} key={row.id} id={`entrega-${row.id}`}>
      <h3>{row.equipment.name}</h3>
      <dl>
        <div><dt>Quantidade</dt><dd>{row.quantity}</dd></div>
        <div><dt>Data da entrega</dt><dd>{formatDay(row.deliveredAt)}</dd></div>
        {row.stock?.lot.expiresAt && <div><dt>Validade do produto</dt><dd>
          {formatDay(row.stock.lot.expiresAt)} {row.stock.lot.expiresAt < today && <span className="badge deadline-danger">Vencido</span>}
        </dd></div>}
      </dl>
      {receiptCell(row, true)}
      {allowActions && <div className="personal-item-actions">
        {!pendingIds.has(row.id) && replacement(row)}
        <details className="record-details personal-item-action">
          <summary>{pendingIds.has(row.id) ? "Problemas com este item" : "Mais opções"}</summary>
          <div className="item-action-options">
            <details className="record-details personal-item-action">
              <summary>Retirar de uso</summary>
              <ActionForm action={retireDelivery.bind(null, companyId, row.id)} label="Confirmar retirada">
                <Choose label="Motivo da retirada" name="retirementReason" values={Object.entries(retirementLabels).map(([id, name]) => ({ id, name }))} />
                <label className="field">Justificativa da retirada<textarea name="note" rows={2} maxLength={500} required /></label>
              </ActionForm>
            </details>
            {pendingIds.has(row.id) && replacement(row)}
          </div>
        </details>
      </div>}
    </article>;
  return <>
    <Heading title={own ? "Meus itens" : "Histórico"} note={own ? "Entregas de EPIs e uniformes" : "Entregas registradas e confirmação de recebimento"}
      action={operator && <div className="operation-actions">
        <Link className="button" href={`${root}?edit=ficha`}>Registrar entregas anteriores</Link>
        <Link className="button primary" href={`${root}?edit=novo`}>Nova entrega</Link>
      </div>} />
    {operator && registered && <p className="feedback success operation-feedback" role="status">{deliveryFeedback[registered]}</p>}
    {own && <>
      {retired && <p className="feedback success operation-feedback" role="status">Item retirado de uso. A entrega ficou registrada no histórico.</p>}
      {pending.length > 0 && <section aria-labelledby="itens-a-confirmar">
        <h2 className="section-title" id="itens-a-confirmar">Aguardando confirmação</h2>
        <div className="personal-equipment">{pending.map((row) => itemCard(row, latestIds.has(row.id)))}</div>
      </section>}
      <section aria-labelledby="itens-em-uso">
        <h2 className="section-title" id="itens-em-uso">Itens em uso</h2>
        {current.length ? <div className="personal-equipment">{current.map((row) => itemCard(row, true))}</div> :
          <div className="panel"><p className="empty">Você não tem itens em uso.</p></div>}
      </section>
      {outOfUse.length > 0 && <>
        <h2 className="section-title">Retirados de uso</h2>
        <div className="personal-equipment">
          {outOfUse.map((row) => <article className="panel personal-equipment-card personal-retired-card" key={row.id}>
            <h3>{row.equipment.name}</h3>
            <p>{retirementLabels[row.retirement!.reason]} · {receiptDate.format(row.retirement!.retiredAt)}</p>
            {replacement(row)}
          </article>)}
        </div>
      </>}
      <h2 className="section-title">Histórico de entregas</h2>
    </>}
    <Records cardsOnMobile columns={["Item", ...(own ? [] : ["Colaborador"]), "Almoxarifado", "Quantidade", "Data", "Responsável", "Recebimento", "Situação do item", "Anexo", ...(admin ? ["Ações"] : [])]}
      rows={rows.map((row) => [row.id, row.equipment.name, ...(own ? [] : [row.employee.name]), row.stock?.warehouse.name ?? "—", row.quantity,
        <time className="delivery-day" dateTime={inputDay(row.deliveredAt)}>{formatDay(row.deliveredAt)}</time>,
        row.actor.scopes[0]?.name ?? "—",
        receiptCell(row, own && !pendingIds.has(row.id)),
        row.retirement ? <details className="record-details"><summary>Retirado de uso</summary>
          <p>{retirementLabels[row.retirement.reason]} · {receiptDate.format(row.retirement.retiredAt)}</p><p>{row.retirement.note}</p>
        </details> : "—",
        row.proof ? <a className="text-action" href={`/comprovantes/${companyId}/${row.id}`}>Baixar</a> : "—",
        ...(admin ? [<div className="row-actions">
          <Link className="text-action" href={`${root}?edit=${encodeURIComponent(row.id)}`}>Editar</Link>
          <Link className="text-action danger" href={`${root}?apagar=${encodeURIComponent(row.id)}`}>Apagar</Link>
        </div>] : [])])} />
  </>;
}
