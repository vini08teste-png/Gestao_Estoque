"use client";

export function ReportTypeSelect({ selected, options, individual }: {
  selected: string; options: [string, string][]; individual: string;
}) {
  return <div className="field"><label htmlFor="report-type">Relatório</label><select id="report-type" name="tipo" defaultValue={selected}
    onChange={({ currentTarget }) => {
      if (selected === individual || currentTarget.value === individual) currentTarget.form?.requestSubmit();
    }}>
    {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
  </select></div>;
}

export function PrintReportActions() {
  return <div className="operation-actions">
    <button className="button" type="button" onClick={() => window.print()}>Imprimir ficha</button>
    <button className="button primary" type="button" onClick={() => window.print()}>Salvar em PDF</button>
  </div>;
}
