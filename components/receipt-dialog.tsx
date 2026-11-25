"use client";

import { useActionState, useId, useRef, useState, type ReactNode } from "react";
import type { FormResult } from "@/lib/forms";

export function ReceiptDialog({ action, fingerprint, title, consent, content, logo, employee, item }: {
  action: (state: FormResult, data: FormData) => Promise<FormResult>;
  fingerprint: string; title: string; consent: string; content: string; logo: ReactNode;
  employee: { name: string; registration: string };
  item: { description: string; quantity: number; certificate: string | null; date: string };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [accepted, setAccepted] = useState(false);
  const [result, submit, pending] = useActionState(action, {});
  return <>
    <button type="button" className="button primary" onClick={() => dialog.current?.showModal()}>Confirmar recebimento</button>
    <dialog ref={dialog} className="receipt-dialog panel" aria-labelledby={headingId}
      onClose={() => setAccepted(false)} onCancel={(event) => { if (pending) event.preventDefault(); }}>
      <form action={submit}>
        <header className="receipt-dialog-heading">{logo}<div><h2 id={headingId}>{title}</h2>
          <p>{employee.name} · Matrícula {employee.registration}</p></div></header>
        <div className="receipt-dialog-content" tabIndex={0}>
          <p className="feedback">Termo de demonstração</p>
          <p className="receipt-term-text">{content}</p>
          <h3>Equipamentos desta entrega</h3>
          <dl className="delivery-summary">
            <div><dt>Descrição</dt><dd>{item.description}</dd></div>
            <div><dt>Quantidade a confirmar</dt><dd>{item.quantity}</dd></div>
            <div><dt>CA</dt><dd>{item.certificate ?? "—"}</dd></div>
            <div><dt>Data da entrega</dt><dd>{item.date}</dd></div>
          </dl>
        </div>
        <footer className="receipt-dialog-footer">
          <input type="hidden" name="receiptPreview" value={fingerprint} />
          <label className="check"><input type="checkbox" name="acceptReceipt" checked={accepted} required
            onChange={(event) => setAccepted(event.target.checked)} />{consent}</label>
          {result.error && <p className="feedback error" role="alert">{result.error}</p>}
          <div className="operation-actions">
            <button type="button" className="button" disabled={pending} onClick={() => dialog.current?.close()}>Cancelar</button>
            <button className="button primary" type="submit" disabled={!accepted || pending}>
              {pending ? "Confirmando…" : "Assinar e confirmar recebimento"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  </>;
}
