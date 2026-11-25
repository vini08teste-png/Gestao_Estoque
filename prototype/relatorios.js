const byId = (id) => document.getElementById(id);
const themes = {
  lynx: {
    name: "TSA Lynx", white: "1782911129843-seud1hunsq.png", color: "1782911123502-l3bu0r1oi6.png",
    people: [
      { id: "LP-0142", name: "Colaborador Exemplo 01", unit: "Canaã dos Carajás", role: "Técnico de manutenção" },
      { id: "LP-0237", name: "Colaboradora Exemplo 02", unit: "Marabá", role: "Assistente operacional" },
    ],
  },
  tsa: {
    name: "TSA", white: "1782910616235-fkyiyymb1v9.png", color: "1782910605261-h9zk4a76zz7.png",
    people: [
      { id: "TSA-0125", name: "Colaboradora Exemplo 03", unit: "Canaã dos Carajás", role: "Técnica de segurança" },
      { id: "TSA-0240", name: "Colaborador Exemplo 04", unit: "Marabá", role: "Auxiliar de operação" },
    ],
  },
};
const deliveries = [
  { person: 0, qty: 1, measure: "par", contract: "CTR-EXEMPLO-01", item: "Botina de segurança — Tipo B", ca: "32209", delivered: "2026-11-19", status: "Confirmado", category: "EPI" },
  { person: 0, qty: 1, measure: "un.", item: "Óculos de proteção com lente incolor", delivered: "2026-11-06", returned: "2026-11-18", status: "Devolvido para descarte", category: "EPI" },
  { person: 0, qty: 2, measure: "un.", item: "Camisa de uniforme operacional", delivered: "2026-11-03", status: "Entrega anterior", category: "Uniforme" },
  { person: 1, qty: 1, item: "Protetor auditivo tipo concha", ca: "33835", delivered: "2026-11-20", status: "Aguardando confirmação", category: "EPI" },
];
const pending = [
  { person: 1, type: "Recebimento", item: deliveries[3].item, qty: 1, date: "2026-11-20", status: "Aguardando confirmação" },
  { person: 0, type: "Solicitação", item: "Luva de proteção mecânica", qty: 2, date: "2026-11-19", status: "Aguardando entrega" },
];
const deadlines = [
  { type: "Validade do CA", item: deliveries[0].item, reference: "CA 32209", date: "2026-12-01", status: "Em 6 dias" },
  { type: "Validade do produto", item: "Luva de proteção mecânica", reference: "Contrato de exemplo", unit: "Marabá", date: "2026-12-08", status: "Em 13 dias" },
];

const coreColumns = [
  ["qty", "Quantidade", "number"],
  ["measure", "Unidade de medida", "nowrap measure", ["Unidade", "de medida"]],
  ["item", "Especificação do EPI", "specification"],
  ["ca", "Nº do CA", "number certificate"],
  ["contract", "Número do contrato", "nowrap", ["Número", "do contrato"]],
  ["delivered", "Data de entrega", "nowrap", ["Data de", "entrega"]],
  ["returned", "Data de devolução", "nowrap", ["Data de", "devolução"]],
];
const columns = {
  deliveries: [
    ["employee", "Colaborador", "person"],
    ...coreColumns,
    ["company", "Empresa", "nowrap"],
    ["unit", "Unidade", "location"],
    ["status", "Recebimento", "location"],
  ],
  pending: [
    ["employee", "Colaborador", "person"], ["company", "Empresa", "nowrap"], ["unit", "Unidade", "location"],
    ["type", "Tipo", "nowrap"], ["item", "Item", "specification"], ["qty", "Quantidade", "number"],
    ["date", "Data", "nowrap"], ["status", "Situação", "location"],
  ],
  deadlines: [
    ["company", "Empresa", "nowrap"], ["type", "Tipo de alerta", "nowrap"], ["item", "Item", "specification"],
    ["reference", "Referência", "location"], ["unit", "Unidade", "location"], ["date", "Prazo", "nowrap"],
    ["status", "Situação", "location"],
  ],
  sheet: [
    ...coreColumns.slice(0, 6),
    ["deliveryInitials", "Rubrica de entrega", "rubrica", ["Rubrica de", "entrega"]],
    coreColumns[6],
    ["returnInitials", "Rubrica de devolução", "rubrica", ["Rubrica de", "devolução"]],
  ],
};

const form = byId("filters");
const report = byId("report");
const unit = byId("unit");
const employee = byId("employee");
const company = byId("company");
let filter = { unit: "", begin: "", end: "", employee: "" };
let csvRows = [];
const dateKeys = new Set(["delivered", "returned", "date"]);
const formatDate = (value) => value.split("-").reverse().join("/");
const options = (placeholder, items) => [new Option(placeholder, ""), ...items.map(([label, value]) => new Option(label, value))];

function updateEmployees() {
  const previous = employee.value;
  const people = themes[company.value].people.filter((person) => !unit.value || person.unit === unit.value);
  employee.replaceChildren(...options("Selecione um colaborador", people.map(({ name, id }) => [`${name} · ${id}`, id])));
  if (people.some(({ id }) => id === previous)) employee.value = previous;
}

function applyTheme() {
  const theme = themes[company.value];
  document.documentElement.dataset.company = company.value;
  byId("company-name").textContent = theme.name;
  byId("sheet-company").textContent = theme.name;
  for (const [id, logo] of [["brand-logo", theme.white], ["sheet-logo", theme.color]]) {
    byId(id).src = `../figures/${logo}`;
    byId(id).alt = theme.name;
  }
  const previous = unit.value;
  const locations = [...new Set(theme.people.map((person) => person.unit))];
  unit.replaceChildren(...options("Todas as unidades autorizadas", locations.map((location) => [location, location])));
  if (locations.includes(previous)) unit.value = previous;
  updateEmployees();
  filter.employee = "";
  render();
}

