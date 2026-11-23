"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";

const storageKey = "epi.sidebar.collapsed";

export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let preference = document.documentElement.dataset.epiSidebar === "compact";
    try {
      preference = localStorage.getItem(storageKey) === "true";
    } catch {
      // The menu remains usable when persistent storage is unavailable.
    }
    document.documentElement.dataset.epiSidebar = preference ? "compact" : "full";
    setCollapsed(preference);
  }, []);

  const label = collapsed ? "Expandir menu lateral" : "Recolher menu lateral";
  return <button className="sidebar-toggle" type="button" aria-label={label} title={label}
    aria-controls="epi-sidebar" aria-expanded={!collapsed} onClick={() => {
      const next = !collapsed;
      setCollapsed(next);
      document.documentElement.dataset.epiSidebar = next ? "compact" : "full";
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        // Keep the current preference for this page.
      }
    }}><Icon name={collapsed ? "left_panel_open" : "left_panel_close"} /></button>;
}
