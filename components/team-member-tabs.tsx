"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export function TeamMemberTabs({ tabs, initialTab, label }: {
  tabs: { label: string; content: ReactNode }[];
  initialTab: number;
  label: string;
}) {
  const prefix = useId();
  const [selected, setSelected] = useState(initialTab);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }

  return <div className="team-details">
    <div className="team-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button key={tab.label} ref={(button) => { buttons.current[index] = button; }}
        id={`${prefix}-tab-${index}`} type="button" role="tab" aria-selected={selected === index}
        tabIndex={selected === index ? 0 : -1} aria-controls={`${prefix}-panel-${index}`}
        onClick={() => setSelected(index)} onKeyDown={(event) => navigate(event, index)}>{tab.label}</button>)}
    </div>
    {tabs.map((tab, index) => <div key={tab.label} id={`${prefix}-panel-${index}`} role="tabpanel"
      aria-labelledby={`${prefix}-tab-${index}`} hidden={selected !== index} tabIndex={0}>{tab.content}</div>)}
  </div>;
}
