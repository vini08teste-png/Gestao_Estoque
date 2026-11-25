import type { Role } from "@/generated/prisma/enums";

export const roles: Record<Role, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  SUPERVISOR: "Gerência",
  WAREHOUSE: "Almoxarifado",
  EMPLOYEE: "Colaborador",
};

export const companyBrands = {
  tsa: { label: "TSA", color: "#a51e22" },
  lynx: { label: "TSA Lynx", color: "#303d82" },
};

export const inventoryTitle = "Estoque";
export const itemCatalogTitle = "Cadastro de itens";

export const operationRequestTab = (role: Role) => role === "SUPERVISOR" ? "Da equipe" : role === "ADMIN" ? "Da operação" : "Para atender";

export function isCompany(id: string): id is keyof typeof companyBrands {
  return Object.hasOwn(companyBrands, id);
}
