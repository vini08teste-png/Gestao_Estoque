import Link from "next/link";
import { logout } from "@/app/auth-actions";
import { Brand } from "@/components/brand";
import { CompanySelect } from "@/components/company-select";
import { Icon } from "@/components/icon";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { WorkspaceNavLink } from "@/components/workspace-nav-link";
import { canAdminister, type AccessScope } from "@/lib/auth";
import { inventoryTitle, itemCatalogTitle, roles } from "@/lib/organization";
import { hasPersonalEquipment } from "@/lib/equipment-access";

export const sections = {
  dashboard: "Visão geral",
  colaboradores: "Colaboradores",
  unidades: "Unidades",
  usuarios: "Acessos e perfis",
  empresa: "Empresa",
  manutencao: "Manutenção",
  epis: itemCatalogTitle,
  estoque: inventoryTitle,
  entregas: "Histórico",
  solicitacoes: "Solicitações",
  "meus-epis": "Meus itens",
  "minhas-solicitacoes": "Solicitações",
  alertas: "Alertas",
  relatorios: "Relatórios",
  "regras-aprovacao": "Regras de aprovação",
  "itens-esperados": "Itens esperados",
};

export type Section = keyof typeof sections;

const sectionIcons: Record<Section, string> = {
  dashboard: "dashboard",
  colaboradores: "groups",
  unidades: "corporate_fare",
  usuarios: "manage_accounts",
  empresa: "domain",
  manutencao: "manage_accounts",
  epis: "category",
  estoque: "inventory_2",
  entregas: "history",
  solicitacoes: "list_alt",
  "meus-epis": "shield",
  "minhas-solicitacoes": "receipt_long",
  alertas: "notifications",
  relatorios: "bar_chart",
  "regras-aprovacao": "rule",
  "itens-esperados": "list_alt",
};

export function Workspace({ scope, companies, section, children }: {
  scope: AccessScope;
  companies: { id: string; name: string }[];
  section: Section;
  children: React.ReactNode;
}) {
  const company = scope.companyId === "lynx" ? "lynx" : "tsa";
  const admin = canAdminister(scope);
  const personal = hasPersonalEquipment(scope);
  const employee = scope.role === "EMPLOYEE";
  const groups: { heading: string; items: Section[] }[] = [
    { heading: "", items: ["dashboard"] },
    { heading: "Minha área", items: personal ? ["meus-epis", ...(employee ? ["minhas-solicitacoes", "colaboradores"] as const : [])] : [] },
    { heading: "Operação", items: employee ? [] : ["solicitacoes", "colaboradores", "entregas", "estoque", "epis"] },
    { heading: "Acompanhamento", items: employee ? [] : ["alertas", "relatorios"] },
    { heading: admin ? "Administração" : "Cadastros", items: admin ? ["usuarios", "unidades", "itens-esperados", "regras-aprovacao", "empresa"] : ["unidades"] },
  ];
  const label = (item: Section) => {
    if (employee) {
      if (item === "colaboradores") return "Meu cadastro";
    }
    if (item === "colaboradores" && scope.role === "SUPERVISOR") return "Minha equipe";
    return item === "colaboradores" && scope.role === "MANAGER" ? "Equipe" : sections[item];
  };
  const links = groups.filter(({ items }) => items.length).map(({ heading, items }) => (
    <div className="nav-group" key={heading || "inicio"}>
      {heading && <p className="nav-group-label">{heading}</p>}
      {items.map((item) => (
        <WorkspaceNavLink key={item} active={section === item || (section === "minhas-solicitacoes" && item === "solicitacoes")}
          href={item === "dashboard" ? `/${company}` : `/${company}/${item}`} icon={sectionIcons[item]} label={label(item)} />
      ))}
    </div>
  ));
  const account = (
    <div className="account">
      <div className="account-info"><strong>{scope.name}</strong><small>{roles[scope.role]}</small></div>
      <Link href="/conta/senha" className="account-password" title="Trocar senha" aria-label="Trocar senha">
        <Icon name="lock_reset" /><span className="account-action-label">Trocar senha</span>
      </Link>
      <form action={logout}><button className="logout" type="submit" title="Sair" aria-label="Sair">
        <Icon name="logout" /><span className="account-action-label">Sair</span>
      </button></form>
    </div>
  );
  return (
    <div className="shell" data-company={company}>
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <aside className="sidebar" id="epi-sidebar">
        <Link href={`/${company}`} className="site-brand"><Brand company={company} variant="white" /></Link>
        <nav className="main-nav" aria-label="Menu principal">{links}</nav>
        {account}
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-start"><SidebarToggle />
            <div className="breadcrumb"><span>Gestão de EPIs</span><span aria-hidden="true">/</span><strong>{label(section)}</strong></div>
          </div>
          {admin && companies.length > 1 ? (
            <CompanySelect companyId={company} companies={companies}
              section={section === "alertas" || section === "relatorios" ? section : undefined} />
          ) : (
            <span className="company-context">{scope.company.name}</span>
          )}
        </header>
        <details className="mobile-menu" key={`${company}/${section}`}>
          <summary><Brand company={company} variant="white" /><span className="mobile-menu-label">Menu <Icon name="expand_more" /></span></summary>
          <nav className="main-nav" aria-label="Menu principal">{links}</nav>
          {account}
        </details>
        <main className="content" id="conteudo" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
