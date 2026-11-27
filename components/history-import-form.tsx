"use client";

import { startTransition, useActionState, useState } from "react";
import { importDeliveryHistory } from "@/app/equipment-actions";
import { EmployeeContractFields } from "@/components/employee-contract-fields";
import type { HistoryImportResult } from "@/lib/history-import";

const format = "matrícula;nome;função;item;CA;quantidade;data";

function ConfirmImport({ companyId, preview }: { companyId: string; preview: NonNullable<HistoryImportResult["preview"]> }) {
  const [saved, importAction, pending] = useActionState(importDeliveryHistory.bind(null, companyId), {} as HistoryImportResult);
  return <form className="form-stack" action={importAction}>
    <input type="hidden" name="operation" value="import" />
    <input type="hidden" name="source" value={preview.source} />
    <input type="hidden" name="unit" value={preview.unitId} />
    <input type="hidden" name="contract" value={preview.contractId} />
    <input type="hidden" name="checksum" value={preview.checksum} />
    <div className="form-actions"><button className="button primary" disabled={pending || Boolean(saved.success)}>
      {pending ? "Importando…" : "Confirmar importação"}
    </button></div>
    {saved.error && <p className="feedback error" role="alert">{saved.error}</p>}
    {saved.success && <p className="feedback success" role="status">{saved.success}</p>}
  </form>;
}

export function HistoryImportForm({ companyId, units, contracts }: {
  companyId: string;
  units: { id: string; name: string; active: boolean }[];
  contracts: { id: string; unitId: string; contractNumber: string | null }[];
}) {
  const [previewResult, previewAction, previewPending] = useActionState(importDeliveryHistory.bind(null, companyId), {} as HistoryImportResult);
  const [changed, setChanged] = useState(false);
  const preview = changed || previewPending ? undefined : previewResult.preview;
  return <>
    <section className="panel editor" aria-label="Dados para importação">
      <form className="form-stack" action={previewAction} onChange={() => setChanged(true)} onSubmit={(event) => {
        event.preventDefault();
        if (previewPending) return;
        const draft = new FormData(event.currentTarget);
        setChanged(false);
        startTransition(() => previewAction(draft));
      }}>
        <div className="form-grid">
          <EmployeeContractFields units={units} contracts={contracts} initialUnit="" initialContract="" />
        </div>
        <label className="field">Dados das entregas
          <textarea name="source" rows={9} maxLength={60000} required aria-describedby="history-import-format"
            placeholder={format} />
        </label>
        <p id="history-import-format"><code>{format}</code><br />
          Cole uma linha por entrega, com as colunas separadas por ponto e vírgula. Use o nome do item no catálogo e a data em DD/MM/AAAA. Deixe o CA vazio quando ele não estiver informado. A função é necessária para novos colaboradores.
        </p>
        <div className="form-actions"><button className="button primary" disabled={previewPending}>
          {previewPending ? "Conferindo…" : "Gerar prévia"}
        </button></div>
        {previewResult.error && <p className="feedback error" role="alert">{previewResult.error}</p>}
      </form>
    </section>
    {preview && <section className="panel" aria-labelledby="history-import-preview">
      <div className="panel-heading"><h2 id="history-import-preview">Prévia da importação</h2>
        <span>{units.find(({ id }) => id === preview.unitId)?.name}{preview.contractId &&
          ` · ${contracts.find(({ id }) => id === preview.contractId)?.contractNumber ?? ""}`}</span>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Prévia da importação">
        <table>
          <thead><tr>{["Linha", "Colaborador", "Item", "Quantidade", "Entrega", "Resultado"].map((label) =>
            <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{preview.rows.map((row) => <tr key={row.line}>
            <td>{row.line}</td><td>{row.name} <small>({row.registration})</small></td><td>{row.item}</td><td>{row.quantity}</td>
            <td><time className="delivery-day" dateTime={row.date}>{row.date.split("-").reverse().join("/")}</time></td>
            <td>{row.status === "error" ? <strong>{row.message}</strong> : row.message}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {preview.rows.some(({ status }) => status === "new" || status === "existing") && !preview.rows.some(({ status }) => status === "error") &&
        <ConfirmImport key={preview.checksum} preview={preview} companyId={companyId} />}
    </section>}
  </>;
}
