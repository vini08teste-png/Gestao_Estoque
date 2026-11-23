import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { grantSupervisorAccess, resetUserPassword, saveCompany, saveEmployee, saveUnit, saveUser } from "@/app/organization-actions";
import { AccessScopeFields } from "@/components/access-scope-fields";
import { ActionForm } from "@/components/action-form";
import { Catalog, Deliveries, ExpectedItems, Inventory, Requests, Rules } from "@/components/equipment-pages";
import { Alerts, Dashboard, Reports } from "@/components/reporting-pages";
import { TeamOverview } from "@/components/team-overview";
import { sections, Workspace, type Section } from "@/components/workspace";
import { canAdminister, requireScope, type AccessScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAddEmployees, canGrantSupervisorAccess, employeesWhere, unitsWhere } from "@/lib/directory";
import { companyBrands, isCompany, roles } from "@/lib/organization";
import { passwordLength } from "@/lib/password";
import type { Role } from "@/generated/prisma/enums";

type Query = { [key: string]: string | string[] | undefined };

function Heading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>;
}

function Table({ label, columns, rows }: { label: string; columns: string[]; rows: ReactNode[][] }) {
  return (
    <section className="panel">
      {rows.length ? (
        <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
          <table aria-label={label}>
            <thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
            <tbody>{rows.map(([key, ...cells]) => <tr key={String(key)}>{cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <p className="empty">Nenhum registro encontrado.</p>}
    </section>
  );
}

function Status({ active }: { active: boolean }) {
  return <span className={`badge ${active ? "active" : ""}`}>{active ? "Ativo" : "Inativo"}</span>;
}

function NewLink({ base, children }: { base: string; children: ReactNode }) {
  return <Link className="button primary" href={`${base}?edit=novo`}>{children}</Link>;
}

function EditLink({ base, id, label }: { base: string; id: string; label: string }) {
  return <Link className="text-action" aria-label={`Editar ${label}`} href={`${base}?edit=${encodeURIComponent(id)}`}>Editar</Link>;
}

function Editor({ title, base, children }: { title: string; base: string; children: ReactNode }) {
  return (
    <section className="panel editor" aria-labelledby="editor-title">
      <div className="panel-heading"><h2 id="editor-title">{title}</h2><Link href={base} className="text-action">Voltar à lista</Link></div>
      {children}
    </section>
  );
}

function ActiveField({ active = true }: { active?: boolean }) {
  return <label className="check"><input name="active" type="checkbox" defaultChecked={active} /> Cadastro ativo</label>;
}

function TextField({ label, name, value, max = 120 }: { label: string; name: string; value?: string; max?: number }) {
  return <label className="field">{label}<input name={name} defaultValue={value} maxLength={max} required /></label>;
}

async function Units({ scope, edit }: { scope: AccessScope; edit: string }) {
  const where = unitsWhere(scope);
  const units = await db.unit.findMany({ where, orderBy: { name: "asc" } });
  const admin = canAdminister(scope);
  const base = `/${scope.companyId}/unidades`;
  const current = units.find(({ id }) => id === edit);
  if (edit && (!admin || (edit !== "novo" && !current))) notFound();
  return (
    <>
      <Heading title="Unidades" description={scope.company.name}
        action={admin && !edit && <NewLink base={base}>Nova unidade</NewLink>} />
      {edit ? (
        <Editor title={current ? "Editar unidade" : "Nova unidade"} base={base}>
          <ActionForm key={edit} action={saveUnit.bind(null, scope.companyId, current?.id ?? null)} reset={!current}>
            <TextField name="name" label="Nome da unidade" value={current?.name} />
            <ActiveField active={current?.active} />
          </ActionForm>
        </Editor>
      ) : (
        <Table label="Unidades" columns={["Nome", "Situação", ...(admin ? ["Ação"] : [])]}
          rows={units.map((unit) => [unit.id, unit.name, <Status active={unit.active} />,
            ...(admin ? [<EditLink base={base} id={unit.id} label={unit.name} />] : [])])} />
      )}
    </>
  );
}

async function Employees({ scope, edit, supervisorAccess, query, status, awaitingReceipt }: {
  scope: AccessScope; edit: string; supervisorAccess: string; query: string; status: string; awaitingReceipt: boolean;
}) {
  const admin = canAdminister(scope);
  const canCreate = canAddEmployees(scope);
  const companyId = scope.companyId;
  const base = `/${companyId}/colaboradores`;
  const team = scope.role === "MANAGER" || scope.role === "SUPERVISOR";
  const title = scope.role === "EMPLOYEE" ? "Meu cadastro" : scope.role === "SUPERVISOR" ? "Minha equipe" : team ? "Equipe" : "Colaboradores";
  if (supervisorAccess) {
    if (!canGrantSupervisorAccess(scope)) notFound();
    const person = await db.employee.findFirst({
      where: { ...employeesWhere(scope), id: supervisorAccess, active: true },
      select: { id: true, name: true, unit: { select: { name: true } }, scope: { select: { active: true, role: true } } },
    });
    if (!person) notFound();
    return <>
      <Heading title="Acesso de encarregado" description={`${person.name} · ${person.unit.name}`} />
      <Editor title="Perfil de acesso" base={base}>
        {person.scope?.active && person.scope.role === "SUPERVISOR" ? (
          <p className="empty" role="status">Acesso de encarregado ativo.</p>
        ) : person.scope && (!person.scope.active || person.scope.role !== "EMPLOYEE") ? (
          <p className="empty">Peça a um administrador para revisar o perfil atual desta pessoa.</p>
        ) : (
          <ActionForm key={person.id} action={grantSupervisorAccess.bind(null, companyId, person.id)} label="Dar acesso de encarregado">
            {person.scope ? <p>A pessoa continuará usando o mesmo e-mail e a mesma senha.</p> :
              <div className="form-grid">
                <label className="field">E-mail de acesso<input name="email" type="email" maxLength={254} autoComplete="off" required /></label>
                <label className="field">Senha temporária<input name="password" type="password" autoComplete="new-password"
                  minLength={passwordLength.min} maxLength={passwordLength.max} required />
                  <small>A pessoa deverá criar uma nova senha no primeiro acesso.</small>
                </label>
              </div>}
          </ActionForm>
        )}
      </Editor>
    </>;
  }
  if (edit) {
    if (!(edit === "novo" ? canCreate : admin)) notFound();
    const [current, units, people] = await Promise.all([
      edit === "novo" ? null : db.employee.findUnique({ where: { companyId_id: { companyId, id: edit } } }),
      db.unit.findMany({ where: unitsWhere(scope), orderBy: { name: "asc" } }),
      scope.role === "SUPERVISOR" ? [] : db.employee.findMany({
        where: { ...employeesWhere(scope), id: { not: edit } }, include: { unit: true }, orderBy: { name: "asc" },
      }),
    ]);
    if (edit !== "novo" && !current) notFound();
    return (
      <>
        <Heading title={title} description={scope.company.name} />
        <Editor title={current ? "Editar colaborador" : "Novo colaborador"} base={base}>
          {units.length ? (
            <ActionForm key={edit} action={saveEmployee.bind(null, companyId, current?.id ?? null)} reset={!current}>
              <div className="form-grid">
                <TextField name="registration" label="Matrícula" value={current?.registration} max={32} />
                <TextField name="name" label="Nome completo" value={current?.name} />
                <label className="field">Empresa terceirizada (opcional)
                  <input name="contractorCompany" defaultValue={current?.contractorCompany ?? ""} maxLength={120} placeholder="Ex.: LUK" />
                  <small>Informe a empresa empregadora se o colaborador for terceirizado.</small>
                </label>
                <label className="field">Unidade<select name="unit" defaultValue={current?.unitId ?? ""} required>
                  <option value="" disabled>Selecione</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{!unit.active ? " (inativa)" : ""}</option>)}
                </select></label>
                {scope.role !== "SUPERVISOR" && <label className="field">Encarregado responsável<select name="supervisor" defaultValue={current?.supervisorId ?? ""}>
                  <option value="">Sem encarregado</option>
                  {people.map((person) => <option key={person.id} value={person.id}>
                    {person.name}{person.contractorCompany && ` · ${person.contractorCompany}`} · {person.unit.name}</option>)}
                </select><small>Escolha o encarregado da mesma unidade. Ele pode ser de uma empresa terceirizada.</small></label>}
                <TextField name="department" label="Setor" value={current?.department} />
                <TextField name="jobTitle" label="Função" value={current?.jobTitle} />
              </div>
              <ActiveField active={current?.active} />
            </ActionForm>
          ) : <p className="empty">Nenhuma unidade está disponível para este cadastro. {admin && <Link className="text-action" href={`/${companyId}/unidades?edit=novo`}>Cadastrar unidade</Link>}</p>}
        </Editor>
      </>
    );
  }
  const people = await db.employee.findMany({
    where: {
      ...employeesWhere(scope),
      ...(status === "ativo" || status === "inativo" ? { active: status === "ativo" } : {}),
      ...(query ? { OR: [
        { name: { contains: query, mode: "insensitive" } },
        { registration: { contains: query, mode: "insensitive" } },
        { contractorCompany: { contains: query, mode: "insensitive" } },
      ] } : {}),
    },
    include: { unit: { select: { name: true } }, supervisor: { select: { name: true } }, scope: { select: { userId: true, role: true, active: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <Heading title={title} description={team ? "Veja o que cada pessoa tem em uso e o que está pendente." : scope.company.name}
        action={canCreate && <NewLink base={base}>Novo colaborador</NewLink>} />
      {scope.role !== "EMPLOYEE" && (
        <form className="filters" action={base}>
          <label className="field">Nome, matrícula ou terceirizada<input name="q" type="search" maxLength={80} defaultValue={query} /></label>
          <label className="field">Situação<select name="status" defaultValue={status}>
            <option value="">Todas</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option>
          </select></label>
          {team && <label className="field">Recebimento<select name="pendencia" defaultValue={awaitingReceipt ? "confirmacao" : ""}>
            <option value="">Todos</option><option value="confirmacao">Aguardando confirmação</option>
          </select></label>}
          <button className="button" type="submit">Filtrar</button>
        </form>
      )}
      {team ? <TeamOverview scope={scope} people={people} awaitingReceipt={awaitingReceipt} /> :
      <Table label={title} columns={["Matrícula", "Nome", "Empresa terceirizada", "Unidade", "Setor", "Função", "Encarregado", "Situação", ...(admin ? ["Ação"] : [])]}
        rows={people.map((person) => [person.id, person.registration, person.name, person.contractorCompany ?? "—", person.unit.name, person.department,
          person.jobTitle, person.supervisor?.name ?? "—", <Status active={person.active} />,
          ...(admin ? [<div className="row-actions">
            <EditLink base={base} id={person.id} label={person.name} />
            <Link className="text-action" aria-label={`Configurar acesso de ${person.name}`}
              href={`/${companyId}/usuarios?${person.scope ? `edit=${encodeURIComponent(person.scope.userId)}` :
                `edit=novo&colaborador=${encodeURIComponent(person.id)}`}`}>Configurar acesso</Link>
            {person.active && <Link className="text-action" aria-label={`Registrar ficha de papel de ${person.name}`}
              href={`/${companyId}/entregas?edit=ficha&colaborador=${encodeURIComponent(person.id)}`}>Registrar ficha de papel</Link>}
          </div>] : [])])} />}
    </>
  );
}

async function Users({ scope, edit, viewerId, profile, employeeId }: {
  scope: AccessScope; edit: string; viewerId: string; profile?: Role; employeeId: string;
}) {
  const companyId = scope.companyId;
  const base = `/${companyId}/usuarios`;
  if (!canAdminister(scope)) notFound();
  if (edit) {
    const [current, units, employees] = await Promise.all([
      edit === "novo" ? null : db.userScope.findUnique({
        where: { companyId_userId: { companyId, userId: edit } },
        include: { user: { select: { email: true } }, units: { select: { unitId: true } } },
      }),
      db.unit.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
      db.employee.findMany({
        where: { companyId, OR: [{ scope: null }, { scope: { userId: edit } }] },
        select: { id: true, name: true, contractorCompany: true, unit: { select: { name: true } } }, orderBy: { name: "asc" },
      }),
    ]);
    if (edit !== "novo" && !current) notFound();
    const person = !current ? employees.find((entry) => entry.id === employeeId) : undefined;
    return (
      <>
        <Heading title="Acessos e perfis" description={scope.company.name} />
        <Editor title={current ? "Editar acesso" : "Novo acesso"} base={base}>
          <ActionForm key={edit} action={saveUser.bind(null, companyId, current?.userId ?? null)} reset={!current}>
            <div className="form-grid">
              <TextField name="name" label="Nome de exibição" value={current?.name ?? person?.name} />
              <label className="field">E-mail usado no login
                <input name="email" type="email" autoComplete="username" defaultValue={current?.user.email} maxLength={254} readOnly={!!current} required />
                {!current && <small>Use o e-mail da conta. Se ela já existir, informe o mesmo endereço para vincular o acesso.</small>}
              </label>
              {!current && (
                <label className="field">Senha temporária<input name="password" type="password" autoComplete="new-password" minLength={passwordLength.min} maxLength={passwordLength.max} />
                  <small>Defina para contas novas. A pessoa trocará essa senha no primeiro login. Para uma conta existente, deixe em branco.</small>
                </label>
              )}
            </div>
            <AccessScopeFields employees={employees} units={units} defaults={{
              role: current?.role ?? profile ?? "EMPLOYEE", employeeId: current?.employeeId ?? person?.id ?? "",
              allUnits: current?.allUnits ?? false, unitIds: current?.units.map(({ unitId }) => unitId) ?? [],
            }} />
            <ActiveField active={current?.active} />
          </ActionForm>
        </Editor>
        {current && current.userId !== viewerId && <details className="panel editor password-admin">
          <summary>Redefinir senha</summary>
          <ActionForm action={resetUserPassword.bind(null, companyId, current.userId)} label="Redefinir senha" reset>
            <p>Isso encerra as sessões da conta. Informe a senha temporária à pessoa por um canal privado.</p>
            <label className="field">Nova senha temporária
              <input name="temporaryPassword" type="password" autoComplete="new-password" minLength={passwordLength.min} maxLength={passwordLength.max} required />
            </label>
          </ActionForm>
        </details>}
      </>
    );
  }
  const users = await db.userScope.findMany({
    where: { companyId, ...(profile && { role: profile }) },
    include: {
      user: { select: { email: true } },
      units: { include: { unit: { select: { name: true } } } },
      employee: { select: { unit: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <Heading title="Acessos e perfis" description={scope.company.name}
        action={<Link className="button primary" href={`${base}?edit=novo${profile ? `&perfil=${profile}` : ""}`}>Novo acesso</Link>} />
      <details className="panel access-guide">
        <summary>Como atribuir perfis e permissões</summary>
        <div className="access-guide-content">
          <p>Em <strong>Colaboradores</strong>, use <strong>Configurar acesso</strong> na linha da pessoa. Informe o e-mail de login e escolha o perfil.</p>
          <dl>{(["WAREHOUSE", "SUPERVISOR", "MANAGER"] as const).map((role) => <div key={role}>
            <dt>{roles[role]}</dt><dd>{role === "WAREHOUSE" ? "Marque as unidades na edição do acesso."
              : role === "SUPERVISOR" ? "Selecione a pessoa no campo Encarregado responsável no cadastro de cada membro da equipe." : "Marque as unidades que o gestor acompanha."}</dd>
          </div>)}</dl>
        </div>
      </details>
      <form className="filters" action={base}>
        <label className="field">Perfil<select name="perfil" defaultValue={profile ?? ""}>
          <option value="">Todos os perfis</option>{Object.entries(roles).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label><button className="button" type="submit">Filtrar</button>
      </form>
      <Table label="Acessos e perfis" columns={["Nome", "E-mail de login", "Perfil", "Unidades", "Situação", "Ação"]}
        rows={users.map((user) => [user.userId, user.name, user.user.email, roles[user.role],
          user.allUnits ? "Todas" : user.role === "EMPLOYEE" || user.role === "SUPERVISOR" ? user.employee?.unit.name ?? "—" :
            (user.units.map(({ unit }) => unit.name).sort().join(", ") || "—"),
          <Status active={user.active} />, <EditLink base={base} id={user.userId} label={user.name} />])} />
    </>
  );
}

function Company({ scope }: { scope: AccessScope }) {
  if (!canAdminister(scope) || !isCompany(scope.companyId)) notFound();
  return (
    <>
      <Heading title="Empresa" description={companyBrands[scope.companyId].label} />
      <section className="panel editor" aria-label="Dados da empresa">
        <ActionForm action={saveCompany.bind(null, scope.companyId)}>
          <TextField name="name" label="Nome de exibição" value={scope.company.name} />
        </ActionForm>
      </section>
    </>
  );
}

export default async function CompanyPage({ params, searchParams }: {
  params: Promise<{ companyId: string; path?: string[] }>;
  searchParams: Promise<Query>;
}) {
  const { companyId, path = [] } = await params;
  if (!isCompany(companyId) || path.length > 1) notFound();
  const section = (path[0] ?? "dashboard") as Section;
  if (!Object.hasOwn(sections, section)) notFound();
  const { scope, viewer } = await requireScope(companyId);
  const search = await searchParams;
  const edit = typeof search.edit === "string" ? search.edit : "";
  const query = typeof search.q === "string" ? search.q.trim().slice(0, 80) : "";
  const status = search.status === "ativo" || search.status === "inativo" ? search.status : "";
  const companies = viewer.scopes.map((entry) => entry.company);
  const content = {
    dashboard: <Dashboard scope={scope} />,
    unidades: <Units scope={scope} edit={edit} />,
    colaboradores: <Employees scope={scope} edit={edit} query={query} status={status}
      supervisorAccess={typeof search.encarregado === "string" ? search.encarregado : ""} awaitingReceipt={search.pendencia === "confirmacao"} />,
    usuarios: <Users scope={scope} edit={edit} viewerId={viewer.id}
      profile={typeof search.perfil === "string" && Object.hasOwn(roles, search.perfil) ? search.perfil as Role : undefined}
      employeeId={typeof search.colaborador === "string" ? search.colaborador : ""} />,
    empresa: <Company scope={scope} />,
    epis: <Catalog scope={scope} edit={edit} />,
    estoque: <Inventory scope={scope} operation={typeof search.acao === "string" ? search.acao : ""}
      warehouseId={typeof search.almoxarifado === "string" ? search.almoxarifado : ""} />,
    entregas: <Deliveries scope={scope} create={edit === "novo"} paper={edit === "ficha"}
      employeeId={(edit === "ficha" || search.registrada === "ficha") && typeof search.colaborador === "string" ? search.colaborador : ""}
      requestId={typeof search.solicitacao === "string" ? search.solicitacao : ""}
      registered={search.registrada === "ficha" || search.registrada === "1" ? search.registrada : ""} />,
    solicitacoes: <Requests scope={scope} edit={edit} status={typeof search.status === "string" ? search.status : ""}
      queue={typeof search.fila === "string" ? search.fila : ""} sent={search.enviada === "1"} />,
    "meus-epis": <Deliveries scope={scope} create={false} requestId="" registered="" personal retired={search.retirado === "1"} />,
    "minhas-solicitacoes": <Requests scope={scope} edit={edit} status={typeof search.status === "string" ? search.status : ""}
      sent={search.enviada === "1"} personal />,
    alertas: <Alerts scope={scope} query={search} />,
    relatorios: <Reports scope={scope} query={search} />,
    "regras-aprovacao": <Rules scope={scope} />,
    "itens-esperados": <ExpectedItems scope={scope} />,
  };
  return <Workspace scope={scope} companies={companies} section={section}>{content[section]}</Workspace>;
}
