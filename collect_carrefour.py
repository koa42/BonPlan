
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

URL_TEST = (
    "https://www.carrefour.fr/p/"
    "pate-a-tartiner-noisettes-et-cacao-nutella-3017620429484"
)

def main():
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "fr-FR,fr;q=0.9",
    }

    print("Test de la fiche produit Carrefour...")

    response = requests.get(
        URL_TEST,
        headers=headers,
        timeout=30,
    )

    print("Code HTTP :", response.status_code)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # Recherche des données structurées du produit.
    product = {}

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or script.get_text())

            elements = data if isinstance(data, list) else [data]

            for element in elements:
                if isinstance(element, dict) and element.get("@type") == "Product":
                    product = element
                    break

                if isinstance(element, dict) and isinstance(element.get("@graph"), list):
                    for item in element["@graph"]:
                        if isinstance(item, dict) and item.get("@type") == "Product":
                            product = item
                            break

            if product:
                break

        except (json.JSONDecodeError, TypeError):
            continue

    nom = product.get("name", "")
    prix = None
    devise = "EUR"

    offres = product.get("offers", {})

    if isinstance(offres, list):
        offres = offres[0] if offres else {}

    if isinstance(offres, dict):
        prix_brut = offres.get("price")

        if prix_brut is not None:
            try:
                prix = float(str(prix_brut).replace(",", "."))
            except ValueError:
                pass

        devise = offres.get("priceCurrency", "EUR")

    if not nom:
        titre = soup.find("h1")
        if titre:
            nom = titre.get_text(" ", strip=True)

    print("Produit détecté :", nom or "non trouvé")
    print("Prix détecté :", prix if prix is not None else "non trouvé", devise)

    # Ce test ne publie pas de prix non confirmé.
    if not nom:
        raise RuntimeError(
            "La page est accessible, mais le nom du produit n'a pas été détecté."
        )

    if prix is None:
        print(
            "La page est accessible, mais le prix n'est pas présent "
            "dans les données structurées."
        )

    Path("data").mkdir(exist_ok=True)

    data = {
        "source": URL_TEST,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "count": 1 if prix is not None else 0,
        "offers": [],
    }

    if prix is not None:
        data["offers"].append({
            "id": "carrefour-nutella-3017620429484",
            "product": nom,
            "store": "Carrefour",
            "price": prix,
            "quantity": 1,
            "unit": "unité",
            "endDate": "",
            "url": URL_TEST,
            "notes": "",
            "unitPrice": None,
            "unitPriceUnit": None,
            "source": URL_TEST,
        })

    with open("data/promotions.json", "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)

    print("Test terminé. Fichier data/promotions.json mis à jour.")

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("ERREUR :", error, file=sys.stderr)
        sys.exit(1)
