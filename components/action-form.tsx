"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { FormResult } from "@/lib/forms";

export function ActionForm({ action, children, label = "Salvar", continueLabel, reset = false }: {
  action: (state: FormResult, data: FormData) => Promise<FormResult>;
  children?: ReactNode;
  label?: string;
  continueLabel?: string;
  reset?: boolean;
}) {
  const [result, dispatch, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (reset && result.success) form.current?.reset();
  }, [result, reset]);

  return (
    <form ref={form} className="form-stack" action={dispatch} onSubmit={(event) => {
      event.preventDefault();
      if (pending) return;
      const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
      startTransition(() => dispatch(data));
    }}>
      {children}
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={pending}>{pending ? "Aguarde…" : label}</button>
        {continueLabel && <button className="button" type="submit" name="continue" value="on" disabled={pending}>{continueLabel}</button>}
        {result.error && <p className="feedback error" role="alert">{result.error}</p>}
        {result.success && <p className="feedback success" role="status">{result.success}</p>}
      </div>
    </form>
  );
}
