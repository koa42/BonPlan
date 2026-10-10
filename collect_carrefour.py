
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


URL_PROMOTIONS = "https://www.carrefour.fr/promotions"
FICHIER_SORTIE = Path("data/promotions.json")


def nettoyer_texte(texte):
    """Nettoie les espaces dans un texte."""
    if not texte:
        return ""

    return re.sub(r"\s+", " ", texte).strip()


def extraire_prix(texte):
    """Récupère les prix en euros présents dans un texte."""
    if not texte:
        return []

    correspondances = re.findall(
        r"(\d{1,4}(?:[.,]\d{1,2})?)\s*€",
        texte.replace("\u202f", " ").replace("\xa0", " "),
    )

    prix = []

    for valeur in correspondances:
        try:
            montant = float(valeur.replace(",", "."))

            if 0 < montant < 10000:
                prix.append(montant)
        except ValueError:
            continue

    return prix


def trouver_nom_produit(carte):
    """Essaie de trouver le nom du produit dans une carte."""
    selecteurs = [
        "[data-testid*='title']",
        "[data-testid*='product-title']",
        "h2",
        "h3",
        "h4",
        "a[href*='/p/']",
    ]

    for selecteur in selecteurs:
        element = carte.select_one(selecteur)

        if element:
            nom = nettoyer_texte(element.get_text(" ", strip=True))

            if nom and len(nom) >= 3:
                return nom

    return ""


def trouver_carte_produit(lien):
    """Remonte dans le HTML pour trouver le bloc contenant le produit."""
    parent = lien

    for _ in range(8):
        if parent is None:
            break

        texte = nettoyer_texte(parent.get_text(" ", strip=True))

        if extraire_prix(texte):
            return parent

        parent = parent.parent

    return lien.parent if lien.parent else lien


def collecter_promotions():
    """Télécharge la page Carrefour et tente d'extraire les offres."""
    print(f"Récupération de la page : {URL_PROMOTIONS}")

    entetes = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/130.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    }

    reponse = requests.get(
        URL_PROMOTIONS,
        headers=entetes,
        timeout=30,
    )

    reponse.raise_for_status()

    soup = BeautifulSoup(reponse.text, "html.parser")

    offres = []
    urls_vues = set()

    liens_produits = soup.select("a[href*='/p/']")

    print(f"Liens produits repérés : {len(liens_produits)}")

    for lien in liens_produits:
        url = urljoin(URL_PROMOTIONS, lien.get("href", ""))

        if not url.startswith("https://www.carrefour.fr/"):
            continue

        if url in urls_vues:
            continue

        urls_vues.add(url)

        carte = trouver_carte_produit(lien)
        texte_carte = nettoyer_texte(carte.get_text(" ", strip=True))
        prix_trouves = extraire_prix(texte_carte)

        if not prix_trouves:
            continue

        nom = trouver_nom_produit(carte)

        if not nom:
            nom = nettoyer_texte(lien.get_text(" ", strip=True))

        if not nom:
            continue

        prix = prix_trouves[-1]

        offre = {
            "id": "carrefour-" + hashlib.sha1(
                url.encode("utf-8")
            ).hexdigest()[:12],
            "product": nom,
            "store": "Carrefour",
            "price": prix,
            "quantity": 1,
            "unit": "unité",
            "endDate": "",
            "url": url,
            "notes": "",
            "unitPrice": None,
            "unitPriceUnit": None,
            "source": URL_PROMOTIONS,
        }

        offres.append(offre)

    # Évite les doublons éventuels.
    offres_uniques = []
    identifiants_vus = set()

    for offre in offres:
        if offre["id"] not in identifiants_vus:
            identifiants_vus.add(offre["id"])
            offres_uniques.append(offre)

    if not offres_uniques:
        raise RuntimeError(
            "Aucune promotion détectée. Carrefour a peut-être modifié "
            "sa page ou chargé les produits avec JavaScript. "
            "Consulte les journaux de cette exécution dans GitHub Actions."
        )

    FICHIER_SORTIE.parent.mkdir(parents=True, exist_ok=True)

    donnees = {
        "source": URL_PROMOTIONS,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(offres_uniques),
        "offers": offres_uniques,
    }

    with FICHIER_SORTIE.open("w", encoding="utf-8") as fichier:
        json.dump(
            donnees,
            fichier,
            ensure_ascii=False,
            indent=2,
        )

    print(f"Promotions enregistrées : {len(offres_uniques)}")
    print(f"Fichier créé : {FICHIER_SORTIE}")


if __name__ == "__main__":
    try:
        collecter_promotions()
    except Exception as erreur:
        print(f"ERREUR : {erreur}", file=sys.stderr)
        sys.exit(1)
