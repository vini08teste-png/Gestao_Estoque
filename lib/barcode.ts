const groupSeparator = "\x1d";
const fixedFields: Record<string, number> = { "01": 14, "11": 6, "13": 6, "15": 6, "17": 6 };
const variableFields = new Set(["10", "21"]);

export function isGtin(value: string) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const sum = [...value.slice(0, -1)].reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 1 : 3), 0);
  return (10 - sum % 10) % 10 === Number(value.at(-1));
}

function gs1Date(value?: string, monthEnd = false) {
  if (!value || !/^\d{6}$/.test(value)) return undefined;
  const current = new Date().getUTCFullYear();
  let year = current - (current % 100) + Number(value.slice(0, 2));
  if (year > current + 49) year -= 100;
  if (year < current - 50) year += 100;
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4));
  if (month < 1 || month > 12 || (!day && !monthEnd)) return undefined;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > days) return undefined;
  return `${year}-${value.slice(2, 4)}-${String(day || days).padStart(2, "0")}`;
}

export function parseBarcode(input: string) {
  const raw = input.trim();
  if (isGtin(raw)) return { gtin: raw };
  const data = Object.create(null) as Record<string, string>;
  const text = raw.replace(/^\](?:C1|d2|Q3)/, "").replaceAll("<GS>", groupSeparator);
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const parts = url.pathname.split("/").filter(Boolean);
      const start = parts.findIndex((part, index) => part === "01" && isGtin(parts[index + 1] ?? ""));
      if (start >= 0) {
        for (let index = start; index + 1 < parts.length; index += 2) data[parts[index]] = decodeURIComponent(parts[index + 1]);
        for (const ai of Object.keys(fixedFields)) data[ai] ??= url.searchParams.get(ai) ?? "";
      }
    } catch {
      return {};
    }
  } else if (/^\(\d{2,4}\)/.test(text)) {
    for (const match of text.matchAll(/\((\d{2,4})\)([^\x1d()]+)/g)) data[match[1]] = match[2].trim();
  } else if (/^01\d{14}/.test(text) || text !== raw || text.includes(groupSeparator)) {
    for (let index = 0; index < text.length;) {
      if (text[index] === groupSeparator) { index++; continue; }
      const ai = text.slice(index, index + 2);
      index += 2;
      const width = fixedFields[ai];
      const separator = text.indexOf(groupSeparator, index);
      const end = width ? index + width : separator < 0 ? text.length : separator;
      if ((!width && !variableFields.has(ai)) || end > text.length || (width && separator >= 0 && separator < end)) break;
      data[ai] = text.slice(index, end);
      index = end;
    }
  }
  return {
    gtin: data["01"] && isGtin(data["01"]) ? data["01"] : undefined,
    lot: data["10"]?.slice(0, 20) || undefined,
    serial: data["21"]?.slice(0, 20) || undefined,
    production: gs1Date(data["11"]),
    packaged: gs1Date(data["13"]),
    bestBefore: gs1Date(data["15"], true),
    expiry: gs1Date(data["17"], true),
  };
}

export const barcodeSources = {
  products: "Open Products Facts",
  food: "Open Food Facts",
  beauty: "Open Beauty Facts",
  upc: "UPCitemdb",
} as const;

export type BarcodeSource = keyof typeof barcodeSources;

export type BarcodeProduct = { name?: string; brand?: string; category?: string; quantity?: string; description?: string };

export type BarcodeLookup = {
  source: BarcodeSource;
  status: "found" | "missing" | "unavailable";
  product?: BarcodeProduct;
  message?: string;
};
