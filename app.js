
"use strict";

/* =========================================================
   BONPLAN — Comparateur de courses
   Version 2 : calcul réel des promotions
   Les données restent dans le navigateur.
   ========================================================= */

const STORAGE = {
  cards: "bonplan-cartes",
  courses: "bonplan-courses",
  offers: "bonplan-offres-v2"
};

const $ = (selector) => document.querySelector(selector);

function readStorage(key, fallback = []) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error("Lecture du stockage impossible :", error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Enregistrement impossible :", error);
    showToast("Impossible d'enregistrer. Vérifie les paramètres du navigateur.");
    return false;
  }
}

let cards = readStorage(STORAGE.cards);
let courses = readStorage(STORAGE.courses);
let offers = readStorage(STORAGE.offers);

if (!Array.isArray(cards)) cards = [];
if (!Array.isArray(courses)) courses = [];
if (!Array.isArray(offers)) offers = [];

let lastSearch = "";
let toastTimer;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function money(value) {
  return Number(value).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR"
  });
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function saveCards() {
  if (!writeStorage(STORAGE.cards, cards)) return;
  renderCards();
  updateStats();
}

function saveCourses() {
  if (!writeStorage(STORAGE.courses, courses)) return;
  renderCourses();
  updateStats();
}

function saveOffers() {
  if (!writeStorage(STORAGE.offers, offers)) return;

  renderOffers();
  renderLatestOffers();
  updateStats();

  if (lastSearch) renderSearchResults(lastSearch);
}

function updateStats() {
  $("#stat-cartes").textContent = cards.length;
  $("#stat-offres").textContent = offers.length;
  $("#stat-courses").textContent =
    courses.filter((item) => !item.checked).length;
}

function navigate(pageName) {
  const target = document.getElementById("page-" + pageName);
  if (!target) return;

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page === target);
  });

  document.querySelectorAll("#main-nav [data-page]").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageName);
  });

  $("#main-nav")?.classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================
   NAVIGATION ET ACTIONS
   ========================================================= */

document.addEventListener("click", (event) => {
  const pageButton = event.target.closest("[data-page]");

  if (pageButton) {
    event.preventDefault();
    navigate(pageButton.dataset.page);
    return;
  }

  const deleteCardButton = event.target.closest("[data-delete-card]");

  if (deleteCardButton) {
    const id = deleteCardButton.dataset.deleteCard;
    const card = cards.find((item) => String(item.id) === String(id));

    if (card && confirm(`Supprimer la carte ${card.store} ?`)) {
      cards = cards.filter((item) => String(item.id) !== String(id));
      saveCards();
      showToast("Carte supprimée.");
    }
    return;
  }

  const deleteOfferButton = event.target.closest("[data-delete-offer]");

  if (deleteOfferButton) {
    const id = deleteOfferButton.dataset.deleteOffer;

    if (confirm("Supprimer cette offre enregistrée ?")) {
      offers = offers.filter((item) => String(item.id) !== String(id));
      saveOffers();
      showToast("Offre supprimée.");
    }
    return;
  }

  const addToListButton = event.target.closest("[data-add-course]");

  if (addToListButton) {
    addCourse(addToListButton.dataset.addCourse || lastSearch, 1, "Autre");
    navigate("courses");
    return;
  }

  const deleteCourseButton = event.target.closest("[data-delete-course]");

  if (deleteCourseButton) {
    const id = deleteCourseButton.dataset.deleteCourse;
    courses = courses.filter((item) => String(item.id) !== String(id));
    saveCourses();
    showToast("Article supprimé.");
  }
});

$("#mobile-menu")?.addEventListener("click", () => {
  $("#main-nav")?.classList.toggle("open");
});

/* =========================================================
   CARTES DE FIDÉLITÉ
   ========================================================= */

$("#form-carte")?.addEventListener("submit", (event) => {
  event.preventDefault();

  const store = $("#carte-enseigne").value.trim();
  const number = $("#carte-numero").value.trim();
  const color = $("#carte-couleur").value;

  if (!store) {
    showToast("Indique le nom de l'enseigne.");
    return;
  }

  cards.unshift({ id: Date.now(), store, number, color });

  if (!writeStorage(STORAGE.cards, cards)) {
    cards.shift();
    return;
  }

  $("#form-carte").reset();
  renderCards();
  updateStats();
  showToast("Carte ajoutée.");
});

