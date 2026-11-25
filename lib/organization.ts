import type { Role } from "@/generated/prisma/enums";

export const roles: Record<Role, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  SUPERVISOR: "Gerência",
  WAREHOUSE: "Operador de estoque",
  EMPLOYEE: "Colaborador",
};

export const companyBrands = {
  tsa: { label: "TSA", color: "#a51e22" },
  lynx: { label: "TSA Lynx", color: "#303d82" },
};

export const inventoryTitle = "Estoque";
export const contractNumberLabel = "Número do contrato";

export function stockContractLabel(stock: { contractNumber: string | null; name: string }) {
  return stock.contractNumber ?? `${stock.name} · Contrato não informado`;
}
export const itemCatalogTitle = "Cadastro de itens";

export const operationRequestTab = (role: Role) => role === "SUPERVISOR" ? "Da equipe" : role === "ADMIN" ? "Da operação" : "Para atender";

export function isCompany(id: string): id is keyof typeof companyBrands {
  return Object.hasOwn(companyBrands, id);
}
