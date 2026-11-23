import { Icon } from "@/components/icon";
import type { AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { operationalDeliveryWhere, requestWhere } from "@/lib/equipment-access";
import { latestByItem, requestLabels } from "@/lib/equipment";
import { openRequestStatuses } from "@/lib/reporting";

type TeamMember = {
  id: string;
  name: string;
  registration: string;
  contractorCompany: string | null;
  unit: { name: string };
  department: string;
  jobTitle: string;
  supervisor: { name: string } | null;
  active: boolean;
};

export async function TeamOverview({ scope, people, awaitingReceipt }: {
  scope: AccessScope;
  people: TeamMember[];
  awaitingReceipt: boolean;
}) {
  const employeeId = { in: people.map(({ id }) => id) };
  const [deliveries, requests] = await Promise.all([
    db.delivery.findMany({
      where: { ...operationalDeliveryWhere(scope), employeeId },
      select: {
        id: true, employeeId: true, equipmentId: true, quantity: true,
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
  ]);
  const deliveriesByPerson = Map.groupBy(deliveries, ({ employeeId }) => employeeId);
  const requestsByPerson = Map.groupBy(requests, ({ employeeId }) => employeeId);
  const members = people.map((person) => {
    const delivered = deliveriesByPerson.get(person.id) ?? [];
    const current = latestByItem(delivered.filter(({ receipt }) => receipt)).filter(({ retirement }) => !retirement);
    const pending = delivered.filter(({ receipt, retirement }) => !receipt && !retirement);
    const open = requestsByPerson.get(person.id) ?? [];
    return { person, current, pending, open };
  }).filter(({ pending }) => !awaitingReceipt || pending.length);
  return members.length ? <div className="team-list">{members.map(({ person, current, pending, open }) => (
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
        </span>
        <Icon name="expand_more" />
      </summary>
      <p className="team-member-role">{person.jobTitle} · {person.department}{person.supervisor && ` · Encarregado: ${person.supervisor.name}`}</p>
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
      </div>
    </details>))}</div> : <div className="panel"><p className="empty">{awaitingReceipt ?
      "Ninguém nesta lista está aguardando confirmação." : "Nenhum colaborador encontrado."}</p></div>;
}
