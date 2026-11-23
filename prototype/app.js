"use strict";

// As datas fictícias são relativas ao dia de abertura do protótipo.
const today = new Date();
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const dates = (offset) => {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  const iso = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0")).join("-");
  return `<time datetime="${iso}">${dateFormat.format(date)}</time>`;
};

const companies = {
  tsa: {
    name: "TSA",
    color: "#a51e22",
    units: ["Belo Horizonte", "Contagem"],
    demoPerson: "T101",
    people: [
      ["T101", "Colaborador Exemplo TSA 01", "Belo Horizonte"],
      ["T102", "Colaborador Exemplo TSA 02", "Belo Horizonte"],
      ["T103", "Colaborador Exemplo TSA 03", "Contagem"],
      ["T104", "Colaborador Exemplo TSA 04", "Contagem"],
      ["T105", "Colaborador Exemplo TSA 05", "Belo Horizonte"],
      ["T106", "Colaborador Exemplo TSA 06", "Contagem"],
    ],
    deliveries: [
      ["T-046", "T102", "Óculos de proteção", "TS-018", 1, -1, 90, "Almoxarife Exemplo TSA 01"],
      ["T-045", "T101", "Luva anticorte", "TS-043", 2, -3, 30, "Almoxarife Exemplo TSA 01"],
      ["T-044", "T103", "Botina de segurança", "TS-051", 1, -5, 180, "Almoxarife Exemplo TSA 02"],
      ["T-043", "T104", "Protetor auricular", "TS-022", 1, -14, 30, "Almoxarife Exemplo TSA 02"],
      ["T-042", "T101", "Capacete de segurança", "TS-032", 1, -26, 30, "Almoxarife Exemplo TSA 01"],
      ["T-041", "T105", "Respirador PFF2", "TS-061", 2, -33, 30, "Almoxarife Exemplo TSA 01"],
      ["T-040", "T101", "Luva anticorte", "TS-014", 1, -37, 30, "Almoxarife Exemplo TSA 01"],
    ],
    requests: [
      ["TSA-021", "T101", "Óculos de proteção", 1, -1, "Pendente de aprovação", "Risco na lente do equipamento."],
      ["TSA-020", "T101", "Protetor auricular", 1, -4, "Aguardando entrega", "Substituição por desgaste."],
      ["TSA-019", "T103", "Botina de segurança", 1, -8, "Concluída", "Reposição para uso operacional."],
      ["TSA-018", "T104", "Luva anticorte", 2, -10, "Rejeitada", "Reposição para uso operacional.", "Item duplicado em outra solicitação."],
    ],
    certificates: [
      ["Capacete de segurança", "CA simulado T-01", "Belo Horizonte", 12],
      ["Botina de segurança", "CA simulado T-02", "Contagem", 26],
    ],
    lots: [
      ["Respirador PFF2", "TS-061", "Belo Horizonte", -2],
      ["Protetor auricular", "TS-022", "Contagem", 19],
    ],
  },
  lynx: {
    name: "TSA Lynx",
    color: "#303d82",
    units: ["Nova Lima", "Itabira"],
    demoPerson: "L201",
    people: [
      ["L201", "Colaborador Exemplo TSA Lynx 01", "Nova Lima"],
      ["L202", "Colaborador Exemplo TSA Lynx 02", "Itabira"],
      ["L203", "Colaborador Exemplo TSA Lynx 03", "Nova Lima"],
      ["L204", "Colaborador Exemplo TSA Lynx 04", "Itabira"],
    ],
    deliveries: [
      ["L-035", "L201", "Óculos de ampla visão", "LX-071", 1, 0, 90, "Almoxarife Exemplo TSA Lynx 01"],
      ["L-034", "L202", "Luva nitrílica", "LX-013", 2, -2, 30, "Almoxarife Exemplo TSA Lynx 02"],
      ["L-033", "L203", "Capacete com jugular", "LX-026", 1, -8, 90, "Almoxarife Exemplo TSA Lynx 01"],
      ["L-032", "L201", "Protetor auditivo tipo concha", "LX-042", 1, -33, 30, "Almoxarife Exemplo TSA Lynx 01"],
      ["L-031", "L201", "Óculos de ampla visão", "LX-051", 1, -96, 90, "Almoxarife Exemplo TSA Lynx 01"],
    ],
    requests: [
      ["LYN-011", "L201", "Protetor auditivo tipo concha", 1, -2, "Aguardando entrega", "Reposição por desgaste da vedação."],
      ["LYN-010", "L201", "Óculos de ampla visão", 1, -6, "Concluída", "Troca do equipamento danificado."],
      ["LYN-009", "L204", "Capacete com jugular", 1, -7, "Cancelada", "Reposição do equipamento."],
    ],
    certificates: [
      ["Luva nitrílica", "CA simulado L-01", "Itabira", 8],
    ],
    lots: [
      ["Luva nitrílica", "LX-013", "Itabira", 6],
      ["Protetor auditivo tipo concha", "LX-042", "Nova Lima", 18],
      ["Óculos de ampla visão", "LX-071", "Nova Lima", 27],
    ],
  },
};

