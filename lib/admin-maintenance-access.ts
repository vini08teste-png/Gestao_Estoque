import "server-only";
import { notFound } from "next/navigation";
import { canAdminister, requireScope } from "./auth";

export async function requireMaintenanceAccess(companyId: string) {
  const access = await requireScope(companyId);
  if (!canAdminister(access.scope) || access.viewer.id !== process.env.EPI_MAINTENANCE_USER_ID) notFound();
  return access;
}
