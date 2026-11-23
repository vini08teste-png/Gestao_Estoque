import { createHash } from "node:crypto";
import { loadViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { deliveryWhere } from "@/lib/equipment-access";

export async function GET(_: Request, { params }: { params: Promise<{ companyId: string; deliveryId: string }> }) {
  const { companyId, deliveryId } = await params;
  const viewer = await loadViewer();
  const scope = viewer?.scopes.find((entry) => entry.companyId === companyId);
  if (viewer?.mustChangePassword || !scope) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const proof = await db.deliveryProof.findFirst({
    where: { companyId, deliveryId, delivery: deliveryWhere(scope) },
    select: { mime: true, content: true, sha256: true },
  });
  if (!proof) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (createHash("sha256").update(proof.content).digest("hex") !== proof.sha256) {
    return new Response(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  const extension = proof.mime === "application/pdf" ? "pdf" : proof.mime === "image/png" ? "png" : "jpg";
  return new Response(Uint8Array.from(proof.content), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": proof.mime,
      "Content-Disposition": `attachment; filename="comprovante.${extension}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