function renderCards() {
  const container = $("#liste-cartes");
  const empty = $("#cartes-empty");

  if (!container || !empty) return;

  empty.hidden = cards.length > 0;

  container.innerHTML = cards.map((card) => `
    <div class="card">
      <div class="card-row">
        <div class="card-symbol"
          style="background:${escapeHTML(card.color || "#176b4d")}20;color:${escapeHTML(card.color || "#176b4d")}">
          🏷️
        </div>
        <div>
          <strong>${escapeHTML(card.store)}</strong>
          <div class="muted small-text">
            ${escapeHTML(card.number || "Aucun numéro renseigné")}
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="btn danger small" type="button"
          data-delete-card="${escapeHTML(card.id)}">Supprimer</button>
      </div>
    </div>
  `).join("");
}

/* =========================================================
   LISTE DE COURSES
   ========================================================= */

$("#form-course")?.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("#course-name").value.trim();
  const quantity = Math.max(1, Number($("#course-quantity").value) || 1);
  const category = $("#course-category").value;

  if (!name) return;

  addCourse(name, quantity, category);

  $("#form-course").reset();
  $("#course-quantity").value = "1";
});

function addCourse(name, quantity = 1, category = "Autre") {
  const cleanName = String(name || "").trim();

  if (!cleanName) {
    showToast("Indique un produit.");
    return;
  }

  const existing = courses.find((item) =>
    normalize(item.name) === normalize(cleanName) && !item.checked
  );

  if (existing) {
    existing.quantity = (Number(existing.quantity) || 1) + quantity;
  } else {
    courses.unshift({
      id: Date.now() + Math.random(),
      name: cleanName,
      quantity,
      category,
      checked: false
    });
  }

  if (!writeStorage(STORAGE.courses, courses)) return;

  renderCourses();
  updateStats();
  showToast("Article ajouté à la liste.");
}

document.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-check-course]");
  if (!checkbox) return;

  const item = courses.find((course) =>
    String(course.id) === String(checkbox.dataset.checkCourse)
  );

  if (item) {
    item.checked = checkbox.checked;
    saveCourses();
  }
});

$("#clear-checked")?.addEventListener("click", () => {
  const checkedCount = courses.filter((item) => item.checked).length;

  if (!checkedCount) {
    showToast("Aucun article coché à supprimer.");
    return;
  }

  courses = courses.filter((item) => !item.checked);
  saveCourses();
  showToast("Articles cochés supprimés.");
});

function renderCourses() {
  const container = $("#liste-courses");
  const empty = $("#courses-empty");

  if (!container || !empty) return;

  empty.hidden = courses.length > 0;

  container.innerHTML = courses.map((item) => `
    <div class="course-row">
      <input type="checkbox" aria-label="Article acheté"
        data-check-course="${escapeHTML(item.id)}"
        ${item.checked ? "checked" : ""}>
      <div class="course-name ${item.checked ? "checked" : ""}">
        <strong>${escapeHTML(item.name)}</strong>
        <div class="muted small-text">
          ${escapeHTML(item.category || "Autre")} · Quantité : ${escapeHTML(item.quantity || 1)}
        </div>
      </div>
      <button class="btn secondary small" type="button"
        data-add-course="${escapeHTML(item.name)}" title="Ajouter une quantité">+1</button>
      <button class="btn danger small" type="button"
        data-delete-course="${escapeHTML(item.id)}">✕</button>
    </div>
  `).join("");

  const total = courses.length;
  const checked = courses.filter((item) => item.checked).length;
  const progress = total ? Math.round((checked / total) * 100) : 0;

  $("#courses-progress").textContent =
    `${checked} / ${total} acheté${total > 1 ? "s" : ""}`;

  $("#courses-progress-bar").style.width = progress + "%";
}

/* =========================================================
   RECHERCHES EXTERNES
   ========================================================= */

