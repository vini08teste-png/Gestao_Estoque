"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ItemCategory } from "@/generated/prisma/enums";

type Certificate = { name: string; manufacturer: string; reference: string; expires: string; status: string };
const displayDay = (value: string) => value.split("-").reverse().join("/");

export function ItemCategoryFields({ companyId, initial, certificate, expires, name, makerModel }: {
  companyId: string;
  initial: ItemCategory;
  certificate?: string;
  expires?: string;
  name?: string;
  makerModel?: string;
}) {
  const [category, setCategory] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [lookup, setLookup] = useState<{ exportedOn: string; results: Certificate[] }>();
  const [applied, setApplied] = useState(false);
  const requestId = useRef(0);
  const suggestions = useRef(new Map<HTMLInputElement, string>());
  const fieldId = useId();
  const caInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const makerInput = useRef<HTMLInputElement>(null);
  const expiryInput = useRef<HTMLInputElement>(null);

  function resetLookup() {
    requestId.current++;
    setMessage("");
    setLookup(undefined);
    setPending(false);
    setApplied(false);
  }

  function changeCertificate() {
    for (const [input, value] of suggestions.current) {
      if (input.value === value) input.value = "";
    }
    suggestions.current.clear();
    resetLookup();
  }

  useEffect(() => {
    const form = nameInput.current?.form;
    const reset = () => { suggestions.current.clear(); resetLookup(); };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);

  function useCertificate(entry: Certificate, overwrite = false) {
    const maker = [entry.manufacturer, entry.reference].filter(Boolean).join(" · ");
    const values = [
      [nameInput.current, entry.name.toLocaleUpperCase("pt-BR")], [makerInput.current, maker.length <= 120 ? maker : entry.manufacturer],
      [expiryInput.current, entry.expires],
    ] as const;
    for (const [input, value] of values) {
      if (input && value && value.length <= 120 && (overwrite || !input.value.trim())) {
        input.value = value;
        suggestions.current.set(input, value);
      }
    }
    setApplied(true);
  }

  async function consult() {
    const ca = caInput.current?.value.trim() ?? "";
    if (!/^\d{1,10}$/.test(ca) || !Number(ca)) {
      resetLookup();
      setMessage("Informe um número de CA válido.");
      caInput.current?.focus();
      return;
    }
    const id = ++requestId.current;
    setPending(true);
    setLookup(undefined);
    setMessage("");
    setApplied(false);
    try {
      const response = await fetch("/api/ca-catalogo?" + new URLSearchParams({ empresa: companyId, ca }), { cache: "no-store" });
      const result = await response.json();
      if (id !== requestId.current) return;
      if (!response.ok) {
        setMessage(result.error);
        return;
      }
      setLookup(result);
      if (result.results.length === 1) useCertificate(result.results[0]);
    } catch {
      if (id === requestId.current) setMessage("Não foi possível consultar a base. Você pode preencher o cadastro manualmente.");
    } finally {
      if (id === requestId.current) setPending(false);
    }
  }

  return <>
    <label className="field">Tipo de item
      <select name="category" value={category} onChange={(event) => { changeCertificate(); setCategory(event.target.value as ItemCategory); }}>
        <option value="EPI">EPI</option>
        <option value="UNIFORM">Uniforme</option>
      </select>
    </label>
    {category === "EPI" && <>
      <div className="field">
        <label htmlFor={fieldId}>CA</label>
        <div className="ca-catalog-control">
          <input id={fieldId} ref={caInput} name="certificate" defaultValue={certificate} maxLength={60}
            inputMode="numeric" onChange={changeCertificate} required />
          <button type="button" className="button" disabled={pending} onClick={consult}>{pending ? "Consultando…" : "Consultar CA"}</button>
        </div>
      </div>
      {message && <p className="feedback error ca-catalog-results" role="alert">{message}</p>}
      {lookup && <div className="ca-catalog-results">
        <p role="status">Base de {displayDay(lookup.exportedOn)}. {applied ? "Confira os campos antes de salvar." :
          "Há mais de uma opção para este CA. Escolha a que corresponde ao equipamento."}</p>
        <ul>
          {lookup.results.map((entry, index) => <li key={index}>
            <strong>{entry.name}</strong>
            <p>{entry.manufacturer}{entry.reference && ` · ${entry.reference}`}</p>
            <p>{entry.status} · Validade do CA {displayDay(entry.expires)}</p>
            <button type="button" className="text-action" onClick={() => useCertificate(entry, true)}>Usar estes dados</button>
          </li>)}
        </ul>
      </div>}
      <label className="field">Validade do CA<input ref={expiryInput} name="caExpiresAt" type="date" defaultValue={expires} required /></label>
    </>}
    <label className="field">Nome do item<input ref={nameInput} name="name" defaultValue={name} maxLength={120} required
      onBlur={({ currentTarget }) => { currentTarget.value = currentTarget.value.toLocaleUpperCase("pt-BR"); }} /></label>
    <label className="field">Fabricante e modelo<input ref={makerInput} name="makerModel" defaultValue={makerModel} maxLength={120} required /></label>
  </>;
}
