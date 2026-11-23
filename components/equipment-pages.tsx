import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  addStock, confirmReceipt, decideRequest, identifyItem, openRequest, registerDelivery, requestReplacement, retireDelivery,
  saveEquipment, saveLot, saveRule, saveWarehouse, setLotBlocked,
} from "@/app/equipment-actions";
import { ActionForm } from "@/components/action-form";
import { DeliveryFields } from "@/components/delivery-fields";
import { ItemCategoryFields } from "@/components/item-category-fields";
import { RequestEquipmentField } from "@/components/request-equipment-field";
import { ReplacementPhotoField } from "@/components/replacement-photo-field";
import { Icon } from "@/components/icon";
import { canAdminister, type AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { employeesWhere, unitsWhere } from "@/lib/directory";
import { handlesStock, hasPersonalEquipment, operationalDeliveryWhere, ownEmployeeId, requestWhere } from "@/lib/equipment-access";
import { brazilDay, formatDay, inputDay, latestByItem, requestLabels, retirementLabels, todayInBrazil } from "@/lib/equipment";
import { inventoryTitle, itemCatalogTitle, operationRequestTab } from "@/lib/organization";
import { openRequestStatuses } from "@/lib/reporting";
import { availableLotWhere, requestAvailability, stockBalances, stockKey } from "@/lib/stock-availability";
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

function Choose({ label, name, values, empty = "Selecione", optional = false }: {
  label: string; name: string; values: { id: string; name: string }[]; empty?: string; optional?: boolean;
}) {
  return <label className="field">{label}
    <select name={name} required={!optional} defaultValue="">
      <option value="">{empty}</option>
      {values.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
    </select>
  </label>;
}

const textField = (label: string, name: string, value?: string, maxLength = 120) =>
  <label className="field">{label}<input name={name} defaultValue={value} maxLength={maxLength} required /></label>;
const quantityField = <label className="field">Quantidade<input name="quantity" type="number" min={1} max={1_000_000} required /></label>;
const receiptDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

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
      <ActionForm key={edit} action={saveEquipment.bind(null, companyId, item?.id ?? null)} reset={!item}>
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

export async function Inventory({ scope, operation }: { scope: AccessScope; operation: string }) {
  const { companyId } = scope;
  const admin = canAdminister(scope);
  const operator = handlesStock(scope);
  if (!operator) notFound();
  if (operation && !["entrada", "lote", "almoxarifado"].includes(operation)) notFound();
  const root = `/${companyId}/estoque`;
  const [stocks, warehouses, lots, items, units] = await Promise.all([
    db.stock.findMany({
      where: { companyId, warehouse: { unit: unitsWhere(scope) } },
      include: { warehouse: { include: { unit: true } }, lot: { include: { equipment: true } } },
      orderBy: [{ warehouse: { name: "asc" } }, { lot: { code: "asc" } }],
    }),
    db.warehouse.findMany({ where: { companyId, active: true, unit: { ...unitsWhere(scope), active: true } }, include: { unit: true }, orderBy: { name: "asc" } }),
    operator ? db.equipmentLot.findMany({
      where: { companyId, ...(operation === "entrada" && { equipment: { active: true } }) },
      include: { equipment: true }, orderBy: { code: "asc" },
    }) : [],
    operation === "lote" ? db.equipment.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" } }) : [],
    operation === "almoxarifado" ? db.unit.findMany({ where: { ...unitsWhere(scope), active: true } }) : [],
  ]);
  const today = todayInBrazil();
  return <>
    <Heading title={inventoryTitle} note="Consulte saldos, lotes e validades. Registre a entrada de EPIs e uniformes."
      action={operation ? <Link className="button" href={root}>Voltar ao estoque</Link> : operator && <div className="operation-actions">
        {admin && <Link className="button" href={`/${companyId}/usuarios?perfil=WAREHOUSE`}>Gerenciar responsáveis</Link>}
        <Link className="button" href={`${root}?acao=almoxarifado`}>Novo almoxarifado</Link>
        <Link className="button" href={`${root}?acao=lote`}>Novo lote</Link>
        <Link className="button primary" href={`${root}?acao=entrada`}>Registrar entrada</Link>
      </div>} />
    {operation === "almoxarifado" ? <Editor title="Novo almoxarifado"><ActionForm action={saveWarehouse.bind(null, companyId)} reset>
      {textField("Nome do almoxarifado", "name")}
      <Choose label="Unidade" name="unit" values={units} />
    </ActionForm></Editor> : operation === "lote" ? <Editor title="Novo lote"><ActionForm action={saveLot.bind(null, companyId)} reset>
      <Choose label="Item" name="equipment" values={items} />
      {textField("Código do lote", "code", undefined, 60)}
      <label className="field">Validade do produto, quando aplicável<input type="date" name="expiresAt" /></label>
    </ActionForm></Editor> : operation === "entrada" ? <Editor title="Registrar entrada"><ActionForm action={addStock.bind(null, companyId)} reset>
      <Choose label="Almoxarifado" name="warehouse" values={warehouses.map((row) => ({ id: row.id, name: `${row.name} · ${row.unit.name}` }))} />
      <Choose label="Lote" name="lot" values={lots.map((row) => ({ id: row.id, name: `${row.equipment.name} · ${row.code}` }))} />
      {quantityField}
    </ActionForm></Editor> : <>
      <Records cardsOnMobile columns={["Item", "Lote", "Almoxarifado", "Unidade", "Validade do lote", "Saldo", "Situação"]}
        rows={stocks.map(({ warehouse, lot, quantity }) => [`${warehouse.id}/${lot.id}`, lot.equipment.name, lot.code, warehouse.name, warehouse.unit.name,
          lot.expiresAt ? formatDay(lot.expiresAt) : "—", quantity,
          !lot.equipment.active ? "Item inativo" : lot.blocked ? "Bloqueado" : lot.expiresAt && lot.expiresAt < today ? "Vencido" : "Liberado"])} />
      {admin && <>
        <h2 className="section-title">Controle de lotes</h2>
        <Records columns={["Item", "Lote", "Ação"]}
          rows={lots.map((row) => [row.id, row.equipment.name, row.code,
            <ActionForm action={setLotBlocked.bind(null, companyId, row.id, !row.blocked)} label={row.blocked ? "Desbloquear" : "Bloquear"} />])} />
      </>}
    </>}
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
      <ActionForm action={saveRule.bind(null, companyId)}>
        <Choose label="Unidade" name="unit" values={units} />
        <Choose label="Item" name="equipment" values={equipment} optional empty="Regra geral da unidade" />
        <label className="field">Aprovação<select name="required" defaultValue="yes"><option value="yes">Exigir</option><option value="no">Dispensar</option></select></label>
      </ActionForm>
    </Editor>
    <h2 className="section-title">Regras cadastradas</h2>
    <Records columns={["Unidade", "Item", "Aprovação"]} rows={rules.map((row) => [row.id, row.unit.name, row.equipment?.name ?? "Regra geral", row.required ? "Exigida" : "Dispensada"])} />
  </>;
}

export async function Requests({ scope, edit, status, sent, personal = false }: {
  scope: AccessScope; edit: string; status: string; sent: boolean; personal?: boolean;
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
    include: { equipment: true, employee: true, unit: true, photo: { select: { requestId: true } } },
    orderBy: { openedAt: "desc" },
  });
  const catalog = !own && handlesStock(scope) && list.some((row) => row.status === "WAITING_CATALOG") ?
    await db.equipment.findMany({ where: { companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const awaitingDelivery = own ? [] : list.filter((row) => row.status === "WAITING_DELIVERY" && row.equipmentId);
  const balances = awaitingDelivery.length ? await stockBalances(scope,
    [...new Set(awaitingDelivery.map((row) => row.unitId))],
    [...new Set(awaitingDelivery.flatMap((row) => row.equipmentId ? [row.equipmentId] : []))]) : new Map();
  return <>
    <Heading title="Solicitações"
      note={own ? "Acompanhe seus pedidos de EPIs e uniformes." : "Acompanhe e resolva os pedidos no seu escopo."}
      action={own && <Link className="button primary" href={`${root}?edit=novo`}>Solicitar item</Link>} />
    {tabs}
    {own && sent && <p className="feedback success operation-feedback" role="status">Solicitação enviada.</p>}
    <form action={root} className="filters">
      <label className="field">Situação<select name="status" defaultValue={status === "aberto" || Object.hasOwn(requestLabels, status) ? status : ""}>
        <option value="">Todas</option><option value="aberto">Em aberto</option>
        {Object.entries(requestLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
      <button className="button" type="submit">Filtrar</button>
    </form>
    {list.length ? <div className="request-list">{list.map((row) => {
      const photoUrl = row.photo && `/fotos-de-troca/${companyId}/${row.id}`;
      const availability = !own && row.status === "WAITING_DELIVERY" && row.equipmentId ?
        requestAvailability(balances.get(stockKey(row.unitId, row.equipmentId)), row.quantity) : null;
      return (
      <article className="panel request-card" key={row.id}>
        <div className="request-card-main">
          <Icon name="receipt_long" />
          <div><h2>{row.equipment?.name ?? row.requestedItem}</h2>
            <p>{!own && `${row.employee.name} · ${row.unit.name} · `}Qtd. {row.quantity} · {formatDay(brazilDay(row.openedAt))}</p>
          </div>
          <span className={`badge ${row.status === "COMPLETED" ? "active" : ""}`}>{requestLabels[row.status]}</span>
        </div>
        {availability && <p className="request-availability">
          <span className={`badge ${availability.tone}`}>{availability.label}</span>
          <span>{availability.detail}</span>
        </p>}
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
          {availability && handlesStock(scope) && (availability.ready ?
            <Link className="button primary" href={`/${companyId}/entregas?solicitacao=${row.id}`}>Atender solicitação</Link> :
            <Link className="text-action" href={`/${companyId}/estoque`}>Consultar estoque</Link>)}
          {(own || canAdminister(scope)) && ["WAITING_CATALOG", "PENDING_APPROVAL", "WAITING_DELIVERY"].includes(row.status) &&
            <ActionForm action={decideRequest.bind(null, companyId, row.id, "cancel")} label="Cancelar solicitação" />}
        </details>
      </article>);
    })}</div> : <div className="panel"><p className="empty">Nenhuma solicitação encontrada.</p></div>}
  </>;
}

export async function Deliveries({ scope, create, requestId, registered, personal = false, retired = false }: {
  scope: AccessScope; create: boolean; requestId: string; registered: boolean; personal?: boolean; retired?: boolean;
}) {
  const { companyId } = scope;
  const root = `/${companyId}/entregas`;
  const own = personal || scope.role === "EMPLOYEE";
  if (own && !hasPersonalEquipment(scope)) notFound();
  const operator = !own && handlesStock(scope);
  if (create || requestId) {
    if (!operator) notFound();
    const request = requestId ? await db.equipmentRequest.findFirst({
      where: { ...requestWhere(scope), id: requestId, status: "WAITING_DELIVERY" },
      include: { employee: true, equipment: true },
    }) : null;
    if (requestId && (!request || !request.equipment)) notFound();
    const today = todayInBrazil();
    const [people, stocks] = await Promise.all([
      request ? [] : db.employee.findMany({
        where: { ...employeesWhere(scope), active: true, unit: { active: true } },
        select: { id: true, name: true, unitId: true, unit: { select: { name: true } } }, orderBy: { name: "asc" },
      }),
      db.stock.findMany({
        where: { companyId, quantity: { gte: request?.quantity ?? 1 },
          warehouse: { active: true, unit: { ...unitsWhere(scope), active: true, ...(request && { id: request.unitId }) } },
          lot: { ...availableLotWhere(today), ...(request?.equipmentId && { equipmentId: request.equipmentId }) } },
        include: { warehouse: true, lot: { include: { equipment: true } } },
        orderBy: [{ warehouse: { name: "asc" } }, { lot: { code: "asc" } }],
      }),
    ]);
    return <>
      <Heading title={request ? "Atender solicitação" : "Nova entrega"} action={<Link className="button" href={request ? `/${companyId}/solicitacoes` : root}>Voltar</Link>} />
      {stocks.length && (request || people.length) ? <Editor title="Dados da entrega">
        <ActionForm action={registerDelivery.bind(null, companyId, randomUUID(), requestId || null)} label="Confirmar entrega">
          <DeliveryFields people={people} today={inputDay(today)} request={request ? {
            name: request.employee.name, equipment: request.equipment!.name, unitId: request.unitId,
            quantity: request.quantity, minDate: inputDay(brazilDay(request.openedAt)),
          } : undefined} stocks={stocks.map(({ warehouse, lot, quantity }) => ({
            key: `${warehouse.id}|${lot.id}`, unitId: warehouse.unitId,
            label: `${warehouse.name} · ${lot.equipment.name} · Lote ${lot.code} · Saldo ${quantity}`,
          }))} />
        </ActionForm>
      </Editor> : <p className="empty">Nenhum lote com saldo suficiente e colaborador elegível estão disponíveis para esta entrega.</p>}
    </>;
  }

  const rows = await db.delivery.findMany({
    where: own ? { companyId, employeeId: ownEmployeeId(scope) } : operationalDeliveryWhere(scope),
    include: {
      employee: { select: { name: true } }, equipment: { select: { name: true } },
      stock: { include: { warehouse: { include: { unit: true } }, lot: { select: { code: true, expiresAt: true } } } },
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
  const confirmed = latestByItem(personalRows.filter((row) => row.receipt));
  const current = confirmed.filter((row) => !row.retirement);
  const pending = personalRows.filter((row) => !row.receipt && !row.retirement);
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
    canConfirm ? <ActionForm action={confirmReceipt.bind(null, companyId, row.id)} label="Confirmo que recebi" /> : "Aguardando confirmação";
  const itemCard = (row: (typeof rows)[number], allowActions: boolean) =>
    <article className={`panel personal-equipment-card${row.receipt ? "" : " awaiting-receipt"}`} key={row.id}>
      <h3>{row.equipment.name}</h3>
      <dl>
        <div><dt>Quantidade</dt><dd>{row.quantity}</dd></div>
        <div><dt>Data da entrega</dt><dd>{formatDay(row.deliveredAt)}</dd></div>
        {row.stock.lot.expiresAt && <div><dt>Validade do lote</dt><dd>
          {formatDay(row.stock.lot.expiresAt)} {row.stock.lot.expiresAt < today && <span className="badge deadline-danger">Vencido</span>}
        </dd></div>}
      </dl>
      {receiptCell(row, true)}
      {allowActions && <div className="personal-item-actions">
        {row.receipt && replacement(row)}
        <details className="record-details personal-item-action">
          <summary>{row.receipt ? "Mais opções" : "Problemas com este item"}</summary>
          <div className="item-action-options">
            <details className="record-details personal-item-action">
              <summary>Retirar de uso</summary>
              <ActionForm action={retireDelivery.bind(null, companyId, row.id)} label="Confirmar retirada">
                <Choose label="Motivo da retirada" name="retirementReason" values={Object.entries(retirementLabels).map(([id, name]) => ({ id, name }))} />
                <label className="field">Justificativa da retirada<textarea name="note" rows={2} maxLength={500} required /></label>
              </ActionForm>
            </details>
            {!row.receipt && replacement(row)}
          </div>
        </details>
      </div>}
    </article>;
  return <>
    <Heading title={own ? "Meus itens" : "Histórico"} note={own ? "Entregas de EPIs e uniformes" : "Entregas registradas e confirmação de recebimento"}
      action={operator && <Link className="button primary" href={`${root}?edit=novo`}>Nova entrega</Link>} />
    {operator && registered && <p className="feedback success operation-feedback" role="status">Entrega registrada e saldo atualizado.</p>}
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
    <Records cardsOnMobile={own} columns={["Item", ...(own ? [] : ["Colaborador"]), "Almoxarifado", "Lote", "Quantidade", "Entrega", "Responsável", "Recebimento", "Situação do item", "Anexo"]}
      rows={rows.map((row) => [row.id, row.equipment.name, ...(own ? [] : [row.employee.name]), row.stock.warehouse.name, row.stock.lot.code, row.quantity,
        <time className="delivery-day" dateTime={inputDay(row.deliveredAt)}>{formatDay(row.deliveredAt)}</time>,
        row.actor.scopes[0]?.name ?? "—",
        receiptCell(row, own && !pendingIds.has(row.id)),
        row.retirement ? <details className="record-details"><summary>Retirado de uso</summary>
          <p>{retirementLabels[row.retirement.reason]} · {receiptDate.format(row.retirement.retiredAt)}</p><p>{row.retirement.note}</p>
        </details> : "—",
        row.proof ? <a className="text-action" href={`/comprovantes/${companyId}/${row.id}`}>Baixar</a> : "—"])} />
  </>;
}