function resetComparisonFields() {
  [
    "#compare-carrefour-price",
    "#compare-intermarche-price",
    "#compare-carrefour-quantity",
    "#compare-intermarche-quantity",
    "#compare-carrefour-packs",
    "#compare-intermarche-packs",
    "#compare-carrefour-promo-value",
    "#compare-intermarche-promo-value"
  ].forEach((selector) => {
    const input = $(selector);
    if (input) input.value = "";
  });

  [
    "#compare-carrefour-promo",
    "#compare-intermarche-promo"
  ].forEach((selector) => {
    const select = $(selector);
    if (select) select.value = "none";
  });

  [
    "#compare-carrefour-quantity",
    "#compare-intermarche-quantity",
    "#compare-carrefour-packs",
    "#compare-intermarche-packs"
  ].forEach((selector) => {
    const input = $(selector);
    if (input) input.value = "1";
  });

  const result = $("#compare-prices-result");

  if (result) {
    result.hidden = true;
    result.innerHTML = "";
  }
}

function createExternalSearches(query, zone) {
  const container = $("#recherches-externes");
  if (!container) return;

  ensureComparePanel();

  if (container.dataset.query !== query) {
    resetComparisonFields();
  }

  container.dataset.query = query;

  const stores = [
    {
      name: "Carrefour",
      color: "#1767b2",
      url: `https://www.carrefour.fr/s?q=${encodeURIComponent(query)}`,
      description: "Rechercher le produit sur Carrefour"
    },
    {
      name: "Intermarché",
      color: "#c73535",
      url: `https://www.google.com/search?q=${encodeURIComponent("site:intermarche.com " + query)}`,
      description: "Trouver les résultats Intermarché"
    },
    {
      name: "Action",
      color: "#b78b12",
      url: `https://www.google.com/search?q=${encodeURIComponent("site:action.com/fr-fr " + query)}`,
      description: "Rechercher chez Action"
    },
    {
      name: "E.Leclerc",
      color: "#176b4d",
      url: `https://www.google.com/search?q=${encodeURIComponent("site:e.leclerc " + query)}`,
      description: "Rechercher chez E.Leclerc"
    },
    {
      name: "Lidl",
      color: "#1767b2",
      url: `https://www.google.com/search?q=${encodeURIComponent("site:lidl.fr " + query)}`,
      description: "Rechercher chez Lidl"
    },
    {
      name: "Recherche en ligne",
      color: "#176b4d",
      url: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`,
      description: "Comparer d'autres marchands"
    }
  ];

  let selected = stores;

  if (zone === "local") {
    selected = stores.filter((item) =>
      ["Carrefour", "Intermarché", "Action", "E.Leclerc", "Lidl"].includes(item.name)
    );
  } else if (zone === "online") {
    selected = stores.filter((item) =>
      ["Carrefour", "Intermarché", "Recherche en ligne"].includes(item.name)
    );
  }

  const mapsURL =
    `https://www.google.com/maps/search/${encodeURIComponent(query + " magasin")}/@46.06,4.07,11z`;

  container.innerHTML = selected.map((store) => `
    <a class="official-link"
       href="${escapeHTML(store.url)}"
       target="_blank" rel="noopener noreferrer">
      <strong style="color:${escapeHTML(store.color)}">
        ${escapeHTML(store.name)} ↗
      </strong>
      <span class="muted small-text">${escapeHTML(store.description)}</span>
    </a>
  `).join("");

  if (zone !== "online") {
    container.insertAdjacentHTML("beforeend", `
      <a class="official-link" href="${escapeHTML(mapsURL)}"
         target="_blank" rel="noopener noreferrer">
        <strong>📍 Magasins à proximité</strong>
        <span class="muted small-text">
          Voir les magasins autour de Mably / Roanne
        </span>
      </a>
    `);
  }
}

/* =========================================================
   COMPARATEUR ET PROMOTIONS
   ========================================================= */

function ensureComparePanel() {
  const searches = $("#recherches-externes");

  if (!searches || $("#compare-prices-panel")) return;

  searches.insertAdjacentHTML("beforebegin", `
    <section class="panel" id="compare-prices-panel">
      <h3>⚖️ Comparer Carrefour et Intermarché</h3>
      <p class="muted small-text">
        Saisis le prix affiché, le contenu de chaque paquet et le nombre
        de paquets achetés. Choisis ensuite la promotion appliquée.
        Le calcul tient compte de la réduction.
      </p>

      <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">

        <div class="card" style="border-top:4px solid #1767b2">
          <h3 style="color:#1767b2">🔵 Carrefour</h3>

          <div class="field">
            <label for="compare-carrefour-price">Prix normal d'un paquet (€)</label>
            <input id="compare-carrefour-price" type="number"
              min="0.01" step="0.01" placeholder="Ex. : 3.49">
          </div>

          <div class="field" style="margin-top:10px">
            <label for="compare-carrefour-quantity">Contenu d'un paquet</label>
            <input id="compare-carrefour-quantity" type="number"
              min="0.01" step="0.01" value="1">
          </div>

          <div class="field" style="margin-top:10px">
            <label for="compare-carrefour-packs">Nombre de paquets achetés</label>
            <input id="compare-carrefour-packs" type="number"
              min="1" step="1" value="1">
          </div>

          <div class="field" style="margin-top:10px">
            <label for="compare-carrefour-promo">Promotion</label>
            <select id="compare-carrefour-promo">
              <option value="none">Aucune promotion</option>
              <option value="second50">2e à -50 %</option>
              <option value="percent">Remise en pourcentage</option>
              <option value="fixed">Réduction en euros sur le total</option>
              <option value="bundle2">2 paquets pour un prix spécial</option>
            </select>
          </div>

          <div class="field" style="margin-top:10px">
            <label for="compare-carrefour-promo-value">
              Valeur de la promotion
            </label>
            <input id="compare-carrefour-promo-value" type="number"
              min="0" step="0.01" placeholder="Ex. : 30 pour -30 %, ou 5 pour 2 à 5 €">
            <span class="muted small-text">
              Utilisée selon la promotion choisie. Pour « 2e à -50 % », laisse vide.
            </span>
          </div>
        </div>

        <div class="card" style="border-top:4px solid #c73535">
          <h3 style="color:#c73535">🔴 Intermarché</h3>

          <div class="field">
            <label for="compare-intermarche-price">Prix normal d'un paquet (€)</label>
            <input id="compare-intermarche-price" type="number"
              min="0.01" step="0.01" placeholder="Ex. : 2.99">
          </div>

          <div class="field" style="margin-top:10px">
            <label for="compare-intermarche-quantity">Contenu d'un paquet</label>
            <input id="compare-intermarche-quantity" type="number"
              min="0.01" step="0.01" value="1">
          </div>

          <div class="field" style="margin-top:10px">
            <label for="compare-intermarche-packs">Nombre de paquets achetés</label>
            <input id="compare-intermarche-packs" type="number"
              min="1" step="1" value="1">
          </div>

          <div class="field" style="margin-top:10px">
            <label for="compare-intermarche-promo">Promotion</label>
            <select id="compare-intermarche-promo">
              <option value="none">Aucune promotion</option>
              <option value="second50">2e à -50 %</option>
              <option value="percent">Remise en pourcentage</option>
              <option value="fixed">Réduction en euros sur le total</option>
              <option value="bundle2">2 paquets pour un prix spécial</option>
            </select>
          </div>

          <div class="field" style="margin-top:10px">
            <label for="compare-intermarche-promo-value">
              Valeur de la promotion
            </label>
            <input id="compare-intermarche-promo-value" type="number"
              min="0" step="0.01" placeholder="Ex. : 30 pour -30 %, ou 5 pour 2 à 5 €">
            <span class="muted small-text">
              Utilisée selon la promotion choisie. Pour « 2e à -50 % », laisse vide.
            </span>
          </div>
        </div>
      </div>

      <div class="field" style="margin-top:14px">
        <label for="compare-unit">Unité de comparaison commune</label>
        <select id="compare-unit">
          <option value="unité">unité</option>
          <option value="rouleau">rouleau</option>
          <option value="kg">kg</option>
          <option value="g">g</option>
          <option value="L">L</option>
          <option value="mL">mL</option>
          <option value="lavage">lavage</option>
        </select>
      </div>

      <div class="actions">
        <button class="btn" type="button" id="compare-prices-button">
          ⚖️ Comparer les prix
        </button>
        <button class="btn secondary" type="button" id="save-comparison-button">
          💾 Enregistrer les deux offres
        </button>
      </div>

      <div id="compare-prices-result" class="notice success-notice"
        aria-live="polite" hidden></div>
    </section>
  `);

  $("#compare-prices-button").addEventListener("click", () => {
    comparePrices(false);
  });

  $("#save-comparison-button").addEventListener("click", () => {
    comparePrices(true);
  });
}

/*
  Calcule le prix total payé en tenant compte de la promotion.

  second50 :
  2e paquet à -50 %, sur les paires de paquets.

  percent :
  pourcentage de remise appliqué à chaque paquet.

  fixed :
  montant retiré du total de l'achat.

  bundle2 :
  prix spécial pour chaque lot de 2 paquets.
*/

function promotionDescription(type, value) {
  switch (type) {
    case "second50":
      return "2e paquet à -50 %";
    case "percent":
      return `Remise de ${value} %`;
    case "fixed":
      return `Réduction de ${money(value)} sur le total`;
    case "bundle2":
      return `2 paquets pour ${money(value)}`;
    default:
      return "Sans promotion";
  }
}

function calculatePromotion(price, packs, type, value) {
  const normalTotal = price * packs;
  let total = normalTotal;
  let description = "Sans promotion";

  if (type === "second50") {
    const discountedPacks = Math.floor(packs / 2);
    total = price * (packs - discountedPacks * 0.5);
    description = promotionDescription(type);
  } else if (type === "percent") {
    total = normalTotal * (1 - value / 100);
    description = promotionDescription(type, value);
  } else if (type === "fixed") {
    total = Math.max(0, normalTotal - value);
    description = promotionDescription(type, value);
  } else if (type === "bundle2") {
    const pairs = Math.floor(packs / 2);
    const remaining = packs % 2;
    total = pairs * value + remaining * price;
    description = promotionDescription(type, value);
  }

  return {
    normalTotal,
    total: Math.round(total * 100) / 100,
    savings: Math.round((normalTotal - total) * 100) / 100,
    description
  };
}

function getComparisonStore(prefix) {
  const price = Number($(`#compare-${prefix}-price`).value);
  const quantity = Number($(`#compare-${prefix}-quantity`).value);
  const packs = Number($(`#compare-${prefix}-packs`).value);
  const promo = $(`#compare-${prefix}-promo`).value;
  const rawValue = $(`#compare-${prefix}-promo-value`).value;
  const value = rawValue === "" ? 0 : Number(rawValue);

  if (
    !Number.isFinite(price) || price <= 0 ||
    !Number.isFinite(quantity) || quantity <= 0 ||
    !Number.isInteger(packs) || packs < 1
  ) {
    return { error: "Vérifie le prix, le contenu du paquet et le nombre de paquets." };
  }

  if (promo === "percent" && (value < 0 || value > 100)) {
    return { error: "Le pourcentage de réduction doit être compris entre 0 et 100." };
  }

  if ((promo === "fixed" || promo === "bundle2") && (!rawValue || value < 0)) {
    return { error: "Renseigne la valeur de la promotion choisie." };
  }

  if (promo === "bundle2" && value <= 0) {
    return { error: "Le prix du lot de deux paquets doit être supérieur à zéro." };
  }

  const calculation = calculatePromotion(price, packs, promo, value);

  return {
    price,
    quantity,
    packs,
    promo,
    value,
    normalTotal: calculation.normalTotal,
    total: calculation.total,
    savings: calculation.savings,
    description: calculation.description,
    totalQuantity: quantity * packs,
    unitPrice: calculation.total / (quantity * packs)
  };
}

function comparePrices(save = false) {
  if (!lastSearch) {
    showToast("Recherche d'abord un produit.");
    return;
  }

  const carrefour = getComparisonStore("carrefour");
  const intermarche = getComparisonStore("intermarche");
  const unit = $("#compare-unit").value;
  const result = $("#compare-prices-result");

  if (carrefour.error || intermarche.error) {
    showToast(carrefour.error || intermarche.error);
    return;
  }

  const difference = Math.abs(carrefour.unitPrice - intermarche.unitPrice);
  const differenceTotal = Math.abs(carrefour.total - intermarche.total);

  let winner;

  if (Math.abs(carrefour.unitPrice - intermarche.unitPrice) < 0.000001) {
    winner = "Les deux enseignes ont le même prix par unité.";
  } else if (carrefour.unitPrice < intermarche.unitPrice) {
    winner = "🔵 Carrefour est le moins cher après promotion.";
  } else {
    winner = "🔴 Intermarché est le moins cher après promotion.";
  }

  const carrefourSavings = carrefour.savings > 0
    ? `<p>Économie Carrefour : <strong>${money(carrefour.savings)}</strong></p>`
    : "";

  const intermarcheSavings = intermarche.savings > 0
    ? `<p>Économie Intermarché : <strong>${money(intermarche.savings)}</strong></p>`
    : "";

  result.hidden = false;

  result.innerHTML = `
    <h3>${escapeHTML(winner)}</h3>

    <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
      <div class="card">
        <h3 style="color:#1767b2">🔵 Carrefour</h3>
        <p>Prix normal : <strong>${money(carrefour.normalTotal)}</strong></p>
        <p>Promotion : <strong>${escapeHTML(carrefour.description)}</strong></p>
        <p>Prix payé : <strong class="price">${money(carrefour.total)}</strong></p>
        ${carrefourSavings}
        <p>Quantité totale : ${carrefour.totalQuantity} ${escapeHTML(unit)}</p>
        <p>Prix par ${escapeHTML(unit)} : <strong>${money(carrefour.unitPrice)}</strong></p>
      </div>

      <div class="card">
        <h3 style="color:#c73535">🔴 Intermarché</h3>
        <p>Prix normal : <strong>${money(intermarche.normalTotal)}</strong></p>
        <p>Promotion : <strong>${escapeHTML(intermarche.description)}</strong></p>
        <p>Prix payé : <strong class="price">${money(intermarche.total)}</strong></p>
        ${intermarcheSavings}
        <p>Quantité totale : ${intermarche.totalQuantity} ${escapeHTML(unit)}</p>
        <p>Prix par ${escapeHTML(unit)} : <strong>${money(intermarche.unitPrice)}</strong></p>
      </div>
    </div>

    <p>
      Différence sur le prix total : <strong>${money(differenceTotal)}</strong>.
      Différence par ${escapeHTML(unit)} :
      <strong>${money(difference)}</strong>.
    </p>

    <p class="small-text">
      Résultat calculé à partir des prix et promotions que tu as saisis.
      Vérifie les conditions de l'offre, la carte de fidélité et le magasin.
      Les promotions réelles ne sont pas encore récupérées automatiquement.
    </p>
  `;

  if (!save) return;

  const now = Date.now();

  const newOffers = [
    {
      id: now + Math.random(),
      product: lastSearch,
      store: "Carrefour",
      price: carrefour.total,
      quantity: carrefour.totalQuantity,
      unit,
      endDate: "",
      url: "",
      notes:
        `Comparateur BonPlan — ${carrefour.description}. ` +
        `Prix normal : ${money(carrefour.normalTotal)} pour ${carrefour.packs} paquet(s).`,
      createdAt: now
    },
    {
      id: now + Math.random() + 1,
      product: lastSearch,
      store: "Intermarché",
      price: intermarche.total,
      quantity: intermarche.totalQuantity,
      unit,
      endDate: "",
      url: "",
      notes:
        `Comparateur BonPlan — ${intermarche.description}. ` +
        `Prix normal : ${money(intermarche.normalTotal)} pour ${intermarche.packs} paquet(s).`,
      createdAt: now + 1
    }
  ];

  const previousOffers = offers;
  offers = [...newOffers, ...offers];

  if (!writeStorage(STORAGE.offers, offers)) {
    offers = previousOffers;
    return;
  }

  renderOffers();
  renderLatestOffers();
  updateStats();
  renderSearchResults(lastSearch);

  showToast("Les deux offres calculées ont été enregistrées.");
}

/* =========================================================
   FORMULAIRES DE RECHERCHE
   ========================================================= */

function performSearch(query, zone = "both") {
  query = String(query || "").trim();
  if (!query) return;

  lastSearch = query;

  $("#recherche-produit").value = query;
  $("#recherche-zone").value = zone;
  $("#zone-resultats").hidden = false;
  $("#titre-resultats").textContent = `Résultats pour « ${query} »`;

  createExternalSearches(query, zone);
  renderSearchResults(query);
  navigate("promotions");
}

$("#form-recherche")?.addEventListener("submit", (event) => {
  event.preventDefault();

  performSearch(
    $("#recherche-produit").value,
    $("#recherche-zone").value
  );
});

$("#form-recherche-accueil")?.addEventListener("submit", (event) => {
  event.preventDefault();
  performSearch($("#recherche-accueil").value, "both");
});

$("#recherche-zone")?.addEventListener("change", () => {
  if (lastSearch) {
    createExternalSearches(lastSearch, $("#recherche-zone").value);
  }
});

$("#recherche-tri")?.addEventListener("change", () => {
  if (lastSearch) renderSearchResults(lastSearch);
});

$("#effacer-recherche")?.addEventListener("click", () => {
  $("#recherche-produit").value = "";
  lastSearch = "";
  $("#zone-resultats").hidden = true;
  $("#resultats-comparateur").innerHTML = "";
});

/* =========================================================
   OFFRES ENREGISTRÉES
   ========================================================= */

function pricePerUnit(offer) {
  const price = Number(offer.price);
  const quantity = Number(offer.quantity);

  if (!Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return price / quantity;
}

function isExpired(offer) {
  if (!offer.endDate) return false;

  const end = new Date(offer.endDate + "T23:59:59");
  return Number.isFinite(end.getTime()) && end < new Date();
}

function formatDate(value) {
  const date = new Date(value + "T12:00:00");

  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("fr-FR")
    : value;
}

function validHttpURL(value) {
  if (!value) return "";

  try {
    const url = new URL(value);

    return ["http:", "https:"].includes(url.protocol)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function offerHTML(offer, isBest = false) {
  const unitPrice = pricePerUnit(offer);
  const expired = isExpired(offer);
  const safeLink = validHttpURL(offer.url);

  return `
    <article class="offer">
      <div class="offer-top">
        <div>
          <h3>${escapeHTML(offer.product)}</h3>
          <span class="pill">${escapeHTML(offer.store)}</span>
          ${isBest && !expired ? '<span class="pill">Meilleur prix unitaire enregistré</span>' : ""}
          ${expired ? '<span class="pill orange">Date de fin dépassée</span>' : ""}
        </div>
        <div class="price">${money(offer.price)}</div>
      </div>

      <div class="offer-meta">
        Quantité : ${escapeHTML(offer.quantity)} ${escapeHTML(offer.unit || "unité")}(s)<br>
        Prix par ${escapeHTML(offer.unit || "unité")} :
        ${unitPrice === null ? "Non calculable" : money(unitPrice)}<br>
        ${offer.endDate ? "Fin de l'offre : " + escapeHTML(formatDate(offer.endDate)) + "<br>" : ""}
        ${offer.notes ? "Notes : " + escapeHTML(offer.notes) : ""}
      </div>

      <div class="offer-actions">
        ${safeLink ? `<a class="btn small" href="${escapeHTML(safeLink)}" target="_blank" rel="noopener noreferrer">Voir l'offre ↗</a>` : ""}
        <button class="btn secondary small" type="button"
          data-add-course="${escapeHTML(offer.product)}">Ajouter aux courses</button>
        <button class="btn danger small" type="button"
          data-delete-offer="${escapeHTML(offer.id)}">Supprimer</button>
      </div>
    </article>
  `;
}

function renderSearchResults(query) {
  const container = $("#resultats-comparateur");
  if (!container) return;

  const words = normalize(query).split(/\s+/).filter(Boolean);

  let matching = offers.filter((offer) => {
    const text = normalize(
      `${offer.product} ${offer.store} ${offer.notes || ""}`
    );

    return words.every((word) => text.includes(word));
  });

  const sort = $("#recherche-tri")?.value || "unit";

  if (sort === "unit") {
    matching.sort((a, b) =>
      (pricePerUnit(a) ?? Infinity) - (pricePerUnit(b) ?? Infinity)
    );
  } else if (sort === "total") {
    matching.sort((a, b) => Number(a.price) - Number(b.price));
  } else {
    matching.sort((a, b) =>
      Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );
  }

  if (!matching.length) {
    container.innerHTML = `
      <div class="empty">
        <strong>Aucune offre enregistrée ne correspond à cette recherche.</strong>
        <p>Compare les prix ci-dessus puis enregistre-les pour les retrouver ici.</p>
        <button class="btn" type="button" data-page="offres">Ajouter une offre</button>
        <button class="btn secondary" type="button"
          data-add-course="${escapeHTML(query)}">Ajouter à ma liste de courses</button>
      </div>
    `;
    return;
  }

  container.innerHTML = matching
    .map((offer, index) =>
      offerHTML(offer, index === 0 && sort !== "recent")
    )
    .join("");
}

$("#form-offre")?.addEventListener("submit", (event) => {
  event.preventDefault();

  const product = $("#offre-produit").value.trim();
  const store = $("#offre-magasin").value;
  const price = Number($("#offre-prix").value);
  const quantity = Number($("#offre-quantite").value);
  const unit = $("#offre-unite").value;
  const endDate = $("#offre-fin").value;
  const rawURL = $("#offre-lien").value.trim();
  const notes = $("#offre-notes").value.trim();

  if (
    !product ||
    !store ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    showToast("Vérifie le produit, le prix et la quantité.");
    return;
  }

  let url = "";

  if (rawURL) {
    url = validHttpURL(rawURL);

    if (!url) {
      showToast("Le lien doit commencer par http:// ou https://");
      return;
    }
  }

  const offer = {
    id: Date.now() + Math.random(),
    product,
    store,
    price,
    quantity,
    unit,
    endDate,
    url,
    notes,
    createdAt: Date.now()
  };

  offers.unshift(offer);

  if (!writeStorage(STORAGE.offers, offers)) {
    offers.shift();
    return;
  }

  $("#form-offre").reset();
  $("#offre-quantite").value = "1";

  renderOffers();
  renderLatestOffers();
  updateStats();

  if (lastSearch) renderSearchResults(lastSearch);

  showToast("Offre enregistrée.");
});

$("#filtre-offres")?.addEventListener("input", renderOffers);
$("#filtre-magasin")?.addEventListener("change", renderOffers);

$("#supprimer-toutes-offres")?.addEventListener("click", () => {
  if (!offers.length) {
    showToast("Tu n'as aucune offre enregistrée.");
    return;
  }

  if (confirm("Supprimer toutes les offres enregistrées ? Cette action est définitive.")) {
    const previousOffers = offers;
    offers = [];

    if (!writeStorage(STORAGE.offers, offers)) {
      offers = previousOffers;
      return;
    }

    renderOffers();
    renderLatestOffers();
    updateStats();

    if (lastSearch) renderSearchResults(lastSearch);

    showToast("Toutes les offres ont été supprimées.");
  }
});

function renderOffers() {
  const container = $("#mes-offres");
  if (!container) return;

  const filterText = normalize($("#filtre-offres")?.value || "");
  const filterStore = $("#filtre-magasin")?.value || "";

  const filtered = offers.filter((offer) => {
    const matchesText = normalize(
      `${offer.product} ${offer.store} ${offer.notes || ""}`
    ).includes(filterText);

    return matchesText && (!filterStore || offer.store === filterStore);
  });

  filtered.sort((a, b) =>
    (pricePerUnit(a) ?? Infinity) - (pricePerUnit(b) ?? Infinity)
  );

  container.innerHTML = filtered.length
    ? filtered.map((offer) => offerHTML(offer)).join("")
    : `<div class="empty">Aucune offre correspondante. Ajoute une offre ci-dessus pour commencer à comparer.</div>`;
}

function renderLatestOffers() {
  const container = $("#liste-promotions");
  if (!container) return;

  const latest = [...offers]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 4);

  container.innerHTML = latest.length
    ? latest.map((offer) => offerHTML(offer)).join("")
    : `
      <div class="empty">
        Tu n'as pas encore enregistré d'offre.
        <div class="actions" style="justify-content:center">
          <button class="btn" type="button" data-page="offres">Ajouter ma première offre</button>
        </div>
      </div>
    `;
}

/* =========================================================
   INITIALISATION
   ========================================================= */

$("#current-year").textContent = new Date().getFullYear();

renderCards();
renderCourses();
renderOffers();
renderLatestOffers();
updateStats();

console.log("BonPlan chargé : comparateur et calcul des promotions activés.");
