"use client";

import { useEffect, useId, useRef, useState } from "react";
import { attachmentLimit } from "@/lib/attachment-limits";

const photoTypes = ["image/jpeg", "image/png"];
const proofTypes = ["application/pdf", ...photoTypes];
const invalidProof = "Selecione um PDF, PNG ou JPEG de até 3 MB.";

export function DeliveryProofField({ replacing = false }: { replacing?: boolean }) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const nativeCamera = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const [photo, setPhoto] = useState<File>();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [camera, setCamera] = useState(false);
  const [ready, setReady] = useState(false);

  function closeCamera() {
    cameraRequest.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false);
    setReady(false);
  }

  useEffect(() => {
    const form = fileInput.current?.form;
    const reset = () => {
      closeCamera();
      fileInput.current?.setCustomValidity("");
      setPhoto(undefined);
      setError("");
    };
    form?.addEventListener("reset", reset);
    form?.addEventListener("submit", closeCamera);
    return () => {
      form?.removeEventListener("reset", reset);
      form?.removeEventListener("submit", closeCamera);
      cameraRequest.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function updateFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    const valid = !file || (proofTypes.includes(file.type) && file.size > 0 && file.size <= attachmentLimit);
    input.setCustomValidity(valid ? "" : invalidProof);
    setError(valid ? "" : invalidProof);
    setPhoto(valid && file && photoTypes.includes(file.type) ? file : undefined);
  }

  function attachPhoto(file: File) {
    if (!fileInput.current) return;
    if (!photoTypes.includes(file.type) || !file.size || file.size > attachmentLimit) {
      setError(invalidProof);
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.current.files = transfer.files;
    updateFile(fileInput.current);
    closeCamera();
  }

  async function openCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      nativeCamera.current?.click();
      return;
    }
    const request = ++cameraRequest.current;
    setCamera(true);
    setReady(false);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (request !== cameraRequest.current || !video.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      video.current.srcObject = media;
    } catch {
      if (request !== cameraRequest.current) return;
      closeCamera();
      setError("Não foi possível abrir a câmera. Confira a permissão do navegador ou anexe uma foto.");
    }
  }

  function capturePhoto() {
    const frame = video.current;
    if (!frame?.videoWidth || !frame.videoHeight) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(frame.videoWidth, frame.videoHeight));
    canvas.width = Math.max(1, Math.round(frame.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(frame.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);
    const request = cameraRequest.current;
    canvas.toBlob((blob) => {
      if (request !== cameraRequest.current) return;
      if (!blob) {
        setError("A foto não pôde ser capturada. Tente novamente.");
        return;
      }
      attachPhoto(new File([blob], "comprovante.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.85);
  }

  return <details className="record-details delivery-proof" onToggle={(event) => { if (!event.currentTarget.open) closeCamera(); }}>
    <summary>Comprovante (opcional)</summary>
    <div className="field">
      <label htmlFor={id}>Anexar comprovante</label>
      <input id={id} ref={fileInput} name="proof" type="file" accept={proofTypes.join(",")} aria-describedby={id + "-help"}
        onChange={(event) => { closeCamera(); updateFile(event.currentTarget); }} />
      <small id={id + "-help"}>{replacing ? "Um novo arquivo substitui o comprovante atual. " : ""}PDF, PNG ou JPEG de até 3 MB.</small>
      <input ref={nativeCamera} type="file" accept={photoTypes.join(",")} capture="environment" hidden onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) attachPhoto(file);
        event.currentTarget.value = "";
      }} />
      <div className={camera ? "proof-camera" : undefined} hidden={!camera}>
        <video ref={video} autoPlay playsInline muted onCanPlay={() => setReady(true)} aria-label="Prévia da câmera" />
        <div className="operation-actions">
          <button type="button" className="button primary" disabled={!ready} onClick={capturePhoto}>Capturar foto</button>
          <button type="button" className="button" onClick={closeCamera}>Fechar câmera</button>
        </div>
      </div>
      {!camera && <div><button type="button" className="button" onClick={openCamera}>Tirar foto</button></div>}
      {error && <small className="feedback error" role="alert">{error}</small>}
      {preview && <div className="replacement-photo">
        <img src={preview} alt="Prévia do comprovante" />
        <button type="button" className="text-action" onClick={() => {
          if (!fileInput.current) return;
          fileInput.current.value = "";
          updateFile(fileInput.current);
          fileInput.current.focus();
        }}>Remover foto</button>
      </div>}
    </div>
  </details>;
}
