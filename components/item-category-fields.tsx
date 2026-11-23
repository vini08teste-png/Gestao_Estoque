"use client";

import { useState } from "react";
import type { ItemCategory } from "@/generated/prisma/enums";

export function ItemCategoryFields({ initial, certificate, expires }: {
  initial: ItemCategory;
  certificate?: string;
  expires?: string;
}) {
  const [category, setCategory] = useState(initial);
  return <>
    <label className="field">Tipo de item
      <select name="category" value={category} onChange={(event) => setCategory(event.target.value as ItemCategory)}>
        <option value="EPI">EPI</option>
        <option value="UNIFORM">Uniforme</option>
      </select>
    </label>
    {category === "EPI" && <>
      <label className="field">CA<input name="certificate" defaultValue={certificate} maxLength={60} required /></label>
      <label className="field">Validade do CA<input name="caExpiresAt" type="date" defaultValue={expires} required /></label>
    </>}
  </>;
}
