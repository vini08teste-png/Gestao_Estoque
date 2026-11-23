"use client";

import { useId, useState } from "react";

type Person = { id: string; name: string; unitId: string; unit: { name: string } };
type StockOption = { key: string; label: string; unitId: string };

export function DeliveryFields({ people, stocks, today, request }: {
  people: Person[];
  stocks: StockOption[];
  today: string;
  request?: { name: string; equipment: string; quantity: number; unitId: string; minDate: string };
}) {
  const [person, setPerson] = useState("");
  const [stock, setStock] = useState(() => request && stocks.length === 1 ? stocks[0].key : "");
  const personId = useId();
  const stockId = useId();
  const proofId = useId();
  const unit = request?.unitId ?? people.find(({ id }) => id === person)?.unitId;

  return (
    <>
      {request ? (
        <dl className="delivery-summary">
          <div><dt>Colaborador</dt><dd>{request.name}</dd></div>
          <div><dt>Item</dt><dd>{request.equipment}</dd></div>
          <div><dt>Quantidade</dt><dd>{request.quantity}</dd></div>
        </dl>
      ) : (
        <div className="field">
          <label htmlFor={personId}>Colaborador</label>
          <select id={personId} name="employee" value={person} onChange={(event) => { setPerson(event.target.value); setStock(""); }} required>
            <option value="">Selecione o colaborador</option>
            {people.map(({ id, name, unit }) => <option value={id} key={id}>{name} · {unit.name}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor={stockId}>Almoxarifado e lote</label>
        <select id={stockId} name="stock" value={stock} onChange={(event) => setStock(event.target.value)} required disabled={!unit}>
          <option value="">{unit && !stocks.some((row) => row.unitId === unit) ? "Sem lote disponível para esta entrega" : "Selecione um lote"}</option>
          {stocks.filter((row) => row.unitId === unit).map(({ key, label }) => <option value={key} key={key}>{label}</option>)}
        </select>
      </div>
      <div className="form-grid">
        {!request && <label className="field">Quantidade<input name="quantity" type="number" min={1} max={1_000_000} defaultValue={1} required /></label>}
        <label className="field">Data da entrega<input name="deliveredAt" type="date" defaultValue={today} min={request?.minDate} max={today} required /></label>
      </div>
      <details className="record-details delivery-proof">
        <summary>Anexo de entrega (opcional)</summary>
        <div className="field">
          <label htmlFor={proofId}>Comprovante</label>
          <input id={proofId} name="proof" type="file" accept="application/pdf,image/png,image/jpeg" aria-describedby={proofId + "-help"} />
          <small id={proofId + "-help"}>PDF, PNG ou JPEG de até 3 MB.</small>
        </div>
      </details>
    </>
  );
}
