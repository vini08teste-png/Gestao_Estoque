import Link from "next/link";
import { HistoryImportForm } from "@/components/history-import-form";
import { RowActions } from "@/components/row-actions";
import type { AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDay, inputDay } from "@/lib/equipment";

const actions = [
  ["colaboradores", "Colaboradores"],
  ["entregas", "Histórico"],
  ["epis", "Cadastro de itens"],
  ["estoque", "Estoque"],
  ["unidades", "Unidades"],
  ["usuarios", "Acessos e perfis"],
  ["solicitacoes", "Solicitações"],
  ["empresa", "Empresa"],
];

export async function AdminMaintenance({ scope, query }: { scope: AccessScope; query: string }) {
  const { companyId } = scope;
  const base = `/${companyId}`;
  const [units, contracts, people] = await Promise.all([
    db.unit.findMany({ where: { companyId, active: true }, select: { id: true, name: true, active: true }, orderBy: { name: "asc" } }),
    db.warehouse.findMany({ where: { companyId, active: true, contractNumber: { not: null }, unit: { active: true } },
      select: { id: true, unitId: true, contractNumber: true }, orderBy: { contractNumber: "asc" } }),
    query ? db.employee.findMany({
      where: { companyId, OR: [{ name: { contains: query, mode: "insensitive" } }, { registration: { equals: query, mode: "insensitive" } }] },
      select: { id: true, name: true, registration: true, active: true, unit: { select: { name: true } } },
      orderBy: { name: "asc" }, take: 20,
    }) : [],
  ]);
  const deliveries = people.length ? await db.delivery.findMany({
    where: { companyId, employeeId: { in: people.map(({ id }) => id) }, voidedAt: null },
    select: { id: true, quantity: true, deliveredAt: true, employee: { select: { name: true } }, equipment: { select: { name: true } } },
    orderBy: [{ deliveredAt: "desc" }, { id: "asc" }], take: 30,
  }) : [];
  return <>
    <header className="page-heading"><div><h1>Manutenção administrativa</h1><p>{scope.company.name}</p></div></header>
    <nav className="operation-actions" aria-label="Atalhos de manutenção">
      {actions.map(([path, label]) => <Link className="button" key={path} href={`${base}/${path}`}>{label}</Link>)}
    </nav>
    <h2 className="section-title">Consultar registros</h2>
    <form className="filters" action={`${base}/manutencao`}>
      <label className="field">Nome ou matrícula<input type="search" name="q" defaultValue={query} maxLength={100} required /></label>
      <button className="button">Buscar</button>
    </form>
    {query && <>
      <section className="panel" aria-label="Colaboradores encontrados">
        <div className="panel-heading"><h3>Colaboradores encontrados</h3></div>
        {people.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Colaboradores">
          <table>
            <thead><tr><th scope="col">Colaborador</th><th scope="col">Unidade</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead>
            <tbody>{people.map((person) => <tr key={person.id}>
              <td>{person.name} <small>({person.registration})</small></td><td>{person.unit.name}</td>
              <td>{person.active ? "Ativo" : "Inativo"}</td>
              <td><RowActions id={`maintenance-person-${person.id}`} label={`Ações de ${person.name}`}>
                <Link className="text-action" href={`${base}/colaboradores?edit=${encodeURIComponent(person.id)}`}>Editar cadastro</Link>
                <Link className="text-action" href={`${base}/entregas?q=${encodeURIComponent(person.registration)}`}>Ver histórico completo</Link>
                <Link className="text-action danger" href={`${base}/colaboradores?apagar=${encodeURIComponent(person.id)}`}>Apagar colaborador</Link>
              </RowActions></td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="empty">Nenhum colaborador encontrado.</p>}
      </section>
      {people.length > 0 && <section className="panel" aria-label="Entregas encontradas">
        <div className="panel-heading"><h3>Entregas mais recentes</h3></div>
        {deliveries.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Entregas">
          <table>
            <thead><tr>{["Item", "Colaborador", "Quantidade", "Data da entrega", "Ações"].map((label) =>
              <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{deliveries.map((row) => <tr key={row.id}>
              <td>{row.equipment.name}</td><td>{row.employee.name}</td><td>{row.quantity}</td>
              <td><time className="delivery-day" dateTime={inputDay(row.deliveredAt)}>{formatDay(row.deliveredAt)}</time></td>
              <td><RowActions id={`maintenance-delivery-${row.id}`} label={`Ações da entrega de ${row.equipment.name}`}>
                <Link className="text-action" href={`${base}/entregas?edit=${encodeURIComponent(row.id)}`}>Editar entrega</Link>
                <Link className="text-action" href={`${base}/entregas?apagar=${encodeURIComponent(row.id)}`}>Apagar entrega</Link>
              </RowActions></td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="empty">Nenhuma entrega registrada.</p>}
      </section>}
    </>}
    <h2 className="section-title">Importar entregas anteriores</h2>
    <p>Confira os vínculos antes de gravar. Os registros entram no Histórico sem movimentar o estoque.</p>
    {units.length > 0 ? <HistoryImportForm companyId={companyId} units={units} contracts={contracts} /> :
      <p className="feedback">Cadastre uma unidade ativa para importar as entregas.</p>}
  </>;
}
