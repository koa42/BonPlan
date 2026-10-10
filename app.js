
"use strict";

/* =========================================================
   BONPLAN — APPLICATION COMPLÈTE
   Cartes, courses, offres, recherche et comparateur
   ========================================================= */

const STORAGE = {
  cartes: "bonplan-cartes",
  courses: "bonplan-courses",
  offres: "bonplan-offres-v2"
};

let lastSearch = "";

/* ===================== OUTILS ===================== */

function readStorage(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function saveCards(value) {
  writeStorage(STORAGE.cartes, value);
}

function saveCourses(value) {
  writeStorage(STORAGE.courses, value);
}

function saveOffers(value) {
  writeStorage(STORAGE.offres, value);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function money(value) {
  return Number(value || 0).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR"
  });
}

function showToast(message) {
  let toast = document.getElementById("bonplan-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "bonplan-toast";
    toast.style.cssText = `
      position:fixed;
      bottom:20px;
      left:50%;
      transform:translateX(-50%);
      z-index:99999;
      background:#202020;
      color:white;
      padding:12px 18px;
      border-radius:12px;
      box-shadow:0 4px 16px #0003;
      max-width:90%;
      text-align:center;
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.display = "block";

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

function firstElement(...ids) {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element) return element;
  }
  return null;
}

function inputValue(...ids) {
  return firstElement(...ids)?.value?.trim() || "";
}

function numericValue(...ids) {
  const value = inputValue(...ids);
  if (!value) return NaN;
  return Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));
}

function makeId() {
  return Date.now() + Math.random();
}

function updateStats() {
  const courses = readStorage(STORAGE.courses);
  const offers = readStorage(STORAGE.offres);
  const cards = readStorage(STORAGE.cartes);

  const stats = {
    courses: courses.filter(item => !item.checked).length,
    offres: offers.length,
    cartes: cards.length
  };

  const mappings = [
    [["stat-courses", "nombre-courses"], stats.courses],
    [["stat-offres", "nombre-offres"], stats.offres],
    [["stat-cartes", "nombre-cartes"], stats.cartes]
  ];

  mappings.forEach(([ids, value]) => {
    const element = firstElement(...ids);
    if (element) element.textContent = value;
  });
}

/* ===================== NAVIGATION ===================== */

function navigate(page) {
  document.querySelectorAll("[data-page-content], .page").forEach(element => {
    const isTarget =
      element.dataset.pageContent === page ||
      element.id === page ||
      element.id === `page-${page}`;

    element.hidden = !isTarget;
    if (element.classList.contains("page")) {
      element.style.display = isTarget ? "" : "none";
    }
  });

  document.querySelectorAll("[data-page], .nav-link").forEach(element => {
    const target = element.dataset.page || element.getAttribute("href")?.replace("#", "");
    element.classList.toggle("active", target === page);
  });

  const menu = firstElement("menu-mobile", "navigation-mobile", "nav-links");
  if (menu) menu.classList.remove("open");
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-page], a[href^='#']");
  if (nav) {
    const page = nav.dataset.page || nav.getAttribute("href")?.slice(1);
    if (page) {
      const target = document.getElementById(`page-${page}`) ||
        document.querySelector(`[data-page-content="${page}"]`);

      if (target || document.getElementById(page)) {
        event.preventDefault();
        navigate(page);
      }
    }
  }

  const action = event.target.closest("[data-action]");
  if (action) {
    const id = action.dataset.id;
    const type = action.dataset.action;

    if (type === "delete-course") deleteCourse(id);
    if (type === "toggle-course") toggleCourse(id);
    if (type === "delete-card") deleteCard(id);
    if (type === "delete-offer") deleteOffer(id);
    if (type === "add-course") {
      addCourse(action.dataset.product || "", 1, "Autre");
    }
  }
});

/* ===================== CARTES DE FIDÉLITÉ ===================== */

function renderCards() {
  const container = firstElement(
    "mes-cartes", "liste-cartes", "cartes-container", "cartes-list"
  );
  if (!container) return;

  const cards = readStorage(STORAGE.cartes);

  if (!cards.length) {
    container.innerHTML = '<p class="empty-state">Aucune carte enregistrée.</p>';
    updateStats();
    return;
  }

  container.innerHTML = cards.map(card => `
    <article class="carte-item">
      <strong>${escapeHTML(card.store || card.magasin || "Magasin")}</strong>
      <p>Numéro : ${escapeHTML(card.number || card.numero || "Non renseigné")}</p>
      <button type="button" data-action="delete-card"
        data-id="${escapeHTML(card.id)}">Supprimer</button>
    </article>
  `).join("");

  updateStats();
}

function deleteCard(id) {
  saveCards(readStorage(STORAGE.cartes).filter(card => String(card.id) !== String(id)));
  renderCards();
  showToast("Carte supprimée.");
}

function initCards() {
  const form = firstElement("form-carte", "form-cartes");
  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();

    const store = inputValue("carte-magasin", "carte-enseigne", "carte-store");
    const number = inputValue("carte-numero", "carte-number");

    if (!store) {
      showToast("Choisis une enseigne.");
      return;
    }

    const cards = readStorage(STORAGE.cartes);
    cards.push({
      id: makeId(),
      store,
      number,
      color: inputValue("carte-couleur") || "#333333"
    });

    saveCards(cards);
    form.reset();
    renderCards();
    showToast("Carte ajoutée.");
  });
}

/* ===================== LISTE DE COURSES ===================== */

function addCourse(name, quantity = 1, category = "Autre") {
  name = String(name || "").trim();
  quantity = Math.max(1, Number(quantity) || 1);

  if (!name) {
    showToast("Le nom du produit est manquant.");
    return false;
  }

  const courses = readStorage(STORAGE.courses);
  const existing = courses.find(item =>
    normalize(item.name) === normalize(name) && !item.checked
  );

  if (existing) {
    existing.quantity = (Number(existing.quantity) || 1) + quantity;
    if (category && category !== "Autre") existing.category = category;
  } else {
    courses.push({
      id: makeId(),
      name,
      quantity,
      category: category || "Autre",
      checked: false
    });
  }

  saveCourses(courses);
  renderCourses();
  updateStats();
  return true;
}

function renderCourses() {
  const container = firstElement(
    "liste-courses", "mes-courses", "courses-container",
    "courses-list", "liste-des-courses"
  );

  if (!container) {
    updateStats();
    return;
  }

  const courses = readStorage(STORAGE.courses);

  if (!courses.length) {
    container.innerHTML = '<p class="empty-state">Ta liste de courses est vide.</p>';
    updateStats();
    return;
  }

  container.innerHTML = courses.map(course => `
    <article class="course-item ${course.checked ? "checked" : ""}">
      <label>
        <input type="checkbox" data-action="toggle-course"
          data-id="${escapeHTML(course.id)}"
          ${course.checked ? "checked" : ""}>
        <span>${escapeHTML(course.name)}</span>
      </label>
      <span class="course-quantity">× ${Number(course.quantity) || 1}</span>
      <span class="course-category">${escapeHTML(course.category || "Autre")}</span>
      <button type="button" data-action="delete-course"
        data-id="${escapeHTML(course.id)}" aria-label="Supprimer">✕</button>
    </article>
  `).join("");

  updateStats();
}

function toggleCourse(id) {
  const courses = readStorage(STORAGE.courses);
  const course = courses.find(item => String(item.id) === String(id));

  if (!course) return;

  course.checked = !course.checked;
  saveCourses(courses);
  renderCourses();
}

function deleteCourse(id) {
  saveCourses(readStorage(STORAGE.courses)
    .filter(course => String(course.id) !== String(id)));
  renderCourses();
  showToast("Produit supprimé de la liste.");
}

function initCourses() {
  const form = firstElement("form-course", "form-courses");
  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();

    const name = inputValue("course-nom", "course-produit", "course-name");
    const quantity = numericValue("course-quantite", "course-quantity") || 1;
    const category = inputValue("course-categorie", "course-category") || "Autre";

    if (addCourse(name, quantity, category)) {
      form.reset();
      showToast("Produit ajouté à la liste.");
    }
  });

  const clearButton = firstElement(
    "vider-courses", "effacer-courses", "supprimer-courses"
  );

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      if (!confirm("Vider toute la liste de courses ?")) return;
      saveCourses([]);
      renderCourses();
      showToast("Liste vidée.");
    });
  }
}

/* ===================== OFFRES ENREGISTRÉES ===================== */

function pricePerUnit(offer) {
  const price = Number(offer.price) || 0;
  const quantity = Number(offer.quantity) || 1;
  return price / quantity;
}

function isExpired(offer) {
  if (!offer.endDate) return false;
  return new Date(offer.endDate + "T23:59:59") < new Date();
}

function formatDate(date) {
  if (!date) return "Non précisée";
  const parsed = new Date(date + "T12:00:00");
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("fr-FR");
}

function validHttpURL(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function offerHTML(offer) {
  const url = validHttpURL(offer.url)
    ? `<a href="${escapeHTML(offer.url)}" target="_blank" rel="noopener noreferrer">Voir l'offre</a>`
    : "";

  return `
    <article class="offer-card ${isExpired(offer) ? "expired" : ""}">
      <h3>${escapeHTML(offer.product)}</h3>
      <p><strong>${escapeHTML(offer.store)}</strong></p>
      <p class="offer-price">${money(offer.price)}</p>
      <p>Quantité : ${escapeHTML(offer.quantity)} ${escapeHTML(offer.unit || "unité")}</p>
      <p>Prix unitaire : ${money(pricePerUnit(offer))} / ${escapeHTML(offer.unit || "unité")}</p>
      <p>Valable jusqu'au : ${formatDate(offer.endDate)}</p>
      ${offer.notes ? `<p>${escapeHTML(offer.notes)}</p>` : ""}
      ${url}
      <button type="button" data-action="add-course"
        data-product="${escapeHTML(offer.product)}">Ajouter aux courses</button>
      <button type="button" data-action="delete-offer"
        data-id="${escapeHTML(offer.id)}">Supprimer</button>
    </article>
  `;
}

function renderOffers() {
  const container = firstElement("mes-offres", "liste-offres", "offres-container");
  if (!container) {
    updateStats();
    return;
  }

  let offers = readStorage(STORAGE.offres);
  const filterText = normalize(inputValue("filtre-offres"));
  const filterStore = inputValue("filtre-magasin");

  if (filterText) {
    offers = offers.filter(offer =>
      normalize(offer.product).includes(filterText) ||
      normalize(offer.notes).includes(filterText)
    );
  }

  if (filterStore && filterStore !== "Tous") {
    offers = offers.filter(offer => offer.store === filterStore);
  }

  offers.sort((a, b) => pricePerUnit(a) - pricePerUnit(b));

  container.innerHTML = offers.length
    ? offers.map(offerHTML).join("")
    : '<p class="empty-state">Aucune offre enregistrée.</p>';

  updateStats();
}

function deleteOffer(id) {
  saveOffers(readStorage(STORAGE.offres)
    .filter(offer => String(offer.id) !== String(id)));
  renderOffers();
  renderLatestOffers();
  showToast("Offre supprimée.");
}

function renderLatestOffers() {
  const container = firstElement(
    "dernieres-offres", "offres-recentes", "latest-offers"
  );
  if (!container) return;

  const offers = readStorage(STORAGE.offres)
    .filter(offer => !isExpired(offer))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 4);

  container.innerHTML = offers.length
    ? offers.map(offerHTML).join("")
    : '<p>Aucune offre enregistrée pour le moment.</p>';
}

