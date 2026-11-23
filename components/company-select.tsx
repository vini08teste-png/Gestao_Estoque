"use client";

import { useRouter } from "next/navigation";

export function CompanySelect({ companyId, companies, section }: {
  companyId: string;
  companies: { id: string; name: string }[];
  section?: "alertas" | "relatorios";
}) {
  const router = useRouter();
  return (
    <div className="company-switch">
      <label htmlFor="company">Empresa</label>
      <select id="company" value={companyId} onChange={(event) => router.push(`/${event.target.value}${section ? `/${section}` : ""}`)}>
        {companies.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </div>
  );
}
