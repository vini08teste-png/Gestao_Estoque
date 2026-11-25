import type { ReactNode } from "react";

export function RowActions({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div>
    <button type="button" className="button row-actions-trigger" popoverTarget={id} aria-label={label} title="Ações">⋯</button>
    <div id={id} className="panel row-actions-popover" popover="auto" role="group" aria-label={label}>{children}</div>
  </div>;
}
