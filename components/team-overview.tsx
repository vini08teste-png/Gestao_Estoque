import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { TeamMemberTabs } from "@/components/team-member-tabs";
import type { Role } from "@/generated/prisma/enums";
import type { AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { canGrantSupervisorAccess } from "@/lib/directory";
import { operationalDeliveryWhere, requestWhere } from "@/lib/equipment-access";
import { brazilDay, formatDay, itemsInUse, jobTitleKey, latestByItem, plusDays, requestLabels, todayInBrazil } from "@/lib/equipment";
import { openRequestStatuses, type Query } from "@/lib/reporting";
import { employeeCompanyName } from "@/lib/organization";

type TeamMember = {
  id: string;
  name: string;
  registration: string;
  contractorCompany: string | null;
  unitId: string;
  unit: { name: string };
  department: string;
  jobTitle: string;
  supervisor: { id: string; name: string } | null;
  scope: { role: Role; active: boolean } | null;
  active: boolean;
};

const pendingOptions = {
  confirmacao: "Recebimentos a confirmar",
  pedidos: "Pedidos em aberto",
  faltantes: "Itens esperados em falta",
  validade: "Validades próximas ou vencidas",
  "sem-configuracao": "Sem configuração de itens esperados",
} as const;
const missingValue = <span aria-label="Sem informação">—</span>;
const number = new Intl.NumberFormat("pt-BR");

function FilterSelect({ label, name, selected, options, placeholder }: {
  label: string; name: string; selected: string; options: [string, string][]; placeholder: string;
}) {
  return <label className="field">{label}<select name={name} defaultValue={selected}>
    <option value="">{placeholder}</option>
    {options.map(([id, displayName]) => <option key={id} value={id}>{displayName}</option>)}
  </select></label>;
}

function TeamTable({ label, columns, rows, empty }: {
  label: string; columns: string[]; rows: [string, ...ReactNode[]][]; empty: string;
}) {
  if (!rows.length) return <p className="team-empty">{empty}</p>;
  return <div className="table-scroll team-table" role="region" aria-label={label} tabIndex={0}>
    <table role="table" aria-label={label}>
      <thead role="rowgroup"><tr role="row">{columns.map((column) => <th key={column} scope="col" role="columnheader">{column}</th>)}</tr></thead>
      <tbody role="rowgroup">{rows.map(([id, ...cells]) => <tr role="row" key={id}>
        {cells.map((cell, index) => index === 0 ? <th key={index} scope="row" role="rowheader">{cell}</th> :
          <td key={index} role="cell"><span className="team-mobile-label" aria-hidden="true">{columns[index]}</span><div>{cell}</div></td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}

function Validity({ value, today, deadline }: { value: Date | null; today: Date; deadline: Date }) {
  if (!value) return missingValue;
  return <div className="team-validity">
    <time dateTime={value.toISOString().slice(0, 10)}>{formatDay(value)}</time>
    {value < today ? <span className="badge deadline-danger">Vencida</span> :
      value <= deadline ? <span className="badge deadline-warning">A vencer</span> : null}
  </div>;
}

export async function TeamOverview({ scope, people, search, status, filters }: {
  scope: AccessScope; people: TeamMember[]; search: string; status: string; filters: Query;
}) {
  const base = `/${scope.companyId}/colaboradores`;
  const sortedValues = (entries: [string, string][]) =>
    [...new Map(entries)].sort(([, a], [, b]) => a.localeCompare(b, "pt-BR"));
  const units = sortedValues(people.map((person) => [person.unitId, person.unit.name]));
  const departments = sortedValues(people.map(({ department }) => [department, department]));
  const supervisors = sortedValues(people.flatMap(({ supervisor }) => supervisor ? [[supervisor.id, supervisor.name]] : []));
  if (people.some(({ supervisor }) => !supervisor)) supervisors.push(["sem-encarregado", "Sem responsável da Gerência"]);
  const selected = (key: string, options: [string, string][]) =>
    options.find(([id]) => id === filters[key])?.[0] ?? "";
  const unit = selected("unidade", units);
  const department = selected("setor", departments);
  const supervisor = selected("supervisor", supervisors);
  const pending = typeof filters.pendencia === "string" && Object.hasOwn(pendingOptions, filters.pendencia) ? filters.pendencia : "";
  const needle = search.toLocaleLowerCase("pt-BR");
  const scopedPeople = people.filter((person) =>
    (!status || person.active === (status === "ativo")) &&
    (!unit || person.unitId === unit) && (!department || person.department === department) &&
    (!supervisor || (person.supervisor?.id ?? "sem-encarregado") === supervisor) &&
    (!needle || [person.name, person.registration, employeeCompanyName(scope.company.name, person.contractorCompany)]
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(needle))));
  const employeeId = { in: scopedPeople.map(({ id }) => id) };
  const [deliveries, requests, expected] = await Promise.all(scopedPeople.length ? [
    db.delivery.findMany({
      where: { ...operationalDeliveryWhere(scope), employeeId },
      select: {
        id: true, employeeId: true, equipmentId: true, quantity: true, returnedQuantity: true, warehouseId: true, deliveredAt: true,
        equipment: { select: { name: true, caExpiresAt: true } }, stock: { select: { lot: { select: { expiresAt: true } } } },
        receipt: { select: { deliveryId: true } }, retirement: { select: { deliveryId: true } },
      },
      orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
    db.equipmentRequest.findMany({
      where: { ...requestWhere(scope), employeeId, status: { in: [...openRequestStatuses()] } },
      select: {
        id: true, employeeId: true, requestedItem: true, quantity: true, status: true, openedAt: true,
        equipment: { select: { name: true } },
      },
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
    }),
    db.expectedItem.findMany({
      where: { companyId: scope.companyId, equipment: { active: true },
        OR: [{ unitId: null }, { unitId: { in: [...new Set(scopedPeople.map(({ unitId }) => unitId))] } }] },
      select: { unitId: true, jobTitle: true, equipmentId: true, quantity: true, equipment: { select: { name: true } } },
      orderBy: { equipment: { name: "asc" } },
    }),
  ] as const : [[], [], []] as const);
  const deliveriesByPerson = Map.groupBy(deliveries, ({ employeeId }) => employeeId);
  const requestsByPerson = Map.groupBy(requests, ({ employeeId }) => employeeId);
  const expectedByUnit = Map.groupBy(expected, ({ unitId }) => unitId);
  const today = todayInBrazil();
  const deadline = plusDays(today, scope.company.alertDays.at(-1) ?? 30);
  const members = scopedPeople.map((person) => {
    const delivered = deliveriesByPerson.get(person.id) ?? [];
    const current = itemsInUse(delivered.filter(({ receipt, warehouseId }) => receipt || !warehouseId));
    const waiting = delivered.filter(({ receipt, retirement, warehouseId, returnedQuantity, quantity }) =>
      warehouseId && !receipt && !retirement && returnedQuantity < quantity);
    const open = requestsByPerson.get(person.id) ?? [];
    const unitRules = [...(expectedByUnit.get(null) ?? []), ...(expectedByUnit.get(person.unitId) ?? [])];
    const byItem = new Map<string, (typeof expected)[number]>();
    if (person.active) {
      const job = jobTitleKey(person.jobTitle);
      for (const rule of unitRules) {
        if (rule.jobTitle && rule.jobTitle !== job) continue;
        if (rule.quantity > (byItem.get(rule.equipmentId)?.quantity ?? 0)) byItem.set(rule.equipmentId, rule);
      }
    }
    const inUse = new Map<string, number>();
    for (const { equipmentId, quantity, returnedQuantity } of current) {
      inUse.set(equipmentId, (inUse.get(equipmentId) ?? 0) + quantity - returnedQuantity);
    }
    const toConfirm = new Map(latestByItem(waiting).map((row) => [row.equipmentId, row.quantity - row.returnedQuantity]));
    const checklist = [...byItem.values()].sort((a, b) => a.equipment.name.localeCompare(b.equipment.name, "pt-BR")).map((rule) => {
      const confirmed = inUse.get(rule.equipmentId) ?? 0;
      const waiting = toConfirm.get(rule.equipmentId) ?? 0;
      const missing = Math.max(0, rule.quantity - Math.max(confirmed, waiting));
      return { ...rule, missing, waiting, confirmed };
    });
    const validity = [...current, ...waiting].filter((row) =>
      [row.equipment.caExpiresAt, row.stock?.lot.expiresAt].some((date) => date && date <= deadline)).length;
    return {
      person, current, waiting, open, checklist, validity, configured: unitRules.length > 0,
      unitsInUse: current.reduce((sum, row) => sum + row.quantity - row.returnedQuantity, 0),
      missing: checklist.filter((row) => row.missing).length,
    };
  }).filter((member) => {
    switch (pending) {
      case "confirmacao": return member.waiting.length > 0;
      case "pedidos": return member.open.length > 0;
      case "faltantes": return member.missing > 0;
      case "validade": return member.validity > 0;
      case "sem-configuracao": return member.person.active && !member.configured;
      default: return true;
    }
  });
  const summaries = [
    { label: "Colaboradores", total: members.length },
    { label: "Itens em uso", total: members.reduce((count, row) => count + row.unitsInUse, 0) },
    { label: "Recebimentos pendentes", total: members.reduce((count, row) => count + row.waiting.length, 0) },
    { label: "Pedidos em aberto", total: members.reduce((count, row) => count + row.open.length, 0) },
  ];
  const deliveryTable = (rows: typeof deliveries, confirmation: boolean) => <TeamTable label={confirmation ? "Recebimentos a confirmar" : "Itens em uso"}
    columns={["Item", "Qtd.", "Data da entrega", "Validade do equipamento", "Validade do CA", "Situação"]}
    rows={rows.map((row) => [row.id, row.equipment.name, row.quantity - row.returnedQuantity, formatDay(row.deliveredAt),
      <Validity value={row.stock?.lot.expiresAt ?? null} today={today} deadline={deadline} />,
      <Validity value={row.equipment.caExpiresAt} today={today} deadline={deadline} />,
      confirmation ? <span className="badge deadline-warning">A confirmar</span> : row.warehouseId ? "Em uso" : "Entrega anterior",
    ])} empty={confirmation ? "Nenhum recebimento pendente." : "Nenhum item em uso."} />;

  return <>
    <section className="panel team-overview-stats" aria-label="Resumo da equipe">
      <dl>{summaries.map(({ total, label }) => <div key={label}>
        <dt>{label}</dt><dd>{number.format(total)}</dd>
      </div>)}</dl>
    </section>
    <form className="panel team-filters" action={base} aria-label="Filtros da equipe">
      <div className="team-filter-row">
        <label className="field">Buscar colaborador
          <input name="q" type="search" maxLength={80} defaultValue={search} placeholder="Nome, matrícula ou terceirizada" />
        </label>
        <FilterSelect label="Pendências" name="pendencia" selected={pending} options={Object.entries(pendingOptions)} placeholder="Todas" />
        <div className="operation-actions">
          <button className="button primary" type="submit">Filtrar</button>
          {(search || unit || department || supervisor || pending || status) && <Link className="button" href={base}>Limpar</Link>}
        </div>
      </div>
      <details className="team-extra-filters" open={Boolean(unit || department || supervisor || status)}>
        <summary>Mais filtros <Icon name="expand_more" /></summary>
        <div className="team-filter-row">
          <FilterSelect label="Unidade" name="unidade" selected={unit} options={units} placeholder="Todas" />
          <FilterSelect label="Setor" name="setor" selected={department} options={departments} placeholder="Todos" />
          <FilterSelect label="Responsável da Gerência" name="supervisor" selected={supervisor} options={supervisors} placeholder="Todos" />
          <FilterSelect label="Situação" name="status" selected={status} options={[["ativo", "Ativo"], ["inativo", "Inativo"]]} placeholder="Todas" />
        </div>
      </details>
    </form>
    {members.length ? <div className="team-list">{members.map(({ person, current, waiting, open, checklist, validity, configured, unitsInUse, missing }) => {
      const supervisorAccess = person.scope?.active && person.scope.role === "SUPERVISOR";
      const canGrant = canGrantSupervisorAccess(scope) && (!person.scope || (person.scope.active && person.scope.role === "EMPLOYEE"));
      const expectedEmpty = !person.active ? "O acompanhamento de itens esperados se aplica aos colaboradores ativos." :
        configured ? "Nenhum item esperado para esta função pelas regras cadastradas." : "Itens esperados ainda não configurados para esta unidade.";
      return <details className="panel team-member" key={person.id}>
        <summary>
          <span className="team-name"><strong>{person.name}</strong><small>Matrícula {person.registration} · {person.jobTitle}
            {!person.active && " · Inativo"}</small></span>
          <span className="team-counts">
            <span><strong>{unitsInUse}</strong> Em uso</span>
            <span className={waiting.length ? "team-count-pending" : undefined}><strong>{waiting.length}</strong> A confirmar</span>
            <span><strong>{open.length}</strong> Em aberto</span>
            {(missing > 0 || validity > 0) && <span className="badge deadline-warning team-count-alert">
              {missing > 0 ? `${missing} em falta` : `${validity} com alerta de validade`}
            </span>}
          </span>
          <Icon name="expand_more" />
        </summary>
        <div className="team-member-role">
          <p>{person.unit.name} · {person.department}{person.supervisor && ` · Responsável da Gerência: ${person.supervisor.name}`}
            {" · "}{employeeCompanyName(scope.company.name, person.contractorCompany)}{supervisorAccess && " · Perfil Gerência"}</p>
          {person.active && <details className="team-actions">
            <summary className="button" aria-label={`Ações de ${person.name}`} title="Ações"><span aria-hidden="true">⋯</span></summary>
            <div className="panel">
              <Link className="text-action" href={`/${scope.companyId}/entregas?edit=ficha&colaborador=${encodeURIComponent(person.id)}`}>Registrar entregas anteriores</Link>
              {canGrant && <Link className="text-action" href={`${base}?encarregado=${encodeURIComponent(person.id)}`}>Dar acesso de Gerência</Link>}
            </div>
          </details>}
        </div>
        <TeamMemberTabs key={pending} label={`Acompanhamento de ${person.name}`}
          initialTab={pending === "confirmacao" ? 1 : pending === "pedidos" ? 2 : pending === "faltantes" || pending === "sem-configuracao" ? 3 : 0}
          tabs={[
            { label: "Em uso", content: deliveryTable(current, false) },
            { label: "A confirmar", content: deliveryTable(waiting, true) },
            { label: "Pedidos em aberto", content: <TeamTable label="Pedidos em aberto" columns={["Item", "Qtd.", "Data do pedido", "Situação"]}
              rows={open.map((item) => [item.id, item.equipment?.name ?? item.requestedItem ?? missingValue, item.quantity,
                formatDay(brazilDay(item.openedAt)), requestLabels[item.status]])} empty="Nenhum pedido em aberto." /> },
            { label: "Itens esperados", content: <TeamTable label="Itens esperados" columns={["Item", "Qtd. esperada", "Em uso", "A confirmar", "Situação"]}
              rows={checklist.map((item) => [item.equipmentId, item.equipment.name, item.quantity, item.confirmed, item.waiting,
                item.missing ? <span className="badge deadline-danger">Faltam {item.missing} un.</span> :
                  item.confirmed >= item.quantity ? "Recebido" : <span className="badge deadline-warning">A confirmar</span>,
              ])} empty={expectedEmpty} /> },
          ]} />
      </details>;
    })}</div> : <p className="panel team-empty">Nenhum colaborador encontrado para estes filtros.</p>}
  </>;
}
