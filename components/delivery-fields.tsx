"use client";

import { useId, useState } from "react";
import { DeliveryProofField } from "@/components/delivery-proof-field";
import { EquipmentPicker } from "@/components/equipment-picker";

type Person = { id: string; name: string; unitId: string; unit: { name: string } };
type Warehouse = { id: string; name: string; unitId: string };
type Item = { id: string; name: string };
type StockOption = { warehouseId: string; item: Item; quantity: number };

export function DeliveryFields({ companyId, people, warehouses, stocks, items, today, request, paper, employeeId }: {
  companyId: string;
  people: Person[];
  warehouses: Warehouse[];
  stocks: StockOption[];
  items: Item[];
  today: string;
  request?: { name: string; equipment: string; quantity: number; unitId: string; minDate: string;
    itemReturn?: { equipment: string; earliest: string; recordedDate?: string } };
  paper: boolean;
  employeeId: string;
}) {
  const [person, setPerson] = useState(employeeId || (people.length === 1 ? people[0].id : ""));
  const [selectedWarehouse, setWarehouse] = useState("");
  const [selectedItem, setItem] = useState("");
  const [originalDate, setOriginalDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(today);
  const personFieldId = useId();
  const warehouseFieldId = useId();
  const itemFieldId = useId();
  const unit = request?.unitId ?? people.find(({ id }) => id === person)?.unitId;
  const unitWarehouses = warehouses.filter(({ unitId }) => unitId === unit);
  const warehouseBalances = new Map(stocks.map(({ warehouseId, quantity }) => [warehouseId, quantity]));
  const defaultWarehouses = request ? unitWarehouses.filter(({ id }) => (warehouseBalances.get(id) ?? 0) >= request.quantity) : unitWarehouses;
  const warehouse = selectedWarehouse || (defaultWarehouses.length === 1 ? defaultWarehouses[0].id : "");
  const warehouseStock = stocks.filter(({ warehouseId }) => warehouseId === warehouse);
  const itemOptions = warehouseStock.map(({ item }) => item);
  const itemId = selectedItem || (itemOptions.length === 1 ? itemOptions[0].id : "");
  const quantityAvailable = warehouseStock.find(({ item }) => item.id === itemId)?.quantity;
  const emptyWarehouse = Boolean(warehouse && !request && !warehouseStock.length);

  return <>
    {request ? (
      <dl className="delivery-summary">
        <div><dt>Colaborador</dt><dd>{request.name}</dd></div>
        <div><dt>Item</dt><dd>{request.equipment}</dd></div>
        <div><dt>Quantidade</dt><dd>{request.quantity}</dd></div>
      </dl>
    ) : (
      <div className="field">
        <label htmlFor={personFieldId}>Colaborador</label>
        <select id={personFieldId} name="employee" value={person} onChange={(event) => { setPerson(event.target.value); setWarehouse(""); setItem(""); }} required>
          <option value="">Selecione o colaborador</option>
          {people.map(({ id, name, unit }) => <option value={id} key={id}>{name} · {unit.name}</option>)}
        </select>
      </div>
    )}
    {!paper && <div className="field">
      <label htmlFor={warehouseFieldId}>Almoxarifado</label>
      <select id={warehouseFieldId} name="warehouse" value={warehouse} onChange={(event) => { setWarehouse(event.target.value); setItem(""); }}
        aria-describedby={emptyWarehouse ? warehouseFieldId + "-help" : undefined} required disabled={!unit}>
        <option value="" disabled>{!unit ? "Selecione primeiro o colaborador" : unitWarehouses.length ? "Selecione o almoxarifado" : "Nenhum almoxarifado ativo nesta unidade"}</option>
        {unitWarehouses.map(({ id, name }) => <option value={id} key={id}
          disabled={request ? (warehouseBalances.get(id) ?? 0) < request.quantity : false}>
          {name}{request && ` · Saldo ${warehouseBalances.get(id) ?? 0}`}
        </option>)}
      </select>
      {emptyWarehouse && <small id={warehouseFieldId + "-help"}>Este almoxarifado já está cadastrado. Registre uma entrada para disponibilizar itens.</small>}
    </div>}
    {paper ? <EquipmentPicker companyId={companyId} items={items} /> : !request && <div className="field">
      <label htmlFor={itemFieldId}>Item</label>
      <select id={itemFieldId} name="equipment" value={itemId} onChange={(event) => setItem(event.target.value)}
        aria-describedby={quantityAvailable === undefined ? undefined : itemFieldId + "-help"} required disabled={!warehouse}>
        <option value="" disabled>{!warehouse ? "Selecione primeiro o almoxarifado" : itemOptions.length ? "Selecione o EPI ou uniforme" : "Nenhum item disponível"}</option>
        {itemOptions.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
      </select>
      {quantityAvailable !== undefined && <small id={itemFieldId + "-help"}>Saldo disponível neste almoxarifado: {quantityAvailable} un.</small>}
    </div>}
    <div className="form-grid">
      {!request && <label className="field">Quantidade<input name="quantity" type="number" min={1}
        max={Math.min(quantityAvailable ?? 1_000_000, 1_000_000)} defaultValue={1} required /></label>}
      <label className="field">Data da entrega<input name="deliveredAt" type="date"
        {...(paper ? { value: originalDate, onChange: (event) => setOriginalDate(event.target.value) } :
          request?.itemReturn ? { value: deliveryDate, onChange: (event) => setDeliveryDate(event.target.value) } : { defaultValue: today })}
        min={request?.minDate} max={today} required /></label>
    </div>
    {request?.itemReturn && <fieldset className="inline-item-fields">
      <legend>Devolução para descarte</legend>
      <p>{request.itemReturn.equipment} · {request.quantity} un.</p>
      {request.itemReturn.recordedDate ? <p>Recebido para descarte em <time dateTime={request.itemReturn.recordedDate}>
        {request.itemReturn.recordedDate.split("-").reverse().join("/")}</time>.</p> :
        <label className="field">Data da devolução
          <input name="returnedAt" type="date" min={request.itemReturn.earliest} max={deliveryDate || today} required />
          <small>Preencha após receber o item antigo para descarte.</small>
        </label>}
    </fieldset>}
    <DeliveryProofField />
  </>;
}
