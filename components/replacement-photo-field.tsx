"use client";

import { useEffect, useId, useRef, useState } from "react";
import { attachmentLimit, replacementPhotoTypes } from "@/lib/attachment-limits";

export function ReplacementPhotoField() {
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return <div className="field">
    <label htmlFor={inputId}>Foto da justificativa</label>
    <input id={inputId} ref={input} name="replacementPhoto" type="file" accept={Object.keys(replacementPhotoTypes).join(",")}
      aria-describedby={`${inputId}-formatos`}
      onChange={(event) => {
        const selected = event.currentTarget.files?.[0];
        const valid = !selected || (selected.size > 0 && selected.size <= attachmentLimit && Object.hasOwn(replacementPhotoTypes, selected.type));
        event.currentTarget.setCustomValidity(valid ? "" : "Selecione uma foto JPG, PNG ou WebP válida de até 3 MB.");
        setPreview(undefined);
        setFile(valid ? selected : undefined);
      }} />
    <small id={`${inputId}-formatos`}>JPG, PNG ou WebP de até 3 MB.</small>
    {preview && <div className="replacement-photo">
      <img src={preview} alt="Prévia da foto selecionada" />
      <button type="button" className="text-action" onClick={() => {
        if (!input.current) return;
        input.current.value = "";
        input.current.setCustomValidity("");
        setFile(undefined);
        setPreview(undefined);
        input.current.focus();
      }}>Remover foto</button>
    </div>}
  </div>;
}
