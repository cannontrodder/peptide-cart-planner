const $ = (id) => document.getElementById(id);

const state = {
  settings: {
    reconstitutionMl: 3,
    unitsPerMl: 100,
    clicksPerDose: 40,
    dosesPerCart: 4,
    maxVialMl: 3,
    maxCartMl: 3,
  },
  vialRows: [
    { id: crypto.randomUUID(), label: "Vial A", mg: 30, count: 2 },
    { id: crypto.randomUUID(), label: "Vial B", mg: 50, count: 1 },
  ],
  cartRows: [
    { id: crypto.randomUUID(), label: "Cart A", doseMg: 2.5, count: 2 },
    { id: crypto.randomUUID(), label: "Cart B", doseMg: 5, count: 1 },
  ],
};

const els = {
  reconstitutionMl: $("reconstitutionMl"),
  unitsPerMl: $("unitsPerMl"),
  vialBody: $("vialBody"),
  cartBody: $("cartBody"),
  addVial: $("addVial"),
  addCart: $("addCart"),
  loadExample: $("loadExample"),
  availableMg: $("availableMg"),
  requiredMg: $("requiredMg"),
  vialsUsed: $("vialsUsed"),
  leftoverMg: $("leftoverMg"),
  alerts: $("alerts"),
  thawList: $("thawList"),
  planBody: $("planBody"),
  notes: $("notes"),
};

const fmt = {
  mg: (value) => `${Number(value).toFixed(2)} mg`,
  ml: (value) => `${Number(value).toFixed(2)} mL`,
  units: (value) => `${Number(value).toFixed(1)} clicks`,
  ratio: (value) => `${Number(value).toFixed(2)} mg/mL`,
  integer: (value) => `${Math.round(Number(value))}`,
};

function readNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampRow(row, kind) {
  if (kind === "vial") {
    row.mg = Math.max(0, readNumber(row.mg, 0));
    row.count = Math.max(1, Math.floor(readNumber(row.count, 1)));
  } else {
    row.doseMg = Math.max(0, readNumber(row.doseMg, 0));
    row.count = Math.max(1, Math.floor(readNumber(row.count, 1)));
  }
}

