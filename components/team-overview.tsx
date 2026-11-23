import Link from "next/link";
import { Icon } from "@/components/icon";
import type { Role } from "@/generated/prisma/enums";
import type { AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { canGrantSupervisorAccess } from "@/lib/directory";
import { operationalDeliveryWhere, requestWhere } from "@/lib/equipment-access";
import { jobTitleKey, latestByItem, requestLabels } from "@/lib/equipment";
import { openRequestStatuses } from "@/lib/reporting";

type TeamMember = {
  id: string;
  name: string;
  registration: string;
  contractorCompany: string | null;
  unitId: string;
  unit: { name: string };
  department: string;
  jobTitle: string;
  supervisor: { name: string } | null;
  scope: { role: Role; active: boolean } | null;
  active: boolean;
};

export async function TeamOverview({ scope, people, awaitingReceipt }: {
  scope: AccessScope;
  people: TeamMember[];
  awaitingReceipt: boolean;
}) {
  const employeeId = { in: people.map(({ id }) => id) };
  const [deliveries, requests, expected] = await Promise.all([
    db.delivery.findMany({
      where: { ...operationalDeliveryWhere(scope), employeeId },
      select: {
        id: true, employeeId: true, equipmentId: true, quantity: true, warehouseId: true,
        equipment: { select: { name: true } },
        receipt: { select: { deliveryId: true } },
        retirement: { select: { deliveryId: true } },
      },
      orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
    db.equipmentRequest.findMany({
      where: { ...requestWhere(scope), employeeId, status: { in: [...openRequestStatuses()] } },
      select: {
        id: true, employeeId: true, requestedItem: true, quantity: true, status: true,
        equipment: { select: { name: true } },
      },
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
    }),
    db.expectedItem.findMany({
      where: { companyId: scope.companyId, equipment: { active: true },
        OR: [{ unitId: null }, { unitId: { in: [...new Set(people.map(({ unitId }) => unitId))] } }] },
      select: { unitId: true, jobTitle: true, equipmentId: true, quantity: true, equipment: { select: { name: true } } },
      orderBy: { equipment: { name: "asc" } },
    }),
  ]);
  const deliveriesByPerson = Map.groupBy(deliveries, ({ employeeId }) => employeeId);
  const requestsByPerson = Map.groupBy(requests, ({ employeeId }) => employeeId);
  const members = people.map((person) => {
    const delivered = deliveriesByPerson.get(person.id) ?? [];
    const current = latestByItem(delivered.filter(({ receipt, warehouseId }) => receipt || !warehouseId)).filter(({ retirement }) => !retirement);
    const pending = delivered.filter(({ receipt, retirement, warehouseId }) => warehouseId && !receipt && !retirement);
    const open = requestsByPerson.get(person.id) ?? [];
    const byItem = new Map<string, (typeof expected)[number]>();
    if (person.active) {
      const job = jobTitleKey(person.jobTitle);
      for (const rule of expected) {
        if ((rule.unitId && rule.unitId !== person.unitId) || (rule.jobTitle && rule.jobTitle !== job)) continue;
        if (rule.quantity > (byItem.get(rule.equipmentId)?.quantity ?? 0)) byItem.set(rule.equipmentId, rule);
      }
    }
    const inUse = new Map(current.map((row) => [row.equipmentId, row.quantity]));
    const toConfirm = new Map(latestByItem(pending).map((row) => [row.equipmentId, row.quantity]));
    const checklist = [...byItem.values()].map((rule) => {
      const confirmed = inUse.get(rule.equipmentId) ?? 0;
      const waiting = toConfirm.get(rule.equipmentId) ?? 0;
      const missing = Math.max(0, rule.quantity - Math.max(confirmed, waiting));
      return { ...rule, missing, waiting, confirmed };
    });
    return { person, current, pending, open, checklist };
  }).filter(({ pending }) => !awaitingReceipt || pending.length);
  return members.length ? <div className="team-list">{members.map(({ person, current, pending, open, checklist }) => (
    <details className="panel team-member" key={person.id}>
      <summary>
        <Icon name="groups" />
        <span className="team-name"><strong>{person.name}</strong>
          <small>{person.unit.name} · Matrícula {person.registration}
            {person.contractorCompany && ` · Terceirizada: ${person.contractorCompany}`}{!person.active && " · Inativo"}</small>
        </span>
        <span className="team-counts">
          <span><strong>{current.length}</strong> Em uso</span>
          <span className={pending.length ? "team-count-pending" : undefined}><strong>{pending.length}</strong> A confirmar</span>
          <span><strong>{open.length}</strong> Em aberto</span>
          {checklist.some(({ missing }) => missing) && <span className="team-count-pending">
            <strong>{checklist.filter(({ missing }) => missing).length}</strong> Itens em falta
          </span>}
        </span>
        <Icon name="expand_more" />
      </summary>
      <div className="team-member-role">
        <p>{person.jobTitle} · {person.department}{person.supervisor && ` · Encarregado: ${person.supervisor.name}`}</p>
        {person.active && <div className="row-actions">
        <Link className="text-action" href={`/${scope.companyId}/entregas?edit=ficha&colaborador=${encodeURIComponent(person.id)}`}>Registrar entregas anteriores</Link>
        {canGrantSupervisorAccess(scope) && (
          person.scope?.active && person.scope.role === "SUPERVISOR" ? <span className="badge active">Perfil Encarregado</span> :
          (!person.scope || (person.scope.active && person.scope.role === "EMPLOYEE")) &&
          <Link className="text-action" href={`/${scope.companyId}/colaboradores?encarregado=${encodeURIComponent(person.id)}`}>Dar acesso de encarregado</Link>
        )}
        </div>}
      </div>
      <div className="team-details">
        <section><h2>Itens em uso</h2>{current.length ?
          <ul>{current.map((item) => <li key={item.id}>{item.equipment.name} <small>· Qtd. {item.quantity}</small></li>)}</ul> :
          <p>Nenhum item em uso.</p>}</section>
        <section><h2>Aguardando confirmação</h2>{pending.length ?
          <ul>{pending.map((item) => <li key={item.id}>{item.equipment.name} <small>· Qtd. {item.quantity}</small></li>)}</ul> :
          <p>Nenhum recebimento pendente.</p>}</section>
        <section><h2>Pedidos em aberto</h2>{open.length ?
          <ul>{open.map((item) => <li key={item.id}>{item.equipment?.name ?? item.requestedItem}
            <small> · Qtd. {item.quantity} · {requestLabels[item.status]}</small></li>)}</ul> :
          <p>Nenhum pedido em aberto.</p>}</section>
        {person.active && <section><h2>Itens esperados</h2>{checklist.length ?
          <ul>{checklist.map((item) => <li key={item.equipmentId}>
            <strong>{item.equipment.name}</strong> <small>· Esperado {item.quantity} un.</small>
            <br /><span className={`badge ${item.missing ? "deadline-danger" : item.confirmed >= item.quantity ? "active" : "deadline-warning"}`}>
              {item.missing ? `Faltam ${item.missing} un.` : item.confirmed >= item.quantity ? "Recebido" : "A confirmar"}
            </span>
          </li>)}</ul> : <p>Nenhum item esperado para esta função ou unidade.</p>}</section>}
      </div>
    </details>))}</div> : <div className="panel"><p className="empty">{awaitingReceipt ?
      "Ninguém nesta lista está aguardando confirmação." : "Nenhum colaborador encontrado."}</p></div>;
}
