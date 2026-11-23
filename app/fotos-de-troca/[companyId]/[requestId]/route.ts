import { createHash } from "node:crypto";
import { replacementPhotoTypes } from "@/lib/attachment-limits";
import { loadViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { ownEmployeeId, requestWhere } from "@/lib/equipment-access";

const privateHeaders = { "Cache-Control": "private, no-store" };
const unavailable = () => new Response(null, { status: 404, headers: privateHeaders });

export async function GET(_: Request, { params }: { params: Promise<{ companyId: string; requestId: string }> }) {
  const { companyId, requestId } = await params;
  const viewer = await loadViewer();
  const scope = viewer?.scopes.find((entry) => entry.companyId === companyId);
  if (viewer?.mustChangePassword || !scope) return unavailable();

  const ownId = ownEmployeeId(scope);
  const photo = await db.replacementPhoto.findFirst({
    where: {
      companyId, requestId,
      request: {
        replacementForId: { not: null },
        OR: [...(ownId ? [{ companyId, employeeId: ownId }] : []), ...(scope.role !== "EMPLOYEE" ? [requestWhere(scope)] : [])],
      },
    },
    select: { mime: true, content: true, sha256: true },
  });
  if (!photo) return unavailable();
  if (!Object.hasOwn(replacementPhotoTypes, photo.mime) ||
      createHash("sha256").update(photo.content).digest("hex") !== photo.sha256) {
    return new Response(null, { status: 500, headers: privateHeaders });
  }
  const extension = replacementPhotoTypes[photo.mime as keyof typeof replacementPhotoTypes];
  return new Response(Uint8Array.from(photo.content), {
    headers: {
      ...privateHeaders,
      "Content-Type": photo.mime,
      "Content-Disposition": `inline; filename="foto-da-troca.${extension}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