function makeTable(table, layout, rows, print = false) {
  table.replaceChildren();
  const header = table.createTHead().insertRow();
  for (const [, title, className, lines] of layout) {
    const th = document.createElement("th");
    th.scope = "col";
    th.className = className || "";
    if (lines) {
      th.classList.add("compact-title");
      for (const line of lines) {
        const span = document.createElement("span");
        span.textContent = line;
        th.append(span, " ");
      }
    } else th.textContent = title;
    header.append(th);
  }
  const body = table.createTBody();
  for (const record of rows) {
    const row = body.insertRow();
    for (const [key, , className] of layout) {
      const cell = row.insertCell();
      cell.className = className || "";
      const value = record[key];
      if (key === "employee") {
        const name = document.createElement("strong");
        name.textContent = value.name;
        const registration = document.createElement("small");
        registration.textContent = `Matrícula ${value.id}`;
        cell.append(name, registration);
      } else if (dateKeys.has(key) && value) {
        const time = document.createElement("time");
        time.dateTime = value;
        time.textContent = formatDate(value);
        cell.append(time);
      } else cell.textContent = value == null || value === "" ? (print ? "" : "—") : value;
    }
  }
}

function renderSheet(person, rows) {
  byId("sheet").hidden = !person;
  byId("sheet-empty").hidden = Boolean(person);
  byId("sheet-message").textContent = "Selecione um colaborador e clique em Gerar ficha.";
  for (const id of ["print", "pdf"]) byId(id).disabled = !person;
  if (!person) return;
  const period = [filter.begin && formatDate(filter.begin), filter.end && formatDate(filter.end)];
  const periodText = period[0] && period[1] ? `${period[0]} a ${period[1]}` :
    period[0] ? `A partir de ${period[0]}` : period[1] ? `Até ${period[1]}` : "Todos os registros";
  const fields = [["Colaborador", person.name], ["Matrícula", person.id], ["Função", person.role], ["Unidade", person.unit], ["Período", periodText]];
  byId("sheet-data").replaceChildren(...fields.map(([label, value]) => {
    const group = document.createElement("div");
    const title = document.createElement("dt");
    const text = document.createElement("dd");
    title.textContent = label;
    text.textContent = value || "";
    group.append(title, text);
    return group;
  }));
  makeTable(byId("sheet-table"), columns.sheet, rows, true);
  byId("sheet-no-records").hidden = rows.length !== 0;
}

function render() {
  const kind = report.value;
  const individual = kind === "sheet";
  const theme = themes[company.value];
  byId("sheet").hidden = true;
  byId("sheet-empty").hidden = true;
  byId("report-view").hidden = individual;
  byId("employee-field").hidden = !individual;
  employee.disabled = !individual;
  employee.required = individual;
  byId("apply").textContent = individual ? "Gerar ficha" : "Aplicar filtros";
  byId("csv").hidden = individual;
  byId("print").hidden = !individual;
  byId("pdf").hidden = !individual;
  const hint = byId("hint");
  hint.textContent = {
    pending: "Solicitações em aberto e entregas aguardando confirmação de recebimento.",
    deadlines: "Sem data final, o relatório usa a janela de alerta da empresa.",
  }[kind] || "";
  hint.hidden = !hint.textContent;
  const source = { deliveries, pending, deadlines, sheet: deliveries }[kind];
  const rows = source.map((record) => {
    const person = theme.people[record.person];
    return { ...record, company: theme.name, employee: person, unit: person?.unit ?? record.unit };
  }).filter((row) => {
    const date = row.delivered ?? row.date;
    const matchesUnit = !filter.unit || row.unit === filter.unit || (kind === "deadlines" && !row.unit);
    return matchesUnit && (!filter.begin || date >= filter.begin) && (!filter.end || date <= filter.end);
  });
  if (kind !== "deadlines") rows.sort((a, b) => (b.delivered ?? b.date).localeCompare(a.delivered ?? a.date));

  if (individual) {
    const person = theme.people.find(({ id, unit: location }) => id === filter.employee && (!filter.unit || filter.unit === location));
    renderSheet(person, rows.filter((row) => row.employee === person && row.category === "EPI"));
    return;
  }

  byId("report-heading").textContent = report.selectedOptions[0].textContent;
  byId("count").textContent = `${rows.length} ${rows.length === 1 ? "registro" : "registros"}`;
  byId("report-scroll").hidden = !rows.length;
  byId("report-empty").hidden = Boolean(rows.length);
  makeTable(byId("report-table"), columns[kind], rows);
  csvRows = rows;
}

function downloadCsv() {
  const layout = columns[report.value];
  const rows = csvRows.map((record) => layout.map(([key]) => {
    const value = record[key];
    if (key === "employee") return `${value.name} · ${value.id}`;
    return dateKeys.has(key) && value ? formatDate(value) : value ?? "";
  }));
  const encodeRow = (cells) => cells.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";");
  const csv = [layout.map(([, title]) => title), ...rows].map(encodeRow).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-${report.value}-teste.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const begin = data.get("inicio");
  const end = data.get("fim");
  const invalid = Boolean(begin && end && begin > end);
  byId("range-error").hidden = !invalid;
  if (invalid) return;
  filter = { unit: unit.value, begin, end, employee: employee.value };
  render();
});
report.addEventListener("change", () => {
  byId("range-error").hidden = true;
  render();
});
unit.addEventListener("change", updateEmployees);
company.addEventListener("change", applyTheme);
byId("csv").addEventListener("click", downloadCsv);
for (const id of ["print", "pdf"]) byId(id).addEventListener("click", () => window.print());
applyTheme();