function initOffers() {
  const form = firstElement("form-offre");
  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();

      const product = inputValue("offre-produit");
      const store = inputValue("offre-magasin");
      const price = numericValue("offre-prix");
      const quantity = numericValue("offre-quantite") || 1;

      if (!product || !store || !Number.isFinite(price) || price < 0) {
        showToast("Vérifie le produit, le magasin et le prix.");
        return;
      }

      const offers = readStorage(STORAGE.offres);
      offers.push({
        id: makeId(),
        product,
        store,
        price,
        quantity,
        unit: inputValue("offre-unite") || "unité",
        endDate: inputValue("offre-fin"),
        url: inputValue("offre-lien"),
        notes: inputValue("offre-notes"),
        createdAt: Date.now()
      });

      saveOffers(offers);
      form.reset();
      renderOffers();
      renderLatestOffers();
      showToast("Offre enregistrée.");
    });
  }

  ["filtre-offres", "filtre-magasin"].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener("input", renderOffers);
      element.addEventListener("change", renderOffers);
    }
  });

  const clearButton = firstElement("supprimer-toutes-offres");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      if (!confirm("Supprimer toutes les offres enregistrées ?")) return;
      saveOffers([]);
      renderOffers();
      renderLatestOffers();
      showToast("Toutes les offres ont été supprimées.");
    });
  }
}

