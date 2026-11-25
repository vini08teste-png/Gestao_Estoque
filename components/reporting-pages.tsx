import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { saveAlertDays } from "@/app/organization-actions";
import { ActionForm } from "@/components/action-form";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import { PrintReportActions, ReportTypeSelect } from "@/components/report-controls";
import { canAdminister, type AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { employeesWhere } from "@/lib/directory";
import { deliveriesAwaitingReceipt, handlesStock, hasPersonalEquipment } from "@/lib/equipment-access";
import { formatDay, inputDay, plusDays, requestLabels, todayInBrazil } from "@/lib/equipment";
import { isCompany, roles } from "@/lib/organization";
import { defaultStockMinimum, stockAlerts, stockDemand } from "@/lib/stock-availability";
import {
  alertKind, alertLabels, canViewReports, deadlineStatus, listDeadlines, openRequestStatuses,
  individualReport, individualReportLabel, individualReportRows, reportFilters, reportKind, reportLabels, reportRows,
  reportingEmployees, reportingUnits, unitDeliveryWhere, unitRequestWhere,
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

type StockShortages = Awaited<ReturnType<typeof stockAlerts>>;

function StockShortageSummary({ rows }: { rows: StockShortages }) {
  const empty = rows.filter(([, row]) => row.quantity === 0).length;
  const low = rows.length - empty;
  return <div className="stock-shortage-counts">
    {empty > 0 && <span className="badge deadline-danger">{empty} {empty === 1 ? "item zerado" : "itens zerados"}</span>}
    {low > 0 && <span className="badge deadline-warning">{low} com saldo baixo</span>}
  </div>;
}

function StockPriority({ rows, href }: { rows: StockShortages; href: string }) {
  if (!rows.length) return null;
  return <section className={`panel stock-priority${rows.some(([, row]) => row.quantity === 0) ? " stock-priority-zero" : ""}`}
    aria-labelledby="stock-priority-heading">
    <Icon name="inventory_2" />
    <div><h2 id="stock-priority-heading">Estoque baixo ou zerado</h2><StockShortageSummary rows={rows} /></div>
    <Link className="button" href={href} aria-label="Ver itens com estoque baixo ou zerado">Ver itens</Link>
  </section>;
}

export async function Dashboard({ scope }: { scope: AccessScope }) {
  const personal = scope.role === "EMPLOYEE";
  const base = `/${scope.companyId}`;
  const today = todayInBrazil();
  const deliveryScope = unitDeliveryWhere(scope, "", personal);
  const openRequests = { ...unitRequestWhere(scope, "", personal), status: { in: [...openRequestStatuses()] } };
  const unconfirmed = { AND: [deliveryScope, { ...deliveriesAwaitingReceipt, retirement: null }] };
  const deliveryFields = {
    id: true, quantity: true, returnedQuantity: true, deliveredAt: true, warehouseId: true, receipt: { select: { deliveryId: true } },
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
    ["Recebimentos a confirmar", receipts, receiptPath, "inventory_2"],
  ] as const : scope.role === "WAREHOUSE" ? [
    ["Pedidos aguardando entrega", count("WAITING_DELIVERY"), `${base}/solicitacoes?status=WAITING_DELIVERY`, "receipt_long"],
    ["Itens a identificar", count("WAITING_CATALOG"), `${base}/solicitacoes?status=WAITING_CATALOG`, "category"],
    ["Entregas em 30 dias", deliveries, reportLink("entregas"), "history"],
  ] as const : [
    ["Recebimentos a confirmar", receipts, receiptPath, "inventory_2"],
    ["Solicitações em aberto", pending, `${base}/solicitacoes?status=aberto`, "receipt_long"],
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
    {!personal && <StockPriority rows={shortages} href={`${base}/alertas?tipo=estoque`} />}
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
                {row.returnedQuantity === row.quantity ? <span className="badge">Devolvido para descarte</span> :
                  <span className={`badge ${!row.warehouseId ? "" : row.receipt ? "active" : "deadline-warning"}`}>{!row.warehouseId ? "Entrega anterior" : row.receipt ? "Confirmado" : "Aguardando confirmação"}</span>}
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

const alertCategories = {
  todos: "Todos os alertas",
  estoque: "Estoque baixo ou zerado",
  demanda: "Saldo para pedidos",
  ...alertLabels,
};

type AlertCategory = keyof typeof alertCategories;
type AlertRecord = {
  id: string;
  equipment: string;
  unit: string;
  status: string;
  tone: string;
  detail: ReactNode;
  action?: { href: string; label: string };
};

export async function Alerts({ scope, query }: { scope: AccessScope; query: Query }) {
  if (!canViewReports(scope)) notFound();
  const base = `/${scope.companyId}`;
  const root = `${base}/alertas`;
  const units = await reportingUnits(scope);
  const { unit, error } = reportFilters({ unidade: query.unidade }, units);
  const category = query.tipo === "estoque" || query.tipo === "demanda" ? query.tipo : alertKind(query) ?? "todos";
  const thresholds = scope.company.alertDays;
  const today = todayInBrazil();
  const [deadlines, shortages, demand] = await Promise.all([
    error ? [] : listDeadlines(scope, { unit }),
    error ? [] : stockAlerts(scope, unit),
    error ? [] : stockDemand(scope, unit),
  ]);
  const categoryLink = (type: AlertCategory) => root + params({ tipo: type === "todos" ? "" : type, unidade: unit });
  const reportPath = `${base}/relatorios` + params({ tipo: "vencimentos", unidade: unit });
  const stockAction = handlesStock(scope) ? { href: `${base}/estoque`, label: "Consultar estoque" } : undefined;
  const orderAction = { href: `${base}/solicitacoes?fila=falta-estoque`, label: "Ver pedidos com falta de estoque" };
  const records: Record<Exclude<AlertCategory, "todos">, AlertRecord[]> = {
    estoque: shortages.map(([id, row]) => ({
      id: `estoque-${id}`, ...row,
      status: row.quantity === 0 ? "Estoque zerado" : "Estoque baixo",
      tone: row.quantity === 0 ? "danger" : "warning",
      detail: <><span className="table-value">{row.quantity} / {row.minimum} un.</span>
        <progress className="alert-stock-level" value={row.quantity} max={Math.max(row.minimum, 1)} aria-hidden="true" />
      </>,
      action: stockAction,
    })),
    demanda: demand.filter(({ missing }) => missing > 0).map((row) => ({
      ...row, id: `demanda-${row.id}`,
      status: `Faltam ${row.missing} un.`, tone: "danger",
      detail: `${row.requested} pedidas · ${row.available} disponíveis`, action: orderAction,
    })),
    ca: [],
    lote: [],
  };
  for (const row of deadlines) {
    const { label, tone } = deadlineStatus(row, today, thresholds);
    records[row.kind].push({
      ...row, id: `${row.kind}-${row.id}`, status: label, tone,
      detail: <><time dateTime={inputDay(row.due)}>{formatDay(row.due)}</time>
        <small>{row.kind === "ca" ? `CA ${row.reference}` : `Validade do produto · ${row.reference ? `Contrato ${row.reference}` : "Contrato não informado"}`}</small></>,
      action: { href: reportPath, label: "Ver vencimentos" },
    });
  }
  const all = [...records.estoque, ...records.demanda, ...records.ca, ...records.lote];
  const visible = category === "todos" ? all : records[category];
  const counts = { todos: all, ...records };
  const columns = ["Situação", "Equipamento", "Unidade", category === "estoque" ? "Saldo / mínimo" : "Saldo / prazo", "Ação"];
  const stockTone = records.estoque.some(({ tone }) => tone === "danger") ? "danger" : "warning";
  const descriptions = {
    todos: "Registros identificados",
    estoque: records.estoque.length ? "Requer atenção" : "Nenhum saldo crítico",
    demanda: "Itens com saldo insuficiente",
    ca: "Na janela consultada",
    lote: "Na janela consultada",
  };
  return <>
    <header className="page-heading"><div><h1>Alertas</h1>
      <p>{scope.company.name} · Estoque e validades</p></div>
      {!error && <Link className="button" href={reportPath}>Relatório de vencimentos</Link>}
    </header>
    <form action={root} className="filters">
      {category !== "todos" && <input type="hidden" name="tipo" value={category} />}
      <UnitSelect units={units} selected={unit} />
      <button className="button" type="submit">Filtrar</button>
    </form>
    {error ? <p className="feedback error" role="alert">{error}</p> : <>
      <nav className="alert-categories" aria-label="Categorias de alertas">
        {(Object.keys(alertCategories) as AlertCategory[]).map((type) =>
          <Link className={`stat alert-category${type === "estoque" && shortages.length ? ` alert-category-${stockTone}` : ""}`}
            href={categoryLink(type)} aria-current={type === category ? "page" : undefined} prefetch={false} scroll={false} key={type}>
            <span>{alertCategories[type]}</span>
            <strong className="metric-value">{counts[type].length}</strong>
            <small>{descriptions[type]}</small>
          </Link>)}
      </nav>
      <section className="panel alert-results" aria-labelledby="identified-alerts">
        <header className="panel-heading"><h2 id="identified-alerts">Alertas identificados</h2>
          <small>{visible.length} {visible.length === 1 ? "registro" : "registros"}</small>
        </header>
        {visible.length ? <div className="table-scroll records-mobile-cards" role="region" aria-label="Lista de alertas" tabIndex={0}>
          <table role="table">
            <thead role="rowgroup"><tr role="row">{columns.map((label) => <th scope="col" role="columnheader" key={label}>{label}</th>)}</tr></thead>
            <tbody role="rowgroup">{visible.map((row) => {
              const cells = [
                <span className={`badge deadline-${row.tone || "normal"}`}>{row.status}</span>,
                <strong>{row.equipment}</strong>,
                row.unit || "—",
                row.detail,
                row.action ? <Link href={row.action.href} className="text-action">{row.action.label}</Link> : "—",
              ];
              return <tr role="row" key={row.id}>{cells.map((cell, index) => <td role="cell" key={columns[index]}>
                <span className="records-mobile-label" aria-hidden="true">{columns[index]}</span><div>{cell}</div>
              </td>)}</tr>;
            })}</tbody>
          </table>
        </div> : <p className="empty">{category === "todos" ? "Nenhum alerta identificado nas unidades consultadas." : "Nenhum alerta identificado nesta categoria."}</p>}
        <footer>Estoque mínimo padrão de {defaultStockMinimum} unidades, salvo configuração específica. A ausência de alertas de validade, por si só, não comprova regularidade.</footer>
      </section>
    </>}

    {canAdminister(scope) && <details className="panel editor deadline-settings">
      <summary>Configurar prazos de alerta</summary>
      <ActionForm action={saveAlertDays.bind(null, scope.companyId)} continueLabel="Salvar e continuar">
        <p>Escolha três prazos em dias, em ordem crescente, para os alertas de validade do CA e do produto.</p>
        <div className="form-grid">
          {([["short", "Prazo curto"], ["medium", "Prazo intermediário"], ["long", "Prazo mais longo"]] as const).map(([name, label], index) =>
            <label className="field" key={name}>{label}<input name={name} type="number" min={1} max={365} defaultValue={thresholds[index]} required /></label>)}
        </div>
      </ActionForm>
    </details>}
  </>;
}

const reportColumnLines: Record<string, [string, string]> = {
  "Unidade de medida": ["Unidade", "de medida"],
  "Número do contrato": ["Número", "do contrato"],
  "Data de entrega": ["Data de", "entrega"],
  "Data de devolução": ["Data de", "devolução"],
  "Rubrica de entrega": ["Rubrica de", "entrega"],
  "Rubrica de devolução": ["Rubrica de", "devolução"],
};
const reportCompactColumns = new Set([
  "Quantidade", "Unidade de medida", "Nº do CA", "Número do contrato", "Data", "Prazo", "Data de entrega", "Data de devolução",
]);

function ReportTable({ data, label, sheet = false }: {
  data: Awaited<ReturnType<typeof reportRows>>; label: string; sheet?: boolean;
}) {
  if (!data.rows.length) return <p className="empty">Nenhum registro para estes filtros.</p>;
  return <div className="table-scroll" role="region" tabIndex={0} aria-label={`Tabela de ${label}`}>
    <table className="report-table" aria-label={label}>
      <thead><tr>{data.columns.map((column) => {
        const lines = reportColumnLines[column];
        return <th key={column} scope="col" data-column={column}>
          {lines ? <>{lines[0]} <br />{lines[1]}</> : column}
        </th>;
      })}</tr></thead>
      <tbody>{(sheet ? data.rows : data.rows.slice(0, 200)).map((row, index) => <tr key={index}>{row.map((cell, position) => {
        const column = data.columns[position];
        return <td key={column} data-column={column} className={reportCompactColumns.has(column) ? "report-compact-value" : undefined}>
          {typeof cell === "object" ? <><strong>{cell.name}</strong><small>Matrícula {cell.registration}</small></> :
            cell === "" && !sheet ? "—" : cell}
        </td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}

export async function Reports({ scope, query }: { scope: AccessScope; query: Query }) {
  if (!canViewReports(scope)) notFound();
  const individual = query.tipo === individualReport;
  const kind = reportKind(query);
  const [units, employees] = await Promise.all([reportingUnits(scope), individual ? reportingEmployees(scope) : []]);
  const filters = reportFilters(query, units);
  const { unit, begin, end } = filters;
  const selectedEmployee = typeof query.colaborador === "string" ? query.colaborador : "";
  const people = employees.filter((employee) => !unit || employee.unitId === unit);
  const employee = people.find(({ id }) => id === selectedEmployee);
  const error = filters.error ?? (individual && selectedEmployee && !employees.some(({ id }) => id === selectedEmployee) ?
    "O colaborador não está disponível no seu escopo." : undefined);
  const base = `/${scope.companyId}/relatorios`;
  const download = `/exportar/${scope.companyId}` + params({
    tipo: kind, unidade: unit, inicio: begin ? inputDay(begin) : "", fim: end ? inputDay(end) : "",
  });
  const data = error || individual ? null : await reportRows(scope, kind, filters);
  const sheet = !error && individual && employee ? await individualReportRows(scope, filters, employee.id) : null;
  const period = begin && end ? `${formatDay(begin)} a ${formatDay(end)}` :
    begin ? `A partir de ${formatDay(begin)}` : end ? `Até ${formatDay(end)}` : "Todos os registros";
  return <>
    <header className="page-heading"><div><h1>Relatórios</h1><p>{scope.company.name}</p></div>
      {data && <a className="button primary" href={download}>Exportar CSV</a>}
      {sheet && <PrintReportActions />}
    </header>
    <form action={base} className="filters report-filters">
      <ReportTypeSelect key={individual ? individualReport : kind} selected={individual ? individualReport : kind}
        options={[...Object.entries(reportLabels), [individualReport, individualReportLabel]]} individual={individualReport} />
      <UnitSelect units={units} selected={unit} />
      <label className="field">Data inicial<input name="inicio" type="date" defaultValue={begin && inputDay(begin)} /></label>
      <label className="field">Data final<input name="fim" type="date" defaultValue={end && inputDay(end)} /></label>
      {individual && <label className="field">Colaborador<select key={employee?.id ?? unit} name="colaborador" defaultValue={employee?.id ?? ""}>
        <option value="">Selecione um colaborador</option>
        {people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.registration}</option>)}
      </select></label>}
      <button className="button" type="submit">{individual ? "Gerar ficha" : "Aplicar filtros"}</button>
    </form>
    {error && <p className="feedback error" role="alert">{error}</p>}
    {!individual && kind === "pendencias" && <p className="report-hint">Solicitações em aberto e entregas aguardando confirmação de recebimento.</p>}
    {!individual && kind === "vencimentos" && <p className="report-hint">Sem data final, o relatório usa a janela de alerta da empresa.</p>}
    {data && <section className="panel" aria-label={reportLabels[kind]}>
      <p className="report-count">{data.rows.length} {data.rows.length === 1 ? "registro" : "registros"}
        {data.rows.length > 200 && " · A tela exibe os primeiros 200. O CSV inclui todos os resultados."}</p>
      <ReportTable data={data} label={reportLabels[kind]} />
    </section>}
    {individual && !error && !employee && <p className="empty panel">Selecione um colaborador e clique em Gerar ficha.</p>}
    {sheet && employee && <section className="panel epi-print-sheet" aria-labelledby="epi-sheet-heading">
      <header className="epi-sheet-heading">
        {isCompany(scope.companyId) && <Brand company={scope.companyId} variant="color" />}
        <div><h2 id="epi-sheet-heading">Ficha individual de controle de EPIs</h2><p>{scope.company.name}</p></div>
      </header>
      <dl className="epi-sheet-data">
        {[
          ["Colaborador", employee.name], ["Matrícula", employee.registration], ["Função", employee.jobTitle],
          ["Unidade", employee.unit.name], ["Período", period],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <ReportTable data={sheet} label={individualReportLabel} sheet />
      <p className="epi-print-help">Na janela de impressão, selecione <strong>Salvar como PDF</strong> para exportar.</p>
    </section>}
  </>;
}
