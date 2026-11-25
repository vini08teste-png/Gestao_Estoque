"use client";

import { useEffect, useRef, useState } from "react";

export function EmployeeContractFields({ units, contracts, initialUnit, initialContract, fixedContract = false }: {
  units: { id: string; name: string; active: boolean }[];
  contracts: { id: string; unitId: string; contractNumber: string | null }[];
  initialUnit: string;
  initialContract: string;
  fixedContract?: boolean;
}) {
  const [unitId, setUnitId] = useState(initialUnit);
  const unitField = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const form = unitField.current?.form;
    const reset = () => setUnitId(initialUnit);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initialUnit]);
  const available = contracts.filter((contract) => contract.unitId === unitId);
  if (fixedContract) return <div className="field">
    <span>Unidade e contrato</span>
    <span>{units.find(({ id }) => id === unitId)?.name} · {available.find(({ id }) => id === initialContract)?.contractNumber ?? "Sem contrato"}</span>
    <input type="hidden" name="unit" value={initialUnit} />
  </div>;
  return <>
    <label className="field">Unidade<select ref={unitField} name="unit" defaultValue={initialUnit} required
      onChange={(event) => setUnitId(event.target.value)}>
      <option value="" disabled>Selecione</option>
      {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{!unit.active ? " (inativa)" : ""}</option>)}
    </select></label>
    <div className="field">
      <label htmlFor="employee-contract">Contrato</label>
      <select id="employee-contract" key={unitId} name="contract" defaultValue={unitId === initialUnit ? initialContract : ""}>
        <option value="">{unitId ? "Sem contrato" : "Selecione a unidade"}</option>
        {available.map((contract) => <option key={contract.id} value={contract.id}>{contract.contractNumber}</option>)}
      </select>
    </div>
  </>;
}