/* ===================== COMPARATEUR ===================== */

function ensureComparePanel() {
  const host = firstElement("recherches-externes", "resultats-comparateur");
  if (!host) return null;

  let panel = document.getElementById("compare-prices-panel");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "compare-prices-panel";
    panel.className = "compare-panel";

    panel.innerHTML = `
      <h3>Comparer Carrefour et Intermarché</h3>
      <p>Renseigne le prix normal, la quantité par paquet et le nombre de paquets.</p>

      <div class="compare-grid">
        <fieldset>
          <legend>Carrefour</legend>
          <label>Prix par paquet (€)
            <input id="compare-carrefour-price" type="number" min="0" step="0.01">
          </label>
          <label>Quantité par paquet
            <input id="compare-carrefour-quantity" type="number" min="0.001" step="any" value="1">
          </label>
          <label>Nombre de paquets
            <input id="compare-carrefour-packs" type="number" min="1" step="1" value="1">
          </label>
          <label>Promotion
            <select id="compare-carrefour-promo">
              <option value="none">Sans promotion</option>
              <option value="second50">2e produit à -50 %</option>
              <option value="percent">Réduction en pourcentage</option>
              <option value="fixed">Montant déduit du total</option>
              <option value="bundle2">2 produits pour un prix total</option>
            </select>
          </label>
          <label>Valeur de la promotion
            <input id="compare-carrefour-promo-value" type="number" min="0" step="0.01" value="0">
          </label>
        </fieldset>

        <fieldset>
          <legend>Intermarché</legend>
          <label>Prix par paquet (€)
            <input id="compare-intermarche-price" type="number" min="0" step="0.01">
          </label>
          <label>Quantité par paquet
            <input id="compare-intermarche-quantity" type="number" min="0.001" step="any" value="1">
          </label>
          <label>Nombre de paquets
            <input id="compare-intermarche-packs" type="number" min="1" step="1" value="1">
          </label>
          <label>Promotion
            <select id="compare-intermarche-promo">
              <option value="none">Sans promotion</option>
              <option value="second50">2e produit à -50 %</option>
              <option value="percent">Réduction en pourcentage</option>
              <option value="fixed">Montant déduit du total</option>
              <option value="bundle2">2 produits pour un prix total</option>
            </select>
          </label>
          <label>Valeur de la promotion
            <input id="compare-intermarche-promo-value" type="number" min="0" step="0.01" value="0">
          </label>
        </fieldset>
      </div>

      <label>Unité de comparaison
        <select id="compare-unit">
          <option value="unité">Unité</option>
          <option value="kg">kg</option>
          <option value="g">g</option>
          <option value="L">L</option>
          <option value="ml">ml</option>
        </select>
      </label>

      <div class="compare-actions">
        <button type="button" id="compare-prices-button">Comparer les prix</button>
        <button type="button" id="save-comparison-button">Enregistrer les deux offres</button>
      </div>
      <div id="compare-prices-result" aria-live="polite"></div>
    `;

    host.prepend(panel);
  }

  return panel;
}

