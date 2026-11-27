"use client";

import { useEffect, useRef, useState } from "react";

export function EmployeeContractFields({ units, contracts, initialUnit, initialContract, fixedContract = false, links }: {
  units: { id: string; name: string; active: boolean }[];
  contracts: { id: string; unitId: string; contractNumber: string | null }[];
  initialUnit: string;
  initialContract: string;
  fixedContract?: boolean;
  links?: { warehouseId: string; manages: boolean }[];
}) {
  const [unitId, setUnitId] = useState(initialUnit);
  const [primary, setPrimary] = useState(initialContract);
  const unitField = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const form = unitField.current?.form;
    const reset = () => { setUnitId(initialUnit); setPrimary(initialContract); };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initialUnit, initialContract]);
  const available = contracts.filter((contract) => contract.unitId === unitId);
  if (fixedContract) return <div className="field">
    <span>Unidade e contrato</span>
    <span>{units.find(({ id }) => id === unitId)?.name} · {available.find(({ id }) => id === initialContract)?.contractNumber ?? "Sem contrato"}</span>
    <input type="hidden" name="unit" value={initialUnit} />
    <input type="hidden" name="contract" value={initialContract} />
  </div>;
  return <>
    <label className="field">Unidade<select ref={unitField} name="unit" defaultValue={initialUnit} required
      onChange={(event) => { setUnitId(event.target.value); setPrimary(""); }}>
      <option value="" disabled>Selecione</option>
      {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{!unit.active ? " (inativa)" : ""}</option>)}
    </select></label>
    <div className="field">
      <label htmlFor="employee-contract">Contrato</label>
      <select id="employee-contract" name="contract" value={primary} onChange={(event) => setPrimary(event.target.value)}>
        <option value="">{unitId ? "Sem contrato" : "Selecione a unidade"}</option>
        {available.map((contract) => <option key={contract.id} value={contract.id}>{contract.contractNumber}</option>)}
      </select>
    </div>
    {links && <fieldset className="inline-item-fields">
      <legend>Contratos vinculados</legend>
      <input type="hidden" name="contractLinks" value="1" />
      {contracts.length === 0 && <p>Nenhum contrato disponível.</p>}
      {contracts.map((contract) => <div key={contract.id}>
        <label className="check">
          <input type="checkbox" name="additionalContract" value={contract.id} disabled={contract.id === primary}
            key={String(contract.id === primary)} defaultChecked={contract.id === primary || links.some(({ warehouseId }) => warehouseId === contract.id)} />
          {contract.contractNumber} · {units.find(({ id }) => id === contract.unitId)?.name}
        </label>
        <label className="check">
          <input type="checkbox" name="managedContract" value={contract.id} defaultChecked={links.some(({ warehouseId, manages }) => warehouseId === contract.id && manages)} />
          Gerência no contrato {contract.contractNumber}
        </label>
      </div>)}
      <small>A permissão por contrato é aplicada quando a conta tem o perfil Gerência.</small>
    </fieldset>}
  </>;
}
