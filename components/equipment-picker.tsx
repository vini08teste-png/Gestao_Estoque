"use client";

import { useId, useState } from "react";
import { ItemCategoryFields } from "@/components/item-category-fields";

export function EquipmentPicker({ items }: { items: { id: string; name: string }[] }) {
  const [create, setCreate] = useState(false);
  const itemId = useId();
  const newItem = create || items.length === 0;
  return <div className="equipment-picker">
    {newItem ? <>
      <input type="hidden" name="createEquipment" value="on" />
      <fieldset className="inline-item-fields">
        <legend>Novo item</legend>
        <div className="form-grid">
          <ItemCategoryFields initial="EPI" />
          <label className="field">Nome do item<input name="name" maxLength={120} required /></label>
          <label className="field">Fabricante e modelo<input name="makerModel" maxLength={120} required /></label>
        </div>
      </fieldset>
    </> : <div className="field">
      <label htmlFor={itemId}>Item</label>
      <select id={itemId} name="equipment" defaultValue={items.length === 1 ? items[0].id : ""} required>
        <option value="">Selecione o EPI ou uniforme</option>
        {items.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </div>}
    {items.length > 0 && <button type="button" className="text-action" onClick={() => setCreate(!create)}>
      {newItem ? "Escolher item existente" : "Cadastrar novo item"}
    </button>}
  </div>;
}
