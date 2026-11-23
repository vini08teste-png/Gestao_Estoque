"use client";

import { useId, useState } from "react";

export function RequestEquipmentField({ options }: { options: { id: string; name: string }[] }) {
  const [choice, setChoice] = useState(options.length ? "" : "__other");
  const [query, setQuery] = useState("");
  const itemId = useId();
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();
  const search = normalize(query);
  const matching = options.filter(({ id, name }) => id === choice || normalize(name).includes(search));
  const other = choice === "__other";
  return <>
    {!other && <label className="field">Buscar no catálogo
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: luva ou uniforme" />
    </label>}
    {!other && <div className="field">
      <label htmlFor={itemId}>Item</label>
      <select id={itemId} name="equipment" value={choice} onChange={(event) => setChoice(event.target.value)} required>
        <option value="">{matching.length ? "Selecione um item" : "Nenhum item encontrado"}</option>
        {matching.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
      <button className="text-action catalog-alternative" type="button" onClick={() => setChoice("__other")}>Não encontrei o item</button>
    </div>}
    {other && <>
      <input type="hidden" name="equipment" value="__other" />
      <label className="field">Qual item você precisa?
        <input name="requestedItem" maxLength={160} placeholder="Ex.: Protetor facial para esmerilhamento" required />
      </label>
      {options.length > 0 && <button className="text-action catalog-alternative" type="button" onClick={() => setChoice("")}>Voltar ao catálogo</button>}
    </>}
  </>;
}
