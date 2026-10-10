
/* =========================================================
   BONPLAN — AJOUTER LE RÉSULTAT DU COMPARATEUR AUX COURSES
   À placer tout à la fin de app.js
   ========================================================= */

(() => {
  "use strict";

  const STORAGE_KEY = "bonplan-courses";

  const get = (id) => document.getElementById(id);

  function lireCourses() {
    try {
      const donnees = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(donnees) ? donnees : [];
    } catch {
      return [];
    }
  }

  function enregistrerCourses(courses) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
  }

  function afficherMessage(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
      return;
    }

    alert(message);
  }

  function lireNombre(id) {
    const champ = get(id);
    if (!champ) return NaN;

    return Number(
      String(champ.value)
        .replace(",", ".")
        .replace(/[^\d.-]/g, "")
    );
  }

  function lireTexte(id) {
    return get(id)?.value?.trim() || "";
  }

  function obtenirComparaison() {
    const produit = lireTexte("recherche-produit");

    const prixCarrefour = lireNombre("compare-carrefour-price");
    const prixIntermarche = lireNombre("compare-intermarche-price");

    const quantiteCarrefour = lireNombre("compare-carrefour-quantity");
    const quantiteIntermarche = lireNombre("compare-intermarche-quantity");

    const unite = lireTexte("compare-unit") || "unité";

    const options = [
      {
        magasin: "Carrefour",
        prix: prixCarrefour,
        quantite: quantiteCarrefour
      },
      {
        magasin: "Intermarché",
        prix: prixIntermarche,
        quantite: quantiteIntermarche
      }
    ].filter(option =>
      Number.isFinite(option.prix) &&
      option.prix >= 0 &&
      Number.isFinite(option.quantite) &&
      option.quantite > 0
    );

    if (!produit) {
      afficherMessage("Recherche d'abord un produit.");
      return null;
    }

    if (options.length === 0) {
      afficherMessage(
        "Renseigne un prix et une quantité valides pour au moins un magasin."
      );
      return null;
    }

    options.forEach(option => {
      option.prixUnitaire = option.prix / option.quantite;
    });

    return { produit, unite, options };
  }

  function ajouterAuxCourses(option, comparaison) {
    const courses = lireCourses();

    const nouvelleCourse = {
      id: "course-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      nom: comparaison.produit,
      produit: comparaison.produit,
      magasin: option.magasin,
      quantite: 1,
      unite: comparaison.unite,
      prix: option.prix,
      prixUnitaire: option.prixUnitaire,
      checked: false,
      coche: false,
      termine: false,
      dateAjout: new Date().toISOString(),
      notes: "Ajouté depuis le comparateur BonPlan"
    };

    courses.push(nouvelleCourse);
    enregistrerCourses(courses);

    // Actualise la liste existante si l'application expose son rendu.
    if (typeof window.renderCourses === "function") {
      window.renderCourses();
    }

    afficherMessage(
      `${comparaison.produit} ajouté à la liste de courses (${option.magasin}).`
    );
  }

  function installerBoutons() {
    const zone = get("compare-prices-result");
    if (!zone) return;

    let commandes = get("compare-add-to-courses");

    if (!commandes) {
      commandes = document.createElement("div");
      commandes.id = "compare-add-to-courses";
      commandes.style.cssText =
        "display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;";

      zone.insertAdjacentElement("afterend", commandes);
    }

    commandes.replaceChildren();

    const boutonMoinsCher = document.createElement("button");
    boutonMoinsCher.type = "button";
    boutonMoinsCher.textContent = "Ajouter le moins cher";
    boutonMoinsCher.className = "btn btn-primary";

    boutonMoinsCher.addEventListener("click", () => {
      const comparaison = obtenirComparaison();
      if (!comparaison) return;

      const moinsCher = comparaison.options.reduce((meilleur, option) =>
        option.prixUnitaire < meilleur.prixUnitaire ? option : meilleur
      );

      ajouterAuxCourses(moinsCher, comparaison);
    });

    commandes.appendChild(boutonMoinsCher);

    ["Carrefour", "Intermarché"].forEach(magasin => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.textContent = "Choisir " + magasin;
      bouton.className = "btn";

      bouton.addEventListener("click", () => {
        const comparaison = obtenirComparaison();
        if (!comparaison) return;

        const option = comparaison.options.find(
          element => element.magasin === magasin
        );

        if (!option) {
          afficherMessage(
            `Renseigne le prix et la quantité pour ${magasin} avant de le choisir.`
          );
          return;
        }

        ajouterAuxCourses(option, comparaison);
      });

      commandes.appendChild(bouton);
    });
  }

  function initialiser() {
    const boutonComparer = get("compare-prices-button");
    const zoneResultat = get("compare-prices-result");

    if (!boutonComparer || !zoneResultat) return;

    // Le comparateur existant reste responsable de son calcul.
    boutonComparer.addEventListener("click", () => {
      setTimeout(installerBoutons, 0);
    });

    // Les boutons sont aussi réinstallés si le résultat est actualisé.
    const observateur = new MutationObserver(() => {
      installerBoutons();
    });

    observateur.observe(zoneResultat, {
      childList: true,
      subtree: true,
      characterData: true
    });

    installerBoutons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiser);
  } else {
    initialiser();
  }
})();
