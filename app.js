const $ = (id) => document.getElementById(id);

const state = {
  settings: {
    clicksPerDose: 40,
    dosesPerCart: 4,
    unitsPerMl: 100,
    maxVialMl: 3,
  },
  vialRows: [],
  stockRows: [],
  cartRows: [],
};

const STORAGE_KEY = "peptide-cart-planner-saved-setups";

const els = {
  vialBody: $("vialBody"),
  stockBody: $("stockBody"),
  cartBody: $("cartBody"),
  addVial: $("addVial"),
  addStock: $("addStock"),
  addCart: $("addCart"),
  saveSetup: $("saveSetup"),
  savedSetups: $("savedSetups"),
  availableMg: $("availableMg"),
  requiredMg: $("requiredMg"),
  vialsUsed: $("vialsUsed"),
  leftoverMg: $("leftoverMg"),
  alerts: $("alerts"),
  leftoverPanel: $("leftoverPanel"),
  leftoverSummary: $("leftoverSummary"),
  leftoverVolume: $("leftoverVolume"),
  leftoverDose: $("leftoverDose"),
  addLeftover: $("addLeftover"),
  thawList: $("thawList"),
  planBody: $("planBody"),
  notes: $("notes"),
};

const fmt = {
  mg: (value) => `${Number(value).toFixed(2)} mg`,
  ml: (value) => `${Number(value).toFixed(2)} mL`,
  clicks: (value) => `${Number(value).toFixed(0)} clicks`,
  ratio: (value) => `${Number(value).toFixed(2)} mg/mL`,
};

function readNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampRow(row, kind) {
  if (kind === "vial") {
    row.mg = Math.max(0, readNumber(row.mg, 0));
    row.count = Math.max(1, Math.floor(readNumber(row.count, 1)));
  } else if (kind === "stock") {
    row.mg = Math.max(0, readNumber(row.mg, 0));
    row.volumeMl = Math.min(3, Math.max(0.01, readNumber(row.volumeMl, 0.01)));
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

  els.stockBody.innerHTML = state.stockRows
    .map(
      (row) => `
        <tr data-id="${row.id}" data-kind="stock">
          <td><input data-field="label" value="${escapeHtml(row.label)}" /></td>
          <td><input data-field="mg" type="number" min="0" step="0.1" value="${row.mg}" /></td>
          <td><input data-field="volumeMl" type="number" min="0.01" max="3" step="0.01" value="${row.volumeMl}" /></td>
          <td><input data-field="count" type="number" min="1" step="1" value="${row.count}" /></td>
          <td><button class="tiny danger" data-action="remove-row" aria-label="Remove stock">Remove</button></td>
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

function cloneRows(rows) {
  return rows.map((row) => ({ ...row, id: crypto.randomUUID() }));
}

function getStoredSetups() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStoredSetups(setups) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(setups));
}

function renderSavedSetups() {
  const setups = getStoredSetups();
  if (!setups.length) {
    els.savedSetups.innerHTML = "";
    return;
  }

  els.savedSetups.innerHTML = setups
    .map(
      (setup) => `
        <button class="saved-chip" data-action="load-setup" data-setup-id="${setup.id}">${escapeHtml(setup.name)}</button>`
    )
    .join("");
}

function persistCurrentSetup(name) {
  const setups = getStoredSetups();
  const payload = {
    id: crypto.randomUUID(),
    name,
    savedAt: new Date().toISOString(),
    state: {
      vialRows: state.vialRows,
      stockRows: state.stockRows,
      cartRows: state.cartRows,
    },
  };
  setups.unshift(payload);
  setStoredSetups(setups.slice(0, 12));
  renderSavedSetups();
}

function loadSavedSetup(setupId) {
  const setups = getStoredSetups();
  const setup = setups.find((item) => item.id === setupId);
  if (!setup?.state) return;
  state.vialRows = cloneRows(setup.state.vialRows || []);
  state.stockRows = cloneRows(setup.state.stockRows || []);
  state.cartRows = cloneRows(setup.state.cartRows || []);
  renderStructure();
  renderResults();
}

function getInputs() {
  state.vialRows.forEach((row) => clampRow(row, "vial"));
  state.stockRows.forEach((row) => clampRow(row, "stock"));
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

function expandStock() {
  const list = [];
  for (const row of state.stockRows) {
    for (let i = 0; i < row.count; i += 1) {
      list.push({
        id: `${row.id}-${i}`,
        label: row.label || "Frozen partial",
        mg: row.mg,
        volumeMl: row.volumeMl,
        concentration: row.volumeMl > 0 ? row.mg / row.volumeMl : 0,
      });
    }
  }
  return list.sort((a, b) => b.concentration - a.concentration);
}

function renderStructure() {
  renderRows();
}

function renderResults() {
  const plan = computeCurrentPlan();
  const {
    doseVolumeMl,
    penVolumeMl,
    cartPlans,
    expandedStock,
    totalAvailableMg,
    totalRequiredMg,
    strongestRequiredConcentration,
    selected,
    selectedReconstitutions,
    poolConcentration,
    availableShortfall,
    hasStrongEnoughPool,
    leftoverMg,
    leftoverVolumeMl,
    leftoverDoseMg,
  } = plan;
  const maxVialMl = state.settings.maxVialMl;

  const alerts = [];
  if (totalRequiredMg <= 0) alerts.push("Add at least one cart with a positive dose.");
  if (totalAvailableMg <= 0) alerts.push("Add at least one vial with peptide in it.");
  if (availableShortfall > 0) {
    alerts.push(`Shortfall: you are ${fmt.mg(availableShortfall)} short on peptide for the requested carts.`);
  }
  if (penVolumeMl > 3) {
    alerts.push(`A pen would be ${fmt.ml(penVolumeMl)}, which exceeds the 3 mL cart limit.`);
  }
  if (strongestRequiredConcentration > 0 && !hasStrongEnoughPool) {
    alerts.push("The current liquid pool is too weak for the requested cart doses. Reduce water or add stronger stock.");
  }

  els.availableMg.textContent = fmt.mg(totalAvailableMg);
  els.requiredMg.textContent = fmt.mg(totalRequiredMg);
  els.vialsUsed.textContent = selected.length ? `${selected.length} vial${selected.length === 1 ? "" : "s"}` : "-";
  els.leftoverMg.textContent = fmt.mg(leftoverMg);
  els.alerts.textContent = alerts.join(" ");
  els.addLeftover.disabled = leftoverMg <= 0 || poolConcentration <= 0;
  els.leftoverPanel.style.display = leftoverMg > 0 ? "" : "none";
  els.leftoverSummary.textContent =
    leftoverMg > 0
      ? `This remainder can be frozen as partial stock.`
      : "No leftover stock yet.";
  els.leftoverVolume.textContent = `Volume: ${leftoverVolumeMl > 0 ? fmt.ml(leftoverVolumeMl) : "-"}`;
  els.leftoverDose.textContent = `Dose per 40 clicks: ${leftoverDoseMg > 0 ? fmt.mg(leftoverDoseMg) : "-"}`;

  const stockNotes = [];
  stockNotes.push(
    ...selectedReconstitutions.map((vial, index) => {
      const usedMg = Math.min(vial.usedMg, vial.mg);
      const fill = selectedReconstitutions[index];
      const fillText = fill.fillMl >= maxVialMl - 1e-9 ? `Fill to ${fmt.ml(maxVialMl)}` : `Fill to ${fmt.ml(fill.fillMl)}`;
      return `<li><strong>${escapeHtml(vial.label)}</strong> ${fmt.mg(usedMg)} used of ${fmt.mg(vial.mg)}. ${fillText}.</li>`;
    })
  );
  stockNotes.push(
    ...expandedStock.map((stock) => {
      return `<li><strong>${escapeHtml(stock.label)}</strong> ${fmt.mg(stock.mg)} in ${fmt.ml(stock.volumeMl)} at ${fmt.ratio(stock.concentration)}.</li>`;
    })
  );
  els.thawList.innerHTML = stockNotes.length ? stockNotes.join("") : "<li>No stock entered yet.</li>";

  els.planBody.innerHTML = cartPlans.length
    ? cartPlans
        .map((plan) => {
          const stockWithdrawMl = hasStrongEnoughPool ? plan.totalMg / poolConcentration : 0;
          const topUpMl = plan.totalVolumeMl - stockWithdrawMl;
          const warning = topUpMl < -1e-9 ? "Needs stronger stock" : "";
          return `
            <tr>
              <td>${escapeHtml(plan.label)} x ${plan.pens}</td>
              <td>${fmt.mg(plan.totalMg)} total</td>
              <td>${fmt.ml(plan.totalVolumeMl)}</td>
              <td>${warning ? "-" : fmt.ml(stockWithdrawMl)}${warning ? `<div class="cell-note">${warning}</div>` : ""}</td>
              <td>${warning ? "-" : fmt.ml(topUpMl)}</td>
            </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="empty">Add carts to see a plan.</td></tr>`;

  const notes = [];
  notes.push(`Keep each dose at ${fmt.clicks(state.settings.clicksPerDose)} and each pen at ${state.settings.dosesPerCart} doses.`);
  notes.push(`At ${state.settings.unitsPerMl} units per mL, each dose is ${fmt.ml(doseVolumeMl)} and each pen is ${fmt.ml(penVolumeMl)}.`);
  notes.push(`The planner uses dry vials first, then mixes in any frozen partial stock.`);
  notes.push(`Each selected dry vial is filled to the fullest safe volume that still supports the strongest cart concentration, which is ${fmt.ratio(strongestRequiredConcentration)}.`);
  if (poolConcentration > 0) {
    notes.push(`The combined liquid pool concentration is ${fmt.ratio(poolConcentration)}.`);
  }
  if (leftoverMg > 0) {
    notes.push(`The leftover remainder can be frozen as ${fmt.ml(leftoverVolumeMl)} at ${fmt.mg(leftoverDoseMg)} per 40-click dose.`);
  }
  els.notes.innerHTML = notes.map((note) => `<li>${note}</li>`).join("");
}

function addRow(kind) {
  const id = crypto.randomUUID();
  if (kind === "vial") {
    state.vialRows.push({ id, label: `Vial ${state.vialRows.length + 1}`, mg: 10, count: 1 });
  } else if (kind === "stock") {
    state.stockRows.push({ id, label: `Partial ${state.stockRows.length + 1}`, mg: 10, volumeMl: 0.8, count: 1 });
  } else {
    state.cartRows.push({ id, label: `Cart ${state.cartRows.length + 1}`, doseMg: 2.5, count: 1 });
  }
  renderStructure();
  renderResults();
}

function addLeftoverToStock() {
  const snapshot = computeCurrentPlan();
  if (snapshot.leftoverMg <= 0 || snapshot.poolConcentration <= 0 || snapshot.leftoverVolumeMl <= 0) return;

  state.stockRows.push({
    id: crypto.randomUUID(),
    label: `Leftover stock ${state.stockRows.length + 1}`,
    mg: Number(snapshot.leftoverMg.toFixed(2)),
    volumeMl: Number(snapshot.leftoverVolumeMl.toFixed(2)),
    count: 1,
  });
  renderStructure();
  renderResults();
}

function computeCurrentPlan() {
  getInputs();

  const {
    unitsPerMl,
    clicksPerDose,
    dosesPerCart,
    maxVialMl,
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

  const expandedVials = expandVials();
  const expandedStock = expandStock();
  const totalAvailableMg =
    expandedVials.reduce((sum, vial) => sum + vial.mg, 0) +
    expandedStock.reduce((sum, stock) => sum + stock.mg, 0);
  const totalRequiredMg = cartPlans.reduce((sum, plan) => sum + plan.totalMg, 0);
  const strongestRequiredConcentration = cartPlans.reduce(
    (max, plan) => Math.max(max, plan.requiredConcentration),
    0,
  );

  const stockMg = expandedStock.reduce((sum, stock) => sum + stock.mg, 0);
  const stockVolumeMl = expandedStock.reduce((sum, stock) => sum + stock.volumeMl, 0);
  let remainingNeed = Math.max(0, totalRequiredMg - stockMg);
  const selected = [];
  for (const vial of expandedVials) {
    if (remainingNeed <= 0) break;
    selected.push({
      ...vial,
      usedMg: Math.min(vial.mg, remainingNeed),
    });
    remainingNeed -= vial.mg;
  }

  const selectedDryMg = selected.reduce((sum, vial) => sum + vial.mg, 0);
  const leftoverMg = Math.max(0, selectedDryMg + stockMg - totalRequiredMg);
  const selectedReconstitutions = selected.map((vial) => {
    const fillMl =
      strongestRequiredConcentration > 0
        ? Math.min(maxVialMl, vial.mg / strongestRequiredConcentration)
        : maxVialMl;
    return {
      ...vial,
      fillMl,
    };
  });
  const dryVolumeMl = selectedReconstitutions.reduce((sum, vial) => sum + vial.fillMl, 0);
  const poolVolumeMl = dryVolumeMl + stockVolumeMl;
  const poolMg = selectedDryMg + stockMg;
  const poolConcentration = poolVolumeMl > 0 ? poolMg / poolVolumeMl : 0;
  const availableShortfall = Math.max(0, totalRequiredMg - totalAvailableMg);
  const hasStrongEnoughPool = poolConcentration >= strongestRequiredConcentration - 1e-9;
  const leftoverVolumeMl = leftoverMg > 0 && poolConcentration > 0 ? leftoverMg / poolConcentration : 0;
  const leftoverDoseMg = poolConcentration > 0 ? poolConcentration * doseVolumeMl : 0;

  return {
    doseVolumeMl,
    penVolumeMl,
    cartPlans,
    expandedStock,
    totalAvailableMg,
    totalRequiredMg,
    strongestRequiredConcentration,
    selected,
    selectedReconstitutions,
    poolConcentration,
    availableShortfall,
    hasStrongEnoughPool,
    leftoverMg,
    leftoverVolumeMl,
    leftoverDoseMg,
  };
}

function wireEvents() {
  els.addVial.addEventListener("click", () => addRow("vial"));
  els.addStock.addEventListener("click", () => addRow("stock"));
  els.addCart.addEventListener("click", () => addRow("cart"));
  els.addLeftover.addEventListener("click", addLeftoverToStock);
  els.saveSetup.addEventListener("click", () => {
    const defaultName = `Setup ${getStoredSetups().length + 1}`;
    const name = window.prompt("Name this setup", defaultName)?.trim();
    if (!name) return;
    persistCurrentSetup(name);
  });

  document.body.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const row = target.closest("tr");
    if (!row) return;
    const id = row.getAttribute("data-id");
    const kind = row.getAttribute("data-kind");
    if (!id || !kind) return;
    const item = kind === "vial" ? state.vialRows.find((entry) => entry.id === id) : state.cartRows.find((entry) => entry.id === id);
    const stockItem = kind === "stock" ? state.stockRows.find((entry) => entry.id === id) : null;
    if (stockItem) {
      const field = target.getAttribute("data-field");
      if (!field) return;
      stockItem[field] = target.type === "number" ? readNumber(target.value, 0) : target.value;
      renderResults();
      return;
    }
    if (!item) return;

    const field = target.getAttribute("data-field");
    if (!field) return;
    item[field] = target.type === "number" ? readNumber(target.value, 0) : target.value;
    renderResults();
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const action = target.getAttribute("data-action");
    if (action === "load-setup") {
      const setupId = target.getAttribute("data-setup-id");
      if (setupId) loadSavedSetup(setupId);
      return;
    }
    if (action !== "remove-row") return;
    const row = target.closest("tr");
    if (!row) return;
    const id = row.getAttribute("data-id");
    const kind = row.getAttribute("data-kind");
    if (!id || !kind) return;

    if (kind === "vial") {
      state.vialRows = state.vialRows.filter((entry) => entry.id !== id);
    } else if (kind === "stock") {
      state.stockRows = state.stockRows.filter((entry) => entry.id !== id);
    } else {
      state.cartRows = state.cartRows.filter((entry) => entry.id !== id);
    }
    renderStructure();
    renderResults();
  });
}

wireEvents();
renderSavedSetups();
renderStructure();
renderResults();
