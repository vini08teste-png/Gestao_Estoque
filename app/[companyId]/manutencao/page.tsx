import { AdminMaintenance } from "@/components/admin-maintenance";
import { Workspace } from "@/components/workspace";
import { requireMaintenanceAccess } from "@/lib/admin-maintenance-access";

export default async function MaintenancePage({ params, searchParams }: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { companyId } = await params;
  const { scope, viewer } = await requireMaintenanceAccess(companyId);
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  return <Workspace scope={scope} companies={viewer.scopes.map(({ company }) => company)} section="manutencao">
    <AdminMaintenance scope={scope} query={query} />
  </Workspace>;
}
