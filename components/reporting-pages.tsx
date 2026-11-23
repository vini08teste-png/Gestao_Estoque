import Link from "next/link";
import { notFound } from "next/navigation";
import { saveAlertDays } from "@/app/organization-actions";
import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { canAdminister, type AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { employeesWhere } from "@/lib/directory";
import { hasPersonalEquipment } from "@/lib/equipment-access";
import { formatDay, inputDay, plusDays, requestLabels, todayInBrazil } from "@/lib/equipment";
import { roles } from "@/lib/organization";
import { lowStockLimit, stockAlerts, stockDemand } from "@/lib/stock-availability";
import {
  alertKind, alertLabels, canViewReports, deadlineStatus, listDeadlines, openRequestStatuses,
  reportFilters, reportKind, reportLabels, reportRows, reportingUnits, unitDeliveryWhere, unitRequestWhere,
  type AlertKind, type Deadline, type Query,
} from "@/lib/reporting";

const params = (values: Record<string, string>) => "?" + new URLSearchParams(Object.entries(values).filter(([, value]) => value)).toString();

function UnitSelect({ units, selected }: { units: { id: string; name: string }[]; selected: string }) {
  return <label className="field">Unidade<select name="unidade" defaultValue={selected}>
    <option value="">Todas as unidades autorizadas</option>
    {units.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}
  </select></label>;
}

function AlertCards({ rows, root, selectedUnit }: {
  rows: Deadline[]; root: string; selectedUnit: string;
}) {
  const types = Object.keys(alertLabels) as AlertKind[];
  return <div className="stats">
    {types.map((type) => <Link key={type} className="stat" href={root + params({ tipo: type, unidade: selectedUnit })}>
      <span className="metric-label">{alertLabels[type]}</span>
      <strong className="metric-value">{rows.filter((row) => row.kind === type).length}</strong>
    </Link>)}
  </div>;
}

export async function Dashboard({ scope }: { scope: AccessScope }) {
  const personal = scope.role === "EMPLOYEE";
  const base = `/${scope.companyId}`;
  const today = todayInBrazil();
  const deliveryScope = unitDeliveryWhere(scope, "", personal);
  const openRequests = { ...unitRequestWhere(scope, "", personal), status: { in: [...openRequestStatuses()] } };
  const unconfirmed = { AND: [deliveryScope, { receipt: null, retirement: null }] };
  const deliveryFields = {
    id: true, quantity: true, deliveredAt: true, receipt: { select: { deliveryId: true } },
    employee: { select: { name: true } }, equipment: { select: { name: true } },
  } as const;
  const [deadlines, shortages, demand, requests, receipts, deliveries, employees, latest, pendingRequests, pendingReceipts] = await Promise.all([
    listDeadlines(scope),
    personal ? [] : stockAlerts(scope),
    personal ? [] : stockDemand(scope),
    db.equipmentRequest.groupBy({ by: ["status"], where: openRequests, _count: true }),
    db.delivery.count({ where: unconfirmed }),
    personal ? 0 : db.delivery.count({ where: { AND: [deliveryScope, { deliveredAt: { gte: plusDays(today, -29), lte: today } }] } }),
    ["ADMIN", "MANAGER"].includes(scope.role) ? db.employee.count({ where: { ...employeesWhere(scope), active: true } }) : 0,
    db.delivery.findMany({
      where: deliveryScope, select: deliveryFields, take: 4,
      orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
    db.equipmentRequest.findMany({
      where: openRequests, take: 2, orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      select: {
        id: true, quantity: true, status: true, requestedItem: true,
        employee: { select: { name: true } }, equipment: { select: { name: true } },
      },
    }),
    db.delivery.findMany({
      where: unconfirmed, select: deliveryFields, take: 2,
      orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
  ]);
  const pending = requests.reduce((total, row) => total + row._count, 0);
  const count = (status: typeof requests[number]["status"]) => requests.find((row) => row.status === status)?._count ?? 0;
  const reportLink = (kind: "entregas" | "pendencias") => `${base}/relatorios` + params({
    tipo: kind, ...(kind === "entregas" && { inicio: inputDay(plusDays(today, -29)), fim: inputDay(today) }),
  });
  const team = scope.role === "SUPERVISOR" || scope.role === "MANAGER";
  const approval = scope.company.requestApprovalEnabled;
  const stockCard = ["Itens com estoque baixo ou zerado", shortages.length, `${base}/alertas?tipo=estoque`, "inventory_2"] as const;
  const demandCard = ["Itens com falta para pedidos", demand.filter(({ missing }) => missing > 0).length,
    `${base}/alertas?tipo=demanda`, "list_alt"] as const;
  const receiptPath = personal ? `${base}/meus-epis#itens-a-confirmar` :
    team ? `${base}/colaboradores?pendencia=confirmacao` : reportLink("pendencias");
  const cards = personal ? [
    ["Recebimentos a confirmar", receipts, receiptPath, "inventory_2"],
    ["Meus pedidos em aberto", pending, `${base}/minhas-solicitacoes?status=aberto`, "receipt_long"],
  ] as const : scope.role === "SUPERVISOR" ? [
    ...(approval ? [["Pedidos aguardando sua decisão", count("PENDING_APPROVAL"), `${base}/solicitacoes?status=PENDING_APPROVAL`, "rule"] as const] : []),
    ["Pedidos aguardando entrega", count("WAITING_DELIVERY"), `${base}/solicitacoes?status=WAITING_DELIVERY`, "receipt_long"],
    stockCard,
    ["Recebimentos a confirmar", receipts, receiptPath, "inventory_2"],
  ] as const : scope.role === "WAREHOUSE" ? [
    ["Pedidos aguardando entrega", count("WAITING_DELIVERY"), `${base}/solicitacoes?status=WAITING_DELIVERY`, "receipt_long"],
    stockCard,
    ["Itens a identificar", count("WAITING_CATALOG"), `${base}/solicitacoes?status=WAITING_CATALOG`, "category"],
    ["Entregas em 30 dias", deliveries, reportLink("entregas"), "history"],
  ] as const : [
    ["Recebimentos a confirmar", receipts, receiptPath, "inventory_2"],
    ["Solicitações em aberto", pending, `${base}/solicitacoes?status=aberto`, "receipt_long"],
    stockCard,
    ["Colaboradores ativos", employees, `${base}/colaboradores?status=ativo`, "groups"],
    ["Entregas em 30 dias", deliveries, reportLink("entregas"), "history"],
  ] as const;
  const taskLinks = {
    ADMIN: [["Gerenciar acessos", "/usuarios"], ["Consultar estoque", "/estoque"]],
    MANAGER: [["Ver equipe", "/colaboradores"], ["Consultar estoque", "/estoque"]],
    SUPERVISOR: [approval ? ["Aprovar pedidos", "/solicitacoes?status=PENDING_APPROVAL"] : ["Ver fila de entregas", "/solicitacoes?status=WAITING_DELIVERY"],
      ["Ver minha equipe", "/colaboradores"]],
    WAREHOUSE: [["Ver fila de entregas", "/solicitacoes?status=WAITING_DELIVERY"], ["Registrar entrada", "/estoque?acao=entrada"]],
    EMPLOYEE: [["Solicitar item", "/minhas-solicitacoes?edit=novo"], ["Meus itens", "/meus-epis"]],
  }[scope.role];
  const requestPath = `${base}/${personal ? "minhas-solicitacoes" : "solicitacoes"}`;
  const historyPath = `${base}/${personal ? "meus-epis" : "entregas"}`;
  const detail = (person: string, quantity: number) => personal ? `Qtd. ${quantity}` : `${person} · Qtd. ${quantity}`;
  return <>
    <section className="hero">
      <h1>Visão geral</h1><p>{scope.company.name} · <strong>{roles[scope.role]}</strong></p>
    </section>
    <section aria-labelledby="dashboard-summary">
      <div className="section-row">
        <h2 id="dashboard-summary">{personal ? "Meu resumo" : "Resumo da operação"}</h2>
        {!personal && <Link className="text-action" href={`${base}/relatorios`}>Abrir relatórios</Link>}
      </div>
      <div className={`stats task-stats ${personal ? "personal-alerts" : ""}`}>{[...cards, ...(!personal ? [demandCard] : [])].map(([label, value, href, icon]) => <Link className="stat task-stat" key={label} href={href}>
        <span className="task-stat-icons"><span><Icon name={icon} /></span><Icon name="expand_more" /></span>
        <strong className="metric-value">{value}</strong><span className="metric-label">{label}</span>
      </Link>)}</div>
      <div className="dashboard-summary-grid">
        <section className="panel dashboard-summary-panel">
          <header className="panel-heading"><h3>Pendências</h3>
            <Link className="text-action" href={personal ? requestPath : reportLink("pendencias")}>
              {personal ? "Meus pedidos" : "Ver relatório"}
            </Link>
          </header>
          {pendingRequests.length || pendingReceipts.length ? <ul className="dashboard-summary-list">
            {pendingRequests.map((row) => <li key={`request-${row.id}`}>
              <Link href={requestPath + params({ status: row.status })}>
                <span><strong>{row.equipment?.name ?? row.requestedItem}</strong><small>{detail(row.employee.name, row.quantity)}</small></span>
                <span className="badge">{requestLabels[row.status]}</span>
              </Link>
            </li>)}
            {pendingReceipts.map((row) => <li key={`receipt-${row.id}`}>
              <Link href={receiptPath}>
                <span><strong>{row.equipment.name}</strong><small>{detail(row.employee.name, row.quantity)}</small></span>
                <span className="badge deadline-warning">Aguardando confirmação</span>
              </Link>
            </li>)}
          </ul> : <p className="empty">Nenhuma pendência no seu escopo.</p>}
        </section>
        <section className="panel dashboard-summary-panel">
          <header className="panel-heading"><h3>Histórico</h3>
            <Link className="text-action" href={historyPath}>{personal ? "Meus itens" : "Ver histórico"}</Link>
          </header>
          {latest.length ? <ul className="dashboard-summary-list">
            {latest.map((row) => <li key={row.id}>
              <div>
                <span><strong>{row.equipment.name}</strong><small>{detail(row.employee.name, row.quantity)} · {formatDay(row.deliveredAt)}</small></span>
                <span className={`badge ${row.receipt ? "active" : "deadline-warning"}`}>{row.receipt ? "Confirmado" : "Aguardando confirmação"}</span>
              </div>
            </li>)}
          </ul> : <p className="empty">Nenhuma entrega registrada.</p>}
        </section>
      </div>
    </section>
    <section className="panel quick-tasks" aria-label={personal ? "Minha área" : "Tarefas de trabalho"}>
      <div>
        <h2>{personal ? "Minha área" : "Tarefas de trabalho"}</h2>
        <div className="operation-actions">
          {taskLinks.map(([label, path], index) => <Link className={`button${index === 0 ? " primary" : ""}`} href={base + path} key={path}>{label}</Link>)}
        </div>
      </div>
      {!personal && hasPersonalEquipment(scope) && <div className="quick-tasks-personal">
        <h2>Minha área</h2>
        <div className="operation-actions">
          <Link className="button" href={`${base}/meus-epis`}>Meus itens</Link>
          <Link className="button" href={`${base}/minhas-solicitacoes?edit=novo`}>Solicitar item</Link>
        </div>
      </div>}
    </section>
    {!personal && <><div className="section-row">
      <div><h2>Alertas de validade</h2>
        <p>Prazos vencidos e próximos {scope.company.alertDays.at(-1)} dias</p></div>
      <Link className="text-action" href={`${base}/alertas`}>Ver alertas</Link>
    </div>
    <AlertCards rows={deadlines} root={`${base}/alertas`} selectedUnit="" /></>}
  </>;
}

export async function Alerts({ scope, query }: { scope: AccessScope; query: Query }) {
  if (!canViewReports(scope)) notFound();
  const root = `/${scope.companyId}/alertas`;
  const units = await reportingUnits(scope);
  const { unit, error } = reportFilters({ unidade: query.unidade }, units);
  const kind = alertKind(query);
  const stockOnly = query.tipo === "estoque";
  const demandOnly = query.tipo === "demanda";
  const operationsOnly = stockOnly || demandOnly;
  const today = todayInBrazil();
  const thresholds = scope.company.alertDays;
  const [rows, shortages, demand] = await Promise.all([
    error || operationsOnly ? [] : listDeadlines(scope, { unit }),
    error || kind || demandOnly ? [] : stockAlerts(scope, unit),
    error || kind || stockOnly ? [] : stockDemand(scope, unit),
  ]);
  const types = (operationsOnly ? [] : kind ? [kind] : Object.keys(alertLabels)) as AlertKind[];
  return <>
    <header className="page-heading"><div><h1>{demandOnly ? "Demanda e estoque" : stockOnly ? "Alertas de estoque" : "Alertas"}</h1>
      <p>{demandOnly ? "Veja quanto estoque falta para atender os pedidos da fila." :
        stockOnly ? "Consulte os itens com saldo baixo ou zerado na sua unidade." : `${scope.company.name} · Estoque e validades`}</p></div>
      {!operationsOnly && <Link className="button" href={`/${scope.companyId}/relatorios` + params({ tipo: "vencimentos", unidade: unit })}>Relatório de vencimentos</Link>}
    </header>
    <form action={root} className="filters">
      {(kind || operationsOnly) && <input type="hidden" name="tipo" value={demandOnly ? "demanda" : stockOnly ? "estoque" : kind} />}
      <UnitSelect units={units} selected={unit} />
      <button className="button" type="submit">Filtrar</button>
      {(kind || operationsOnly) && <Link className="button" href={root + params({ unidade: unit })}>Ver todos os alertas</Link>}
    </form>
    {error ? <p className="feedback error" role="alert">{error}</p> : <>
      {!kind && !stockOnly && <section aria-labelledby="stock-demand-heading">
        <div className="section-row"><div>
          <h2 id="stock-demand-heading">Saldo para pedidos em aberto</h2>
          <p>Compara pedidos aguardando entrega com o saldo elegível por item e unidade.</p>
        </div><Link className="text-action" href={`/${scope.companyId}/solicitacoes?status=WAITING_DELIVERY`}>Abrir fila de pedidos</Link></div>
        <div className="panel">
          {demand.length ? <ul className="dashboard-summary-list">
            {demand.map((row) => <li key={row.id}><div>
              <span><strong>{row.equipment}</strong><small>{row.unit} · {row.requested} pedidas · {row.available} disponíveis</small></span>
              <span className={`badge ${row.missing ? "deadline-danger" : "active"}`}>
                {row.missing ? `Faltam ${row.missing} un.` : "Saldo total suficiente"}
              </span>
            </div></li>)}
          </ul> : <p className="empty">Nenhum pedido com item identificado aguarda entrega neste escopo.</p>}
        </div>
      </section>}
      {!kind && !demandOnly && <section aria-labelledby="low-stock-heading">
        <div className="section-row"><div>
          <h2 id="low-stock-heading">Estoque baixo ou zerado</h2>
          <p>Até {lowStockLimit} unidades disponíveis por item e unidade. Confira se é preciso repor ou comprar.</p>
        </div><Link className="text-action" href={`/${scope.companyId}/estoque`}>Consultar estoque</Link></div>
        <div className="panel">
          {shortages.length ? <ul className="dashboard-summary-list">
            {shortages.map(([id, row]) => <li key={id}><div>
              <span><strong>{row.equipment}</strong><small>{row.unit}</small></span>
              <span className={`badge ${row.quantity ? "deadline-warning" : "deadline-danger"}`}>
                {row.quantity ? `Saldo baixo · ${row.quantity} un.` : "Sem saldo disponível"}
              </span>
            </div></li>)}
          </ul> : <p className="empty">Nenhum item com saldo baixo ou zerado no estoque cadastrado.</p>}
        </div>
      </section>}
      {!operationsOnly && <><h2 className="section-title">Alertas de validade</h2><AlertCards rows={rows} root={root} selectedUnit={unit} /></>}
      {types.map((type) => {
        const list = rows.filter((row) => row.kind === type);
        return <section key={type} className="deadline-section" aria-label={alertLabels[type]}>
          <h2 className="section-title">{alertLabels[type]}</h2>
          <div className="panel">
            {list.length === 0 ? <p className="empty">Nenhum prazo nesta janela.</p> :
              <div className="table-scroll" role="region" aria-label={alertLabels[type]} tabIndex={0}>
                <table>
                  <thead><tr>{["Item", type === "ca" ? "CA" : "Lote e almoxarifado",
                    ...(type === "ca" ? [] : ["Unidade"]), "Prazo", "Situação"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
                  <tbody>{list.map((row) => {
                    const status = deadlineStatus(row, today, thresholds);
                    return <tr key={row.id}><td>{row.equipment}</td><td>{row.reference}</td>
                      {type !== "ca" && <td>{row.unit}</td>}<td>{formatDay(row.due)}</td>
                      <td><span className={`badge deadline-${status.tone || "normal"}`}>{status.label}</span></td></tr>;
                  })}</tbody>
                </table>
              </div>}
          </div>
        </section>;
      })}
    </>}
    {!operationsOnly && canAdminister(scope) && <details className="panel editor deadline-settings">
      <summary>Configurar prazos de alerta</summary>
      <ActionForm action={saveAlertDays.bind(null, scope.companyId)}>
        <p>Escolha três prazos em dias, em ordem crescente, para os alertas de validade do CA e de lotes.</p>
        <div className="form-grid">
          {([["short", "Prazo curto"], ["medium", "Prazo intermediário"], ["long", "Prazo mais longo"]] as const).map(([name, label], index) =>
            <label className="field" key={name}>{label}<input name={name} type="number" min={1} max={365} defaultValue={thresholds[index]} required /></label>)}
        </div>
      </ActionForm>
    </details>}
  </>;
}

export async function Reports({ scope, query }: { scope: AccessScope; query: Query }) {
  if (!canViewReports(scope)) notFound();
  const units = await reportingUnits(scope);
  const kind = reportKind(query);
  const filters = reportFilters(query, units);
  const { unit, begin, end, error } = filters;
  const base = `/${scope.companyId}/relatorios`;
  const download = `/exportar/${scope.companyId}` + params({
    tipo: kind, unidade: unit, inicio: begin ? inputDay(begin) : "", fim: end ? inputDay(end) : "",
  });
  const data = error ? null : await reportRows(scope, kind, filters);
  return <>
    <header className="page-heading"><div><h1>Relatórios</h1><p>{scope.company.name}</p></div>
      {data && <a className="button primary" href={download}>Exportar CSV</a>}
    </header>
    <form action={base} className="filters">
      <label className="field">Relatório<select name="tipo" defaultValue={kind}>
        {Object.entries(reportLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <UnitSelect units={units} selected={unit} />
      <label className="field">Data inicial<input name="inicio" type="date" defaultValue={begin && inputDay(begin)} /></label>
      <label className="field">Data final<input name="fim" type="date" defaultValue={end && inputDay(end)} /></label>
      <button className="button" type="submit">Aplicar filtros</button>
    </form>
    {error && <p className="feedback error" role="alert">{error}</p>}
    {kind === "pendencias" && <p className="report-hint">Solicitações em aberto e entregas aguardando confirmação de recebimento.</p>}
    {kind === "vencimentos" && <p className="report-hint">Sem data final, o relatório usa a janela de alerta da empresa.</p>}
    {data && <section className="panel" aria-label={reportLabels[kind]}>
      <p className="report-count">{data.rows.length} {data.rows.length === 1 ? "registro" : "registros"}
        {data.rows.length > 200 && " · A tela exibe os primeiros 200. O CSV inclui todos os resultados."}</p>
      {data.rows.length ? <div className="table-scroll" role="region" tabIndex={0} aria-label={reportLabels[kind]}>
        <table aria-label={reportLabels[kind]}>
          <thead><tr>{data.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{data.rows.slice(0, 200).map((row, index) => <tr key={index}>{row.map((cell, position) => <td key={position}>{cell || (cell === 0 ? 0 : "—")}</td>)}</tr>)}</tbody>
        </table>
      </div> : <p className="empty">Nenhum registro para estes filtros.</p>}
    </section>}
  </>;
}
