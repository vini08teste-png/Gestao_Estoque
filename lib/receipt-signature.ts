import "server-only";
import { createHash } from "node:crypto";

export const receiptTitle = "Ficha de EPI e Termo de Compromisso";
export const receiptConsent = "Declaro que li e concordo com o Termo de Compromisso e confirmo o recebimento dos equipamentos relacionados nesta entrega.";

export function receiptTerm(companyId: string) {
  if (process.env.LOCAL_HTTP === "true" && process.env.EPI_RECEIPT_DEMO === "true" &&
      (companyId === "tsa" || companyId === "lynx")) {
    return {
      version: `demonstracao-${companyId}-1`,
      demo: true,
      content: companyId === "lynx" ? [
        "Demonstração: transcrição parcial da ficha da Lynx.",
        "Declaro que recebi da LYNX OTIMIZAÇÃO DE PROCESSOS S/A orientação sobre o uso correto do EPI fornecido e que estou ciente da legislação abaixo discriminada, comprometendo-me a cumpri-la.",
        "NR - 1, item 1.4.2 Port. Nº 3214, de 08 de junho de 1978, do MTE.\nCabe ao trabalhador:\na) cumprir as disposições legais e regulamentares sobre segurança e saúde no trabalho, inclusive as ordens de serviço expedidas pelo empregador;\nb) submeter-se aos exames médicos previstos nas NR;\nc) colaborar com a organização na aplicação das NR; e\nd) usar o equipamento de proteção individual fornecido pelo empregador.",
        "NR - 1, subitem 1.4.2.1 - Constitui ato faltoso a recusa injustificada do empregado ao cumprimento do disposto no item 1.4.2.",
        "CLT - Art. 462, § 1º. [Trecho cortado na foto.]",
        "NR - 6, item 6.6.1 Port. Nº 3214, de 08/06/78, do MTE.\nCabe ao trabalhador, quanto ao EPI:\na) usar o fornecido pela organização, observado o disposto no item 6.5.2;\nb) utilizar apenas para a finalidade a que se destina;\nc) responsabilizar-se pela limpeza, guarda e conservação;\nd) comunicar à organização quando extraviado, danificado ou qualquer alteração que o torne impróprio para uso;\ne) cumprir as determinações da organização sobre o uso adequado.",
      ].join("\n\n") : [
        "Demonstração para dados fictícios. Este texto é um roteiro de teste.",
        "1. Orientação sobre o uso correto do EPI",
        "2. NR-01 — Responsabilidades do trabalhador (itens 1.4.2 e 1.4.2.1)",
        "3. CLT — Art. 462, § 1º",
        "4. NR-06 — Responsabilidades do trabalhador quanto ao EPI (item 6.6.1)",
        "5. Declaração de recebimento e responsabilidade",
      ].join("\n\n"),
    };
  }
  return null;
}

export type ReceiptTerm = NonNullable<ReturnType<typeof receiptTerm>>;

export function receiptPreview(companyId: string, term: ReceiptTerm, delivery: {
  id: string;
  deliveredAt: Date;
  quantity: number;
  returnedQuantity: number;
  employee: { id: string; name: string; registration: string };
  equipment: { id: string; name: string; certificate: string | null };
}) {
  return {
    companyId, deliveryId: delivery.id,
    employee: { id: delivery.employee.id, name: delivery.employee.name, registration: delivery.employee.registration },
    items: [{ id: delivery.equipment.id, description: delivery.equipment.name, certificate: delivery.equipment.certificate,
      quantity: delivery.quantity - delivery.returnedQuantity, deliveredAt: delivery.deliveredAt.toISOString().slice(0, 10) }],
    term, consent: receiptConsent,
  };
}

export type SignedReceipt = ReturnType<typeof receiptPreview> & {
  actorId: string;
  confirmedAt: string;
  method: string;
  verificationCode: string;
};

export const receiptHash = (content: string) => createHash("sha256").update(content).digest("hex");
export const receiptSignaturePath = (companyId: string, deliveryId: string) =>
  `/aceites/${companyId}/${encodeURIComponent(deliveryId)}`;