function getCompareOption(store) {
  const prefix = store === "Carrefour" ? "compare-carrefour" : "compare-intermarche";
  const price = numericValue(`${prefix}-price`);
  const quantity = numericValue(`${prefix}-quantity`);
  const packs = numericValue(`${prefix}-packs`) || 1;
  const promo = inputValue(`${prefix}-promo`) || "none";
  const promoValue = numericValue(`${prefix}-promo-value`) || 0;
  const unit = inputValue("compare-unit") || "unité";

  if (!Number.isFinite(price) || price < 0) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(packs) || packs < 1) return null;

  const count = Math.floor(packs);
  const normalTotal = price * count;
  let finalTotal = normalTotal;
  let description = "Sans promotion";

  switch (promo) {
    case "second50": {
      const discounted = Math.floor(count / 2);
      finalTotal = price * (count - discounted * 0.5);
      description = "2e produit à -50 %";
      break;
    }
    case "percent": {
      const percentage = Math.min(100, Math.max(0, promoValue));
      finalTotal = normalTotal * (1 - percentage / 100);
      description = `-${percentage}%`;
      break;
    }
    case "fixed": {
      finalTotal = Math.max(0, normalTotal - promoValue);
      description = `${money(promoValue)} déduits du total`;
      break;
    }
    case "bundle2": {
      if (promoValue > 0) {
        const pairs = Math.floor(count / 2);
        const remainder = count % 2;
        finalTotal = pairs * promoValue + remainder * price;
        description = `2 produits pour ${money(promoValue)}`;
      }
      break;
    }
  }

  const totalQuantity = quantity * count;
  return {
    store,
    price,
    quantity,
    packs: count,
    normalTotal,
    finalTotal,
    totalQuantity,
    unitPrice: finalTotal / totalQuantity,
    unit,
    promo,
    promoValue,
    description
  };
}

