import { barcodeSources, isGtin, type BarcodeLookup, type BarcodeProduct, type BarcodeSource } from "@/lib/barcode";

const factsHosts = { products: "world.openproductsfacts.org", food: "world.openfoodfacts.org", beauty: "world.openbeautyfacts.org" } as const;
const fields = "product_name,product_name_pt,brands,categories,quantity,generic_name";
const value = (input: unknown, max = 180) => typeof input === "string" ? input.trim().slice(0, max) || undefined : undefined;

async function lookup(source: BarcodeSource, code: string): Promise<BarcodeLookup> {
  const isUpc = source === "upc";
  let lookupCode = code;
  while (lookupCode.length > 13 && lookupCode.startsWith("0")) lookupCode = lookupCode.slice(1);
  const url = isUpc ? `https://api.upcitemdb.com/prod/trial/lookup?upc=${lookupCode}` :
    `https://${factsHosts[source]}/api/v2/product/${lookupCode}.json?fields=${fields}`;
  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "GestaoEstoqueBarcodeTest/1.0 (https://github.com/vini08teste-png/Gestao_Estoque)", Accept: "application/json" },
      signal: AbortSignal.timeout(4500),
    });
    if (response.status === 404) return { source, status: "missing" };
    if (!response.ok) return { source, status: "unavailable",
      message: response.status === 429 ? "Limite de consultas atingido." : `Resposta HTTP ${response.status}.` };
    const data = await response.json();
    const raw = isUpc ? data?.items?.[0] : data?.product;
    if (!raw || typeof raw !== "object") return { source, status: "missing" };
    const product: BarcodeProduct = isUpc ? {
      name: value(raw.title), brand: value(raw.brand), category: value(raw.category),
      quantity: value(raw.size), description: value(raw.description, 400),
    } : {
      name: value(raw.product_name_pt) ?? value(raw.product_name), brand: value(raw.brands),
      category: value(raw.categories), quantity: value(raw.quantity), description: value(raw.generic_name, 400),
    };
    return Object.values(product).some(Boolean) ? { source, status: "found", product } : { source, status: "missing" };
  } catch {
    return { source, status: "unavailable", message: "A fonte não respondeu a tempo ou devolveu uma resposta inválida." };
  }
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const code = query.get("gtin") ?? "";
  const sources = [...new Set(query.getAll("source"))].filter(
    (source): source is BarcodeSource => Object.hasOwn(barcodeSources, source),
  );
  if (!isGtin(code) || !sources.length) return Response.json({ error: "Informe um GTIN válido e escolha pelo menos uma fonte." }, { status: 400 });
  return Response.json({ results: await Promise.all(sources.map((source) => lookup(source, code))) });
}
