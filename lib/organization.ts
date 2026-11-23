import type { Role } from "@/generated/prisma/enums";

export const roles: Record<Role, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  SUPERVISOR: "Encarregado",
  WAREHOUSE: "Almoxarifado",
  EMPLOYEE: "Colaborador",
};

export const roleFunctions: Record<Role, string> = {
  ADMIN: "Configura a empresa, os acessos, as unidades e as regras de aprovação.",
  MANAGER: "Acompanha as unidades autorizadas, cadastra colaboradores e opera o estoque e as entregas dessas unidades.",
  SUPERVISOR: "Cuida da equipe direta na sua unidade, cadastra colaboradores da equipe, aprova seus pedidos e opera o estoque da unidade. (Não permanecerá na versão final.)",
  WAREHOUSE: "Registra entradas, controla saldos e atende entregas nos almoxarifados das unidades autorizadas.",
  EMPLOYEE: "Solicita EPIs e uniformes, acompanha os próprios pedidos e confirma o recebimento.",
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