function renderRows() {
  els.vialBody.innerHTML = state.vialRows
    .map(
      (row) => `
        <tr data-id="${row.id}" data-kind="vial">
          <td><input data-field="label" value="${escapeHtml(row.label)}" /></td>
          <td><input data-field="mg" type="number" min="0" step="0.1" value="${row.mg}" /></td>
          <td><input data-field="count" type="number" min="1" step="1" value="${row.count}" /></td>
          <td><button class="tiny danger" data-action="remove-row" aria-label="Remove vial">Remove</button></td>
        </tr>`
    )
    .join("");

  els.cartBody.innerHTML = state.cartRows
    .map(
      (row) => `
        <tr data-id="${row.id}" data-kind="cart">
          <td><input data-field="label" value="${escapeHtml(row.label)}" /></td>
          <td><input data-field="doseMg" type="number" min="0" step="0.1" value="${row.doseMg}" /></td>
          <td><input data-field="count" type="number" min="1" step="1" value="${row.count}" /></td>
          <td><button class="tiny danger" data-action="remove-row" aria-label="Remove cart">Remove</button></td>
        </tr>`
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getInputs() {
  state.settings.reconstitutionMl = Math.min(3, Math.max(0.1, readNumber(els.reconstitutionMl.value, 3)));
  state.settings.unitsPerMl = Math.max(1, readNumber(els.unitsPerMl.value, 100));

  state.vialRows.forEach((row) => clampRow(row, "vial"));
  state.cartRows.forEach((row) => clampRow(row, "cart"));
}

function expandVials() {
  const list = [];
  for (const row of state.vialRows) {
    for (let i = 0; i < row.count; i += 1) {
      list.push({
        id: `${row.id}-${i}`,
        label: row.label || "Vial",
        mg: row.mg,
      });
    }
  }
  return list.sort((a, b) => b.mg - a.mg);
}

function renderStructure() {
  renderRows();
}

function renderResults() {
  getInputs();

  const {
    reconstitutionMl,
    unitsPerMl,
    clicksPerDose,
    dosesPerCart,
    maxCartMl,
  } = state.settings;

  const doseVolumeMl = clicksPerDose / unitsPerMl;
  const penVolumeMl = doseVolumeMl * dosesPerCart;

  const cartPlans = state.cartRows
    .filter((row) => row.label.trim() || row.doseMg > 0)
    .map((row) => {
      const doseMg = row.doseMg;
      const pens = row.count;
      const mgPerPen = doseMg * dosesPerCart;
      const totalMg = mgPerPen * pens;
      return {
        id: row.id,
        label: row.label || "Cart",
        doseMg,
        pens,
        mgPerPen,
        totalMg,
        penVolumeMl,
        totalVolumeMl: penVolumeMl * pens,
        requiredConcentration: doseVolumeMl > 0 ? doseMg / doseVolumeMl : 0,
      };
    })
    .sort((a, b) => b.totalMg - a.totalMg);

  const totalAvailableMg = expandVials().reduce((sum, vial) => sum + vial.mg, 0);
  const totalRequiredMg = cartPlans.reduce((sum, plan) => sum + plan.totalMg, 0);

  const vials = expandVials();
  let remainingNeed = totalRequiredMg;
  const selected = [];
  for (const vial of vials) {
    if (remainingNeed <= 0) break;
    selected.push({
      ...vial,
      usedMg: Math.min(vial.mg, remainingNeed),
    });
    remainingNeed -= vial.mg;
  }

  const thawedMg = selected.reduce((sum, vial) => sum + vial.mg, 0);
  const leftoverMg = Math.max(0, thawedMg - totalRequiredMg);
  const thawedVolumeMl = selected.length * reconstitutionMl;
  const stockConcentration = thawedVolumeMl > 0 ? thawedMg / thawedVolumeMl : 0;
  const totalCartVolumeMl = cartPlans.reduce((sum, plan) => sum + plan.totalVolumeMl, 0);
  const availableShortfall = Math.max(0, totalRequiredMg - totalAvailableMg);

  const alerts = [];
  if (totalRequiredMg <= 0) alerts.push("Add at least one cart with a positive dose.");
  if (totalAvailableMg <= 0) alerts.push("Add at least one vial with peptide in it.");
  if (availableShortfall > 0) {
    alerts.push(`Shortfall: you are ${fmt.mg(availableShortfall)} short on peptide for the requested carts.`);
  }
  if (penVolumeMl > maxCartMl) {
    alerts.push(`A pen would be ${fmt.ml(penVolumeMl)}, which exceeds the 3 mL cart limit.`);
  }
  if (stockConcentration > 0 && cartPlans.some((plan) => plan.requiredConcentration > stockConcentration)) {
    alerts.push("At the chosen reconstitution volume, at least one cart batch needs a stronger stock than this pool provides. Reduce vial water or use stronger vials.");
  }

  els.availableMg.textContent = fmt.mg(totalAvailableMg);
  els.requiredMg.textContent = fmt.mg(totalRequiredMg);
  els.vialsUsed.textContent = selected.length ? `${selected.length} vial${selected.length === 1 ? "" : "s"}` : "-";
  els.leftoverMg.textContent = fmt.mg(leftoverMg);
  els.alerts.textContent = alerts.join(" ");

  els.thawList.innerHTML = selected.length
    ? selected
        .map((vial) => {
          const usedMg = Math.min(vial.usedMg, vial.mg);
          return `<li><strong>${escapeHtml(vial.label)}</strong> ${fmt.mg(usedMg)} used of ${fmt.mg(vial.mg)}. Reconstitute with up to ${fmt.ml(reconstitutionMl)}.</li>`;
        })
        .join("")
    : "<li>No vials selected yet.</li>";

  els.planBody.innerHTML = cartPlans.length
    ? cartPlans
        .map((plan) => {
          const stockWithdrawMl = stockConcentration > 0 ? plan.totalMg / stockConcentration : 0;
          const topUpMl = plan.totalVolumeMl - stockWithdrawMl;
          const warning = topUpMl < -1e-9 ? "Needs stronger stock" : "";
          return `
            <tr>
              <td>${escapeHtml(plan.label)} x ${plan.pens}</td>
              <td>${fmt.mg(plan.totalMg)} total</td>
              <td>${fmt.ml(plan.totalVolumeMl)}</td>
              <td>${fmt.ml(Math.max(stockWithdrawMl, 0))}${warning ? `<div class="cell-note">${warning}</div>` : ""}</td>
              <td>${fmt.ml(Math.max(topUpMl, 0))}</td>
            </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="empty">Add carts to see a plan.</td></tr>`;

  const notes = [];
  notes.push(`Keep each pen at ${state.settings.clicksPerDose} clicks per dose and ${state.settings.dosesPerCart} doses per pen.`);
  notes.push(`With ${state.settings.unitsPerMl} units per mL, each dose volume is ${fmt.ml(doseVolumeMl)} and each pen volume is ${fmt.ml(penVolumeMl)}.`);
  notes.push(`The planner chooses the largest vials first so it thaws the fewest vials needed to cover the run.`);
  notes.push(`Treat any thawed remainder as immediate-use reserve only. Do not assume it can be refrozen.`);
  if (stockConcentration > 0) {
    notes.push(`If you reconstitute the selected vials with ${fmt.ml(reconstitutionMl)} each, the working pool concentration is ${fmt.ratio(stockConcentration)}.`);
  }
  els.notes.innerHTML = notes.map((note) => `<li>${note}</li>`).join("");
}

function addRow(kind) {
  const id = crypto.randomUUID();
  if (kind === "vial") {
    state.vialRows.push({ id, label: `Vial ${state.vialRows.length + 1}`, mg: 10, count: 1 });
  } else {
    state.cartRows.push({ id, label: `Cart ${state.cartRows.length + 1}`, doseMg: 2.5, count: 1 });
  }
  renderStructure();
  renderResults();
}

function loadExample() {
  state.settings.reconstitutionMl = 3;
  state.settings.unitsPerMl = 100;
  els.reconstitutionMl.value = 3;
  els.unitsPerMl.value = 100;
  state.vialRows = [
    { id: crypto.randomUUID(), label: "30 mg vials", mg: 30, count: 2 },
    { id: crypto.randomUUID(), label: "50 mg vial", mg: 50, count: 1 },
  ];
  state.cartRows = [
    { id: crypto.randomUUID(), label: "Low dose", doseMg: 2.5, count: 2 },
    { id: crypto.randomUUID(), label: "Higher dose", doseMg: 5, count: 1 },
  ];
  renderStructure();
  renderResults();
}

function wireEvents() {
  els.reconstitutionMl.addEventListener("input", renderResults);
  els.unitsPerMl.addEventListener("input", renderResults);
  els.addVial.addEventListener("click", () => addRow("vial"));
  els.addCart.addEventListener("click", () => addRow("cart"));
  els.loadExample.addEventListener("click", loadExample);

  document.body.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const row = target.closest("tr");
    if (!row) return;
    const id = row.getAttribute("data-id");
    const kind = row.getAttribute("data-kind");
    if (!id || !kind) return;
    const item = kind === "vial" ? state.vialRows.find((entry) => entry.id === id) : state.cartRows.find((entry) => entry.id === id);
    if (!item) return;

    const field = target.getAttribute("data-field");
    if (!field) return;
    item[field] = target.type === "number" ? readNumber(target.value, 0) : target.value;
    renderResults();
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.getAttribute("data-action") !== "remove-row") return;
    const row = target.closest("tr");
    if (!row) return;
    const id = row.getAttribute("data-id");
    const kind = row.getAttribute("data-kind");
    if (!id || !kind) return;

    if (kind === "vial") {
      state.vialRows = state.vialRows.filter((entry) => entry.id !== id);
    } else {
      state.cartRows = state.cartRows.filter((entry) => entry.id !== id);
    }
    renderStructure();
    renderResults();
  });
}

wireEvents();
renderStructure();
renderResults();