for (const company of Object.values(companies)) {
  company.people = company.people.map(([id, name, unit]) => ({ id, name, unit }));
  const peopleById = new Map(company.people.map((person) => [person.id, person]));
  const latestByPerson = new Set();
  company.deliveries = company.deliveries.map(([id, personId, item, lot, quantity, date, days, operator]) => {
    const person = peopleById.get(personId);
    const key = `${personId}/${item}`;
    const current = !latestByPerson.has(key);
    latestByPerson.add(key);
    return { id, person, unit: person.unit, item, lot, quantity, date, due: date + days, days, operator, current };
  });
  company.requests = company.requests.map(([id, personId, item, quantity, date, status, reason, note]) => {
    const person = peopleById.get(personId);
    return { id, person, unit: person.unit, item, quantity, date, status, reason, note };
  });
}

const pages = {
  dashboard: "Dashboard",
  "meus-epis": "Meus EPIs",
  solicitacoes: "Solicitações",
  entregas: "Entregas",
};
const alertTypes = {
  certificates: { title: "Validade do CA", icon: "sheet", dateLabel: "Validade" },
  lots: { title: "Validade de produto ou lote", icon: "box", dateLabel: "Validade" },
  replacements: { title: "Previsão de troca", icon: "shield", dateLabel: "Troca prevista" },
};
const requestTones = {
  "Pendente de aprovação": "warning",
  "Aguardando entrega": "info",
  "Concluída": "ok",
  "Rejeitada": "danger",
};
const main = document.querySelector("main");
const companySelect = document.querySelector("#company");
const dialog = document.querySelector("#details");
const menu = document.querySelector(".menu-toggle");
let company = companies.tsa;
let page = "dashboard";
let selectedUnit = "";

const icon = (name) => `<span class="icon ${name}" aria-hidden="true"></span>`;
const badge = (label, tone = "") => `<span class="badge ${tone}">${label}</span>`;
const option = (value, label = value) => `<option value="${value}">${label}</option>`;
const select = (id, options) => `<div class="select-wrap"><select id="${id}">${options.join("")}</select></div>`;
const inUnit = (records) => records.filter(({ unit }) => !selectedUnit || unit === selectedUnit);
const dateOrder = (first, second) => first.due - second.due;

