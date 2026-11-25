import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { requireScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { deliveryWhere } from "@/lib/equipment-access";
import { formatDay } from "@/lib/equipment";
import { isCompany } from "@/lib/organization";
import { receiptHash, receiptTitle, type SignedReceipt } from "@/lib/receipt-signature";

const dateTimeInBrazil = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
});

export default async function SignedReceiptPage({ params }: { params: Promise<{ companyId: string; deliveryId: string }> }) {
  const { companyId, deliveryId } = await params;
  if (!isCompany(companyId)) notFound();
  const { scope } = await requireScope(companyId);
  const receipt = await db.deliveryReceipt.findFirst({
    where: { companyId, deliveryId, delivery: deliveryWhere(scope) },
    select: { signedContent: true, signatureHash: true, verificationCode: true, actorId: true, confirmedAt: true },
  });
  if (!receipt?.signedContent || !receipt.signatureHash || receiptHash(receipt.signedContent) !== receipt.signatureHash) notFound();
  const signed = JSON.parse(receipt.signedContent) as SignedReceipt;
  if (signed.companyId !== companyId || signed.deliveryId !== deliveryId || signed.verificationCode !== receipt.verificationCode ||
      signed.actorId !== receipt.actorId || signed.confirmedAt !== receipt.confirmedAt.toISOString()) notFound();
  return <main className="content receipt-document" data-company={companyId}>
    <header className="page-heading">
      <div><Brand company={companyId} variant="color" /><h1>Comprovante de aceite</h1></div>
      <Link className="button" href={`/${companyId}/${scope.role === "EMPLOYEE" ? "meus-epis" : "entregas"}`}>Voltar</Link>
    </header>
    <section className="panel receipt-document-panel">
      {signed.term.demo && <p className="feedback">Termo de demonstração</p>}
      <h2>{receiptTitle}</h2>
      <dl className="delivery-summary">
        <div><dt>Colaborador</dt><dd>{signed.employee.name}</dd></div>
        <div><dt>Matrícula</dt><dd>{signed.employee.registration}</dd></div>
        <div><dt>Assinado em</dt><dd>{dateTimeInBrazil.format(receipt.confirmedAt)}</dd></div>
        <div><dt>Método</dt><dd>{signed.method}</dd></div>
        <div><dt>Versão do termo</dt><dd>{signed.term.version}</dd></div>
        <div><dt>Código de verificação</dt><dd>{signed.verificationCode}</dd></div>
      </dl>
      <h2>Equipamentos confirmados</h2>
      <ul>{signed.items.map((item) => <li key={item.id}>
        {item.quantity} × {item.description} · CA {item.certificate ?? "—"} · {formatDay(new Date(item.deliveredAt))}
      </li>)}</ul>
      <h2>Termo aceito</h2>
      <p className="receipt-term-text">{signed.term.content}</p>
      <p>{signed.consent}</p>
      <p>SHA-256 <code>{receipt.signatureHash}</code></p>
    </section>
  </main>;
}
