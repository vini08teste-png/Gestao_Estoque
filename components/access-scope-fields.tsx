"use client";

import { useState } from "react";
import type { Role } from "@/generated/prisma/enums";
import { employeeCompanyName, roles } from "@/lib/organization";

export function AccessScopeFields({ employees, companyName, units, defaults }: {
  employees: { id: string; name: string; contractorCompany: string | null; unit: { name: string } }[];
  companyName: string;
  units: { id: string; name: string }[];
  defaults: { role: Role; employeeId: string; allUnits: boolean; unitIds: string[] };
}) {
  const [role, setRole] = useState(defaults.role);
  const [allUnits, setAllUnits] = useState(defaults.allUnits);
  const [selectedUnits, setSelectedUnits] = useState(defaults.unitIds);
  const needsEmployee = role === "EMPLOYEE" || role === "SUPERVISOR";
  const chooseUnits = role === "MANAGER" || role === "WAREHOUSE";

  return <>
    <div className="form-grid">
      <label className="field">Perfil de trabalho
        <select name="role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {Object.entries(roles).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label className="field">Colaborador vinculado{needsEmployee ? "" : " (opcional)"}
        <select name="employee" defaultValue={defaults.employeeId} required={needsEmployee}>
          <option value="">{needsEmployee ? "Selecione a pessoa" : "Sem vínculo pessoal"}</option>
          {employees.map((person) => <option key={person.id} value={person.id}>
            {person.name} · {employeeCompanyName(companyName, person.contractorCompany)} · {person.unit.name}</option>)}
        </select>
        <small>{role === "SUPERVISOR" ? "A pessoa acompanha a equipe do contrato vinculado ao seu cadastro."
          : role === "EMPLOYEE" ? "Usa a unidade do cadastro para abrir pedidos pessoais."
          : "Vincule o cadastro da pessoa para liberar Meus itens e os pedidos pessoais."}</small>
      </label>
    </div>
    {chooseUnits && <fieldset className="unit-choices">
      <legend>Unidades autorizadas</legend>
      <p>{role === "WAREHOUSE" ? "O acesso vale para todos os contratos de estoque das unidades selecionadas."
        : "Selecione as unidades onde o gestor poderá operar."}</p>
      <label className="check"><input type="checkbox" name="allUnits" checked={allUnits}
        onChange={(event) => setAllUnits(event.target.checked)} /> Todas as unidades</label>
      {!allUnits && <div className="unit-checkboxes">
        {units.map((unit) => <label className="check" key={unit.id}>
          <input type="checkbox" name="units" value={unit.id} checked={selectedUnits.includes(unit.id)}
            onChange={(event) => {
              const checked = event.target.checked;
              setSelectedUnits((ids) => checked ? [...ids, unit.id] : ids.filter((id) => id !== unit.id));
            }} /> {unit.name}
        </label>)}
      </div>}
    </fieldset>}
  </>;
}