function table(label, columns, records, renderCells) {
  if (!records.length) return '<p class="empty">Nenhum registro encontrado.</p>';
  return `
    <div class="table-scroll" role="region" aria-label="${label}" tabindex="0">
      <table aria-label="${label}">
        <thead><tr>${columns.map((column) => `<th scope="col">${column}</th>`).join("")}</tr></thead>
        <tbody>${records.map((record) => `<tr>${renderCells(record).map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function detailButton(type, id, label = "Detalhes") {
  return `<button type="button" class="button" data-detail="${type}" data-id="${id}" aria-label="${label === "Detalhes" ? `Detalhes de ${id}` : label}">${label}</button>`;
}

function thresholdBadge(due, pastLabel) {
  if (due < 0) return badge(pastLabel, "danger");
  if (due === 0) return badge("Hoje", "warning");
  return badge(`Em ${due} ${due === 1 ? "dia" : "dias"}`, due <= 7 ? "warning" : "info");
}

function alertsFor(type) {
  if (type === "replacements") {
    return inUnit(company.deliveries)
      .filter((delivery) => delivery.current && delivery.due <= 30)
      .map(({ person, item, unit, due }) => ({ item, reference: person.name, unit, due }))
      .sort(dateOrder);
  }
  return inUnit(company[type].map(([item, reference, unit, due]) => ({ item, reference, unit, due })))
    .filter(({ due }) => due <= 30)
    .sort(dateOrder);
}

function renderDashboard() {
  main.innerHTML = `
    <section class="hero" aria-labelledby="page-title">
      <div><h1 id="page-title">Visão geral</h1><p>Acompanhe as entregas, as solicitações e os prazos de EPI.</p></div>
      <div class="unit-filter">
        <label for="dashboard-unit">Unidade</label>
        ${select("dashboard-unit", [option("", "Todas as unidades"), ...company.units.map((unit) => option(unit))])}
      </div>
    </section>
    <div id="dashboard-results"></div>`;
  const unit = document.querySelector("#dashboard-unit");
  unit.value = selectedUnit;
  unit.addEventListener("change", () => {
    selectedUnit = unit.value;
    renderDashboardResults();
  });
  renderDashboardResults();
}

function renderDashboardResults() {
  const deliveries = inUnit(company.deliveries);
  const alertTotals = Object.fromEntries(Object.keys(alertTypes).map((type) => [type, alertsFor(type).length]));
  const metrics = [
    ["people", "Colaboradores", inUnit(company.people).length],
    ["box", "Entregas nos últimos 30 dias", deliveries.filter(({ date }) => date >= -29).length],
    ["sheet", "Solicitações em aberto", inUnit(company.requests).filter(({ status }) =>
      status === "Pendente de aprovação" || status === "Aguardando entrega").length],
    ["bell", "Alertas de prazo", Object.values(alertTotals).reduce((sum, value) => sum + value, 0)],
  ];
  document.querySelector("#dashboard-results").innerHTML = `
    <h2 class="section-title">Indicadores</h2>
    <div class="stats" aria-live="polite">
      ${metrics.map(([glyph, label, value]) => `
        <div class="stat"><span class="metric-icon">${icon(glyph)}</span><strong class="metric-value">${value}</strong><span class="metric-label">${label}</span></div>`).join("")}
    </div>
    <div class="dashboard-grid">
      <section class="panel" aria-labelledby="alert-heading">
        <header class="panel-heading"><div><h2 id="alert-heading">Alertas de prazo</h2><p>Prazos vencidos e próximos 30 dias</p></div></header>
        <ul class="alert-list">
          ${Object.entries(alertTypes).map(([type, { title, icon: glyph }]) => `
            <li><button class="alert-row" type="button" data-detail="alert" data-id="${type}">
              <span class="metric-icon">${icon(glyph)}</span><span class="alert-label">${title}</span><span class="alert-count">${alertTotals[type]}</span>
            </button></li>`).join("")}
        </ul>
      </section>
      <section class="panel" aria-labelledby="recent-heading">
        <header class="panel-heading"><h2 id="recent-heading">Entregas recentes</h2><a class="text-action" href="#entregas">Todas as entregas</a></header>
        ${table("Entregas recentes", ["EPI", "Colaborador", "Data"], deliveries.slice(0, 4),
          ({ item, person, date }) => [item, person.name, dates(date)])}
      </section>
    </div>`;
}

function heading(title, description) {
  return `<header class="page-heading"><h1 id="page-title">${title}</h1><p>${description}</p></header>`;
}

function definitionList(fields, className = "") {
  return `<dl class="${className}">${fields.map(([name, value]) =>
    `<div><dt>${name}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}

function renderMyEquipment() {
  const person = company.people.find(({ id }) => id === company.demoPerson);
  const deliveries = company.deliveries.filter((delivery) => delivery.person === person);
  const current = deliveries.filter((delivery) => delivery.current);
  main.innerHTML = `
    ${heading("Meus EPIs", `${person.name} · ${person.unit} · Matrícula ${person.id}`)}
    <h2 class="section-title">EPIs em uso</h2>
    <div class="epi-grid">${current.map(({ id, item, date, due, quantity }) => `
      <article class="epi-card">
        <div class="card-top"><span class="metric-icon">${icon("shield")}</span>
          ${due <= 30 ? thresholdBadge(due, "Troca atrasada") : badge("Em dia", "ok")}
        </div>
        <h3>${item}</h3>
        ${definitionList([["Entregue em", dates(date)], ["Próxima troca", dates(due)], ["Quantidade", quantity]])}
        ${detailButton("delivery", id)}
      </article>`).join("")}</div>
    <h2 class="section-title" id="history-heading">Histórico de entregas</h2>
    <section class="panel" aria-labelledby="history-heading">
      ${table("Histórico de entregas", ["EPI", "Quantidade", "Data", "Situação", "Ação"], deliveries,
        ({ id, item, quantity, date, current: active }) => [item, quantity, dates(date),
          active ? badge("Em uso", "info") : badge("Substituído"), detailButton("delivery", id)])}
    </section>`;
}

const searchable = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function renderRecords(type) {
  const isRequest = type === "requests";
  const records = company[type];
  const filters = isRequest ? Object.keys(requestTones).concat("Cancelada") : company.units;
  const field = isRequest ? "status" : "unit";
  const title = isRequest ? "Solicitações" : "Entregas";
  const description = isRequest ? "Consulte o andamento das solicitações de EPI da empresa." :
    "Consulte as entregas de EPI e as datas previstas de troca.";
  main.innerHTML = `
    ${heading(title, description)}
    <div class="filters">
      <div class="filter-field"><label for="search">Buscar por EPI, colaborador ou código</label><input id="search" type="search" placeholder="Digite para buscar"></div>
      <div class="filter-field"><label for="record-filter">${isRequest ? "Situação" : "Unidade"}</label>
        ${select("record-filter", [option("", isRequest ? "Todas as situações" : "Todas as unidades"), ...filters.map((value) => option(value))])}
      </div>
    </div>
    <section class="panel" aria-label="${title}">
      <p class="page-count" id="record-count" role="status"></p>
      <div id="record-results"></div>
    </section>`;
  const search = document.querySelector("#search");
  const filter = document.querySelector("#record-filter");
  const count = document.querySelector("#record-count");
  const results = document.querySelector("#record-results");
  const columns = ["Código", "EPI", "Colaborador", isRequest ? "Abertura" : "Entrega",
    isRequest ? "Situação" : "Próxima troca", "Ação"];
  const update = () => {
    const query = searchable(search.value);
    const filtered = records.filter((record) => (!filter.value || record[field] === filter.value) &&
      [record.item, record.person.name, record.id].some((value) => searchable(value).includes(query)));
    count.textContent = isRequest
      ? `${filtered.length} ${filtered.length === 1 ? "solicitação" : "solicitações"}`
      : `${filtered.length} ${filtered.length === 1 ? "entrega" : "entregas"}`;
    results.innerHTML = table(title, columns, filtered, (row) =>
      [row.id, row.item, row.person.name, dates(row.date),
        isRequest ? badge(row.status, requestTones[row.status]) : row.current ? dates(row.due) : "Substituído",
        detailButton(isRequest ? "request" : "delivery", row.id)]);
  };
  search.addEventListener("input", update);
  filter.addEventListener("change", update);
  update();
}

function showDetails(type, id) {
  let title;
  let body;
  if (type === "alert") {
    const alert = alertTypes[id];
    title = alert.title;
    body = table(title, ["EPI", type === "replacements" ? "Colaborador" : "Referência", "Unidade", alert.dateLabel, "Prazo"],
      alertsFor(id), ({ item, reference, unit, due }) =>
        [item, reference, unit, dates(due), thresholdBadge(due, type === "replacements" ? "Atrasada" : "Vencido")]);
  } else if (type === "delivery") {
    const row = company.deliveries.find((record) => record.id === id);
    title = `Entrega ${id}`;
    body = definitionList([
      ["EPI", row.item], ["Colaborador", row.person.name], ["Unidade", row.unit],
      ["Lote", row.lot], ["Quantidade", row.quantity], ["Data da entrega", dates(row.date)],
      ["Prazo de troca demonstrativo", `${row.days} dias`], ["Troca prevista no registro", dates(row.due)],
      ["Responsável", row.operator], ["Situação", row.current ? "Em uso" : "Substituído"],
    ], "detail-grid");
  } else {
    const row = company.requests.find((record) => record.id === id);
    title = `Solicitação ${id}`;
    const fields = [
      ["EPI", row.item], ["Colaborador", row.person.name], ["Unidade", row.unit],
      ["Quantidade", row.quantity], ["Abertura", dates(row.date)], ["Situação", badge(row.status, requestTones[row.status])],
      ["Motivo", row.reason],
    ];
    if (row.note) fields.push(["Justificativa da rejeição", row.note]);
    body = definitionList(fields, "detail-grid");
  }
  document.querySelector("#details-title").textContent = title;
  document.querySelector("#details-body").innerHTML = body;
  dialog.showModal();
}

function renderPage() {
  document.querySelector("#breadcrumb").textContent = pages[page];
  document.title = `${pages[page]} | Gestão de EPIs`;
  document.querySelectorAll("[data-page]").forEach((link) => {
    if (link.dataset.page === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (page === "dashboard") renderDashboard();
  else if (page === "meus-epis") renderMyEquipment();
  else renderRecords(page === "entregas" ? "deliveries" : "requests");
}

function setMenu(open) {
  document.querySelector(".shell").classList.toggle("menu-open", open);
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
}

menu.addEventListener("click", () => setMenu(menu.getAttribute("aria-expanded") === "false"));
document.querySelector(".sidebar").addEventListener("click", (event) => {
  if (event.target.closest("a") && menu.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    main.focus();
  }
});
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
});
window.addEventListener("hashchange", () => {
  const destination = location.hash.slice(1) || "dashboard";
  if (!Object.hasOwn(pages, destination)) return;
  page = destination;
  renderPage();
  main.focus();
  window.scrollTo(0, 0);
});
companySelect.addEventListener("change", () => {
  const key = companySelect.value;
  company = companies[key];
  selectedUnit = "";
  document.documentElement.dataset.company = key;
  document.querySelector("#brand-name").textContent = company.name;
  document.querySelector('meta[name="theme-color"]').content = company.color;
  renderPage();
});
main.addEventListener("click", (event) => {
  const button = event.target.closest("[data-detail]");
  if (button) showDetails(button.dataset.detail, button.dataset.id);
});

const initialPage = location.hash.slice(1);
if (Object.hasOwn(pages, initialPage)) page = initialPage;
companySelect.value = "tsa";
renderPage();
