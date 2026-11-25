import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadViewer } from "@/lib/auth";
import { handlesStock } from "@/lib/equipment-access";

type Catalog = {
  exportedOn: string;
  certificates: Record<string, [name: string, manufacturer: string, reference: string, expires: string, status: string][]>;
};

let catalog: Promise<Catalog> | undefined;
const response = (value: object, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  const viewer = await loadViewer();
  if (!viewer || viewer.mustChangePassword) return response({ error: "Entre novamente para consultar o CA." }, 401);
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("empresa");
  const scope = viewer.scopes.find((entry) => entry.companyId === companyId);
  if (!scope || !handlesStock(scope)) return response({ error: "Seu perfil não permite consultar o CA nesta empresa." }, 403);
  const ca = searchParams.get("ca")?.trim() ?? "";
  if (!/^\d{1,10}$/.test(ca) || !Number(ca)) return response({ error: "Informe um número de CA válido." }, 400);
  try {
    catalog ??= readFile(join(process.cwd(), "data", "ca-catalogo.json.gz"))
      .then((data) => JSON.parse(gunzipSync(data).toString("utf8")) as Catalog);
    const { exportedOn, certificates } = await catalog;
    const entries = certificates[String(Number(ca))];
    if (!entries) return response({ error: "CA não encontrado na base importada. Você pode preencher o cadastro manualmente." }, 404);
    return response({ exportedOn, results: entries.map(([name, manufacturer, reference, expires, status]) =>
      ({ name, manufacturer, reference, expires, status })) });
  } catch {
    catalog = undefined;
    return response({ error: "A base de CA está indisponível. Você pode preencher o cadastro manualmente." }, 503);
  }
}
