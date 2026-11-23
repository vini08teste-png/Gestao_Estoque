"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { barcodeSources, parseBarcode, type BarcodeLookup, type BarcodeProduct, type BarcodeSource } from "@/lib/barcode";

const storageKey = "epi.barcode-lab.records.v1";
const productLabels = { name: "Nome", brand: "Marca", category: "Categoria", quantity: "Apresentação", description: "Descrição" } as const;
const codeLabels = { gtin: "GTIN", lot: "Lote", serial: "Número de série", production: "Fabricação", packaged: "Embalagem",
  bestBefore: "Melhor até", expiry: "Vencimento" } as const;
const productExample = "3017624010701";
const gs1Example = "(01)03017624010701(17)271130(10)TESTE-01";
const emptyDraft = { name: "", brand: "", category: "", quantity: "", lot: "", expiry: "", source: "" };
type SavedRecord = typeof emptyDraft & { id: string; raw: string; format: string; gtin?: string };

export function BarcodeLab() {
  const [raw, setRaw] = useState("");
  const [format, setFormat] = useState("");
  const [sources, setSources] = useState<BarcodeSource[]>(["products", "food", "upc"]);
  const [results, setResults] = useState<BarcodeLookup[]>([]);
  const [querying, setQuerying] = useState(false);
  const [camera, setCamera] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const controls = useRef<IScannerControls | null>(null);
  const scanToken = useRef(0);
  const currentLookup = useRef<AbortController | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const decoded = parseBarcode(raw);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(stored)) setRecords(stored.filter((record) => record && typeof record.id === "string" && typeof record.raw === "string").slice(0, 30));
    } catch { /* O histórico pode ficar indisponível quando o navegador bloquear o armazenamento. */ }
    return () => {
      scanToken.current++;
      controls.current?.stop();
      currentLookup.current?.abort();
    };
  }, []);

  function stopCamera() {
    scanToken.current++;
    controls.current?.stop();
    controls.current = null;
    setCamera(false);
  }

  function readCode(text: string, kind = "") {
    currentLookup.current?.abort();
    setQuerying(false);
    setRaw(text.slice(0, 1000));
    setFormat(kind);
    setResults([]);
    const code = parseBarcode(text.slice(0, 1000));
    setDraft({ ...emptyDraft, lot: code.lot ?? "", expiry: code.expiry ?? "" });
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia || !video.current) {
      setMessage("Câmera indisponível. Use uma imagem ou informe o código.");
      return;
    }
    const token = ++scanToken.current;
    const element = video.current;
    setMessage("Aponte a câmera para um código legível.");
    setCamera(true);
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      if (token !== scanToken.current) return;
      const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.ASSUME_GS1, true]]));
      const session = await reader.decodeFromVideoDevice(undefined, element, (result, _, scanning) => {
        if (!result || token !== scanToken.current) return;
        readCode(result.getText(), BarcodeFormat[result.getBarcodeFormat()]);
        scanning.stop();
        stopCamera();
        setMessage("Código lido pela câmera.");
      });
      if (token !== scanToken.current) session.stop();
      else controls.current = session;
    } catch {
      if (token !== scanToken.current) return;
      stopCamera();
      setMessage("A câmera não pôde ser aberta. Confira a permissão ou tente com uma imagem.");
    }
  }

  async function readImage(file: File) {
    const url = URL.createObjectURL(file);
    setImageBusy(true);
    setMessage("Lendo a imagem…");
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.ASSUME_GS1, true]]));
      const result = await reader.decodeFromImageUrl(url);
      readCode(result.getText(), BarcodeFormat[result.getBarcodeFormat()]);
      setMessage("Código lido na imagem.");
    } catch {
      setMessage("Nenhum código legível foi encontrado nesta imagem.");
    } finally {
      URL.revokeObjectURL(url);
      setImageBusy(false);
    }
  }

  async function consult() {
    if (!decoded.gtin || !sources.length) return;
    currentLookup.current?.abort();
    const controller = new AbortController();
    currentLookup.current = controller;
    setQuerying(true);
    setMessage("");
    setResults([]);
    const query = new URLSearchParams({ gtin: decoded.gtin });
    for (const source of sources) query.append("source", source);
    try {
      const response = await fetch(`/api/teste-codigo-barras?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json() as { results: BarcodeLookup[] };
      if (!controller.signal.aborted) setResults(data.results);
    } catch {
      if (!controller.signal.aborted) setMessage("Não foi possível consultar as fontes. Tente novamente.");
    } finally {
      if (currentLookup.current === controller) setQuerying(false);
    }
  }

  function useProduct(source: BarcodeSource, product: BarcodeProduct) {
    setDraft((current) => ({ ...current, name: product.name ?? current.name, brand: product.brand ?? current.brand,
      category: product.category ?? current.category, quantity: product.quantity ?? current.quantity, source: barcodeSources[source] }));
    setMessage(`Dados de ${barcodeSources[source]} copiados para o registro de teste.`);
  }

  function saveRecord() {
    if (!raw.trim()) return;
    const next = [{ ...draft, id: crypto.randomUUID(), raw, format, gtin: decoded.gtin }, ...records].slice(0, 30);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setRecords(next);
      setMessage("Registro de teste salvo neste navegador.");
    } catch {
      setMessage("O navegador não permitiu salvar o registro.");
    }
  }

  return <main className="content barcode-lab">
    <header className="page-heading"><div><h1>Teste de código de barras</h1>
      <p>Leia uma etiqueta, compare as fontes e salve um registro local de teste.</p></div></header>
    <div className="barcode-grid">
      <section className="panel barcode-panel" aria-labelledby="barcode-read">
        <h2 id="barcode-read">Leitura do código</h2>
        <div className="operation-actions">
          <button type="button" className="button" onClick={camera ? stopCamera : startCamera} disabled={imageBusy}>
            {camera ? "Fechar câmera" : "Abrir câmera"}
          </button>
          <label className="field">Ler imagem<input type="file" accept="image/*" disabled={camera || imageBusy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void readImage(file);
            }} /></label>
        </div>
        <video ref={video} hidden={!camera} aria-label="Prévia da câmera" muted playsInline />
        <label className="field">Código ou texto lido
          <textarea rows={2} value={raw} onChange={(event) => readCode(event.target.value)}
            maxLength={1000} placeholder="Digite, cole ou leia com a câmera" />
        </label>
        <div className="operation-actions">
          <button type="button" className="text-action" onClick={() => readCode(productExample, "EAN-13")}>Exemplo EAN-13</button>
          <button type="button" className="text-action" onClick={() => readCode(gs1Example, "Exemplo GS1")}>Exemplo GS1 com lote e validade</button>
        </div>
        <dl className="barcode-fields">
          {format && <div><dt>Formato</dt><dd>{format}</dd></div>}
          {(Object.keys(codeLabels) as (keyof typeof codeLabels)[]).map((key) => decoded[key] &&
            <div key={key}><dt>{codeLabels[key]}</dt><dd>{decoded[key]}</dd></div>)}
        </dl>
        {raw.trim() && !decoded.gtin && <p>O texto foi lido. Para consultar as APIs, informe um GTIN válido.</p>}
      </section>
      <section className="panel barcode-panel" aria-labelledby="barcode-sources">
        <h2 id="barcode-sources">Consultas às APIs</h2>
        <fieldset className="unit-choices"><legend>Fontes</legend>
          {(Object.entries(barcodeSources) as [BarcodeSource, string][]).map(([source, name]) => <label className="check" key={source}>
            <input type="checkbox" checked={sources.includes(source)} onChange={(event) => setSources(event.target.checked ?
              [...sources, source] : sources.filter((choice) => choice !== source))} />{name}
          </label>)}
        </fieldset>
        <button type="button" className="button primary" disabled={!decoded.gtin || !sources.length || querying}
          onClick={() => void consult()}>{querying ? "Consultando…" : "Consultar fontes selecionadas"}</button>
        <p>As APIs consultam o cadastro do produto. Lote e vencimento vêm da etiqueta GS1 quando codificados, ou podem ser preenchidos no registro.</p>
        {results.length > 0 && <ul className="barcode-results">{results.map((result) => <li key={result.source}>
          <h3>{barcodeSources[result.source]}</h3>
          <p>{result.status === "found" ? "Produto encontrado" : result.status === "missing" ? "Produto não encontrado" : result.message}</p>
          {result.product && <>
            <dl className="barcode-fields">{(Object.keys(productLabels) as (keyof BarcodeProduct)[]).map((key) => result.product?.[key] &&
              <div key={key}><dt>{productLabels[key]}</dt><dd>{result.product[key]}</dd></div>)}</dl>
            <button type="button" className="text-action" onClick={() => useProduct(result.source, result.product!)}>Usar estes dados</button>
          </>}
        </li>)}</ul>}
      </section>
    </div>
    <section className="panel barcode-panel" aria-labelledby="barcode-draft">
      <h2 id="barcode-draft">Registro de teste</h2>
      {draft.source && <p>Dados copiados de {draft.source}.</p>}
      <div className="form-grid">
        {([["name", "Nome do item"], ["brand", "Marca"], ["category", "Categoria"], ["quantity", "Apresentação"], ["lot", "Lote"], ["expiry", "Validade"]] as const)
          .map(([key, label]) => <label key={key} className="field">{label}
            <input type={key === "expiry" ? "date" : "text"} maxLength={180} value={draft[key]}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
          </label>)}
      </div>
      <div className="form-actions">
        <button type="button" className="button primary" disabled={!raw.trim()} onClick={saveRecord}>Salvar teste no navegador</button>
        <p aria-live="polite" className="barcode-message">{message}</p>
      </div>
    </section>
    {records.length > 0 && <section className="panel barcode-panel" aria-labelledby="barcode-history">
      <h2 id="barcode-history">Registros deste navegador</h2>
      <ul className="barcode-results">{records.map((record) => <li key={record.id}>
        <strong>{record.name || record.gtin || record.raw}</strong>
        <p>{[record.gtin, record.format, record.brand, record.category, record.quantity, record.lot && `Lote ${record.lot}`, record.expiry, record.source].filter(Boolean).join(" · ")}</p>
      </li>)}</ul>
    </section>}
  </main>;
}