function getComparison() {
  const carrefour = getCompareOption("Carrefour");
  const intermarche = getCompareOption("Intermarché");

  if (!carrefour && !intermarche) {
    showToast("Saisis un prix valide pour au moins un magasin.");
    return null;
  }

  const product = lastSearch || inputValue("recherche-produit");
  if (!product) {
    showToast("Recherche d'abord un produit.");
    return null;
  }

  let winner = null;
  if (carrefour && intermarche) {
    winner = carrefour.unitPrice <= intermarche.unitPrice
      ? carrefour
      : intermarche;
  } else {
    winner = carrefour || intermarche;
  }

  return { product, carrefour, intermarche, winner };
}

function renderComparison() {
  const result = document.getElementById("compare-prices-result");
  if (!result) return;

  const comparison = getComparison();
  if (!comparison) {
    result.innerHTML = "";
    return;
  }

  const { product, carrefour, intermarche, winner } = comparison;

  function offerDetails(option) {
    if (!option) {
      return "<p>Renseigne un prix valide pour ce magasin.</p>";
    }

    return `
      <p>Prix normal : <strong>${money(option.normalTotal)}</strong></p>
      <p>Promotion : <strong>${escapeHTML(option.description)}</strong></p>
      <p>Prix payé : <strong>${money(option.finalTotal)}</strong></p>
      <p>Quantité totale : ${option.totalQuantity} ${escapeHTML(option.unit)}</p>
      <p>Prix par unité : <strong>${money(option.unitPrice)}</strong></p>
    `;
  }

  let difference = "";

  if (carrefour && intermarche) {
    const totalDifference = Math.abs(carrefour.finalTotal - intermarche.finalTotal);
    const unitDifference = Math.abs(carrefour.unitPrice - intermarche.unitPrice);

    difference = `
      <p><strong>Différence sur le prix total :</strong> ${money(totalDifference)}.
      <strong>Différence par unité :</strong> ${money(unitDifference)}.</p>
    `;
  }

  result.innerHTML = `
    <h3>${winner.store === "Intermarché" ? "🔴" : "🔵"}
      ${escapeHTML(winner.store)} est le moins cher après promotion.</h3>

    <div class="compare-result-grid">
      <section>
        <h4>🔵 Carrefour</h4>
        ${offerDetails(carrefour)}
      </section>
      <section>
        <h4>🔴 Intermarché</h4>
        ${offerDetails(intermarche)}
      </section>
    </div>

    ${difference}

    <p class="compare-disclaimer">
      Résultat calculé à partir des prix et promotions que tu as saisis.
      Vérifie les conditions de l'offre, la carte de fidélité et le magasin.
      Les promotions réelles ne sont pas encore récupérées automatiquement.
    </p>
  `;

  installComparisonCourseButtons();
}

