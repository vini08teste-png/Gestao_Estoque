"use client";

import Link from "next/link";
import type { SyntheticEvent } from "react";
import { Icon } from "@/components/icon";

function positionLabel(event: SyntheticEvent<HTMLAnchorElement>) {
  const link = event.currentTarget;
  const { top, height } = link.getBoundingClientRect();
  link.style.setProperty("--nav-label-top", `${top + height / 2}px`);
}

export function WorkspaceNavLink({ href, active, icon, label }: {
  href: string; active: boolean; icon: string; label: string;
}) {
  return <Link href={href} aria-current={active ? "page" : undefined}
    onMouseEnter={positionLabel} onFocus={positionLabel}>
    <Icon name={icon} /><span className="nav-label">{label}</span>
  </Link>;
}
