import { loadViewer } from "@/lib/auth";
import { canViewReports, encodeCsv, individualReport, reportFilters, reportKind, reportRows, reportingUnits, type Query } from "@/lib/reporting";

const noCache = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const viewer = await loadViewer();
  const scope = viewer?.scopes.find((entry) => entry.companyId === companyId);
  if (viewer?.mustChangePassword || !scope || !canViewReports(scope)) return new Response(null, { status: 404, headers: noCache });
  const entries = new URL(request.url).searchParams;
  if (entries.get("tipo") === individualReport) return new Response(null, { status: 404, headers: noCache });
  const query: Query = {};
  for (const key of ["tipo", "unidade", "inicio", "fim"]) query[key] = entries.get(key) ?? undefined;
  const kind = reportKind(query);
  const filters = reportFilters(query, await reportingUnits(scope));
  if (filters.error) return new Response(filters.error, { status: 400, headers: noCache });
  return new Response(encodeCsv(await reportRows(scope, kind, filters)), {
    headers: {
      ...noCache,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="epis-${companyId}-${kind}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