function saveComparisonOffers() {
  const comparison = getComparison();
  if (!comparison) return;

  const offers = readStorage(STORAGE.offres);

  [comparison.carrefour, comparison.intermarche]
    .filter(Boolean)
    .forEach(option => {
      offers.push({
        id: makeId(),
        product: comparison.product,
        store: option.store,
        price: option.finalTotal,
        quantity: option.totalQuantity,
        unit: option.unit,
        endDate: "",
        url: "",
        notes: `Prix normal : ${money(option.normalTotal)}. Promotion : ${option.description}. ${option.packs} paquet(s). Enregistré depuis le comparateur.`,
        createdAt: Date.now()
      });
    });

  saveOffers(offers);
  renderOffers();
  renderLatestOffers();
  showToast("Comparaison enregistrée dans les offres.");
}

/* ===================== AJOUT DEPUIS LE COMPARATEUR ===================== */

function installComparisonCourseButtons() {
  const result = document.getElementById("compare-prices-result");
  if (!result) return;

  let actions = document.getElementById("compare-add-to-courses");

  if (!actions) {
    actions = document.createElement("div");
    actions.id = "compare-add-to-courses";
    actions.style.cssText = `
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      margin:14px 0;
    `;
    result.insertAdjacentElement("afterend", actions);
  }

  actions.innerHTML = `
    <button type="button" id="compare-add-winner">
      🛒 Ajouter le moins cher
    </button>
    <button type="button" id="compare-add-carrefour">
      Choisir Carrefour
    </button>
    <button type="button" id="compare-add-intermarche">
      Choisir Intermarché
    </button>
  `;

  document.getElementById("compare-add-winner").onclick = () => {
    const comparison = getComparison();
    if (!comparison) return;

    addCourse(comparison.product, comparison.winner.packs, "Épicerie");
    showToast(
      `${comparison.product} ajouté aux courses — ${comparison.winner.store} est le moins cher.`
    );
  };

  document.getElementById("compare-add-carrefour").onclick = () => {
    const comparison = getComparison();
    if (!comparison) return;

    if (!comparison.carrefour) {
      showToast("Renseigne le prix Carrefour avant de le choisir.");
      return;
    }

    addCourse(comparison.product, comparison.carrefour.packs, "Épicerie");
    showToast(`${comparison.product} ajouté aux courses — Carrefour.`);
  };

  document.getElementById("compare-add-intermarche").onclick = () => {
    const comparison = getComparison();
    if (!comparison) return;

    if (!comparison.intermarche) {
      showToast("Renseigne le prix Intermarché avant de le choisir.");
      return;
    }

    addCourse(comparison.product, comparison.intermarche.packs, "Épicerie");
    showToast(`${comparison.product} ajouté aux courses — Intermarché.`);
  };
}

/* ===================== RECHERCHE ET LIENS EXTERNES ===================== */

function createExternalSearches(query) {
  const container = firstElement("recherches-externes");
  if (!container) return;

  const encoded = encodeURIComponent(query);
  const googleQuery = encodeURIComponent(`site:intermarche.com ${query}`);
  const shoppingQuery = encodeURIComponent(query);
  const localQuery = encodeURIComponent(`${query} Mably Roanne`);

  container.innerHTML = `
    <h3>Rechercher ce produit</h3>
    <div class="external-search-links">
      <a href="https://www.carrefour.fr/promotions?q=${encoded}"
        target="_blank" rel="noopener noreferrer">Carrefour</a>
      <a href="https://www.google.com/search?q=${googleQuery}"
        target="_blank" rel="noopener noreferrer">Intermarché</a>
      <a href="https://www.google.com/search?q=${shoppingQuery}"
        target="_blank" rel="noopener noreferrer">Google Shopping</a>
      <a href="https://www.google.com/search?q=${encodeURIComponent(query + " Lidl")}"
        target="_blank" rel="noopener noreferrer">Lidl</a>
      <a href="https://www.google.com/search?q=${encodeURIComponent(query + " E.Leclerc")}"
        target="_blank" rel="noopener noreferrer">E.Leclerc</a>
      <a href="https://www.google.com/maps/search/${localQuery}"
        target="_blank" rel="noopener noreferrer">Magasins à proximité</a>
    </div>
  `;

  ensureComparePanel();
}

function performSearch() {
  const query = inputValue("recherche-produit");
  if (!query) {
    showToast("Saisis un produit à rechercher.");
    return;
  }

  lastSearch = query;

  const title = firstElement("titre-resultats");
  if (title) title.textContent = `Résultats pour « ${query} »`;

  const zone = firstElement("zone-resultats");
  if (zone) zone.hidden = false;

  createExternalSearches(query);
  ensureComparePanel();
  renderSearchResults(query);
}

function renderSearchResults(query) {
  const container = firstElement("liste-promotions", "resultats-recherche");
  if (!container) return;

  const matches = readStorage(STORAGE.offres)
    .filter(offer =>
      normalize(offer.product).includes(normalize(query)) &&
      !isExpired(offer)
    )
    .sort((a, b) => pricePerUnit(a) - pricePerUnit(b));

  container.innerHTML = matches.length
    ? matches.map(offerHTML).join("")
    : "<p>Aucune offre enregistrée pour ce produit. Tu peux comparer les prix ci-dessus.</p>";
}

function initSearch() {
  const form = firstElement("form-recherche");

  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();
      performSearch();
    });
  }

  const clear = firstElement("effacer-recherche");
  if (clear) {
    clear.addEventListener("click", () => {
      const input = firstElement("recherche-produit");
      if (input) input.value = "";
      lastSearch = "";

      const result = firstElement("compare-prices-result");
      if (result) result.innerHTML = "";

      const actions = firstElement("compare-add-to-courses");
      if (actions) actions.remove();

      const external = firstElement("recherches-externes");
      if (external) external.innerHTML = "";

      const offers = firstElement("liste-promotions", "resultats-recherche");
      if (offers) offers.innerHTML = "";

      const title = firstElement("titre-resultats");
      if (title) title.textContent = "Résultats de recherche";
    });
  }
}

/* ===================== INITIALISATION ===================== */

function initComparison() {
  ensureComparePanel();

  document.addEventListener("click", event => {
    if (event.target.closest("#compare-prices-button")) {
      renderComparison();
    }

    if (event.target.closest("#save-comparison-button")) {
      saveComparisonOffers();
    }
  });

  document.addEventListener("change", event => {
    if (event.target.closest("#compare-prices-panel")) {
      const result = document.getElementById("compare-prices-result");
      if (result && result.innerHTML.trim()) renderComparison();
    }
  });
}

function init() {
  initCards();
  initCourses();
  initOffers();
  initSearch();
  initComparison();

  renderCards();
  renderCourses();
  renderOffers();
  renderLatestOffers();
  updateStats();

  // Menu mobile si présent dans la page.
  const menuButton = firstElement("menu-toggle", "menu-mobile-toggle");
  const menu = firstElement("menu-mobile", "navigation-mobile");

  if (menuButton && menu) {
    menuButton.addEventListener("click", () => menu.classList.toggle("open"));
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
