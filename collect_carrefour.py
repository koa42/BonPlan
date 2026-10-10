
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

SOURCE_URL = "https://www.carrefour.fr/promotions"
OUTPUT_FILE = Path("data/promotions.json")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
}

PRICE_RE = re.compile(
    r"(?<!\d)(\d{1,4})\s*,\s*(\d{2})\s*€"
)
UNIT_PRICE_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*€\s*/\s*(KG|KILO|L|U|UNITÉ)",
    re.IGNORECASE,
)


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def get_price(text):
    match = PRICE_RE.search(text)
    if not match:
        return None
    return float(f"{match.group(1)}.{match.group(2)}")


def get_unit_price(text):
    match = UNIT_PRICE_RE.search(text)
    if not match:
        return None, None

    unit = match.group(2).upper()
    if unit == "KILO":
        unit = "KG"
    elif unit == "UNITÉ":
        unit = "U"

    return float(match.group(1).replace(",", ".")), unit


def is_generic_name(value):
    value = clean_text(value).lower()
    generic = {
        "acheter",
        "voir le produit",
        "en savoir plus",
        "profiter de l'offre",
        "ouvrir description de la promotion",
        "carrefour",
    }
    return not value or value in generic or len(value) < 5


def get_product_name(link, card):
    # Priorité au titre visible de la fiche produit.
    for selector in ("h2", "h3", "[itemprop='name']"):
        element = card.select_one(selector)
        if element:
            name = clean_text(element.get_text(" ", strip=True))
            if not is_generic_name(name):
                return name

    # Puis aux attributs descriptifs du lien.
    for attribute in ("aria-label", "title"):
        name = clean_text(link.get(attribute, ""))
        if not is_generic_name(name):
            return name

    # Puis au texte du lien.
    name = clean_text(link.get_text(" ", strip=True))
    if not is_generic_name(name):
        return name

    # Dernier recours : chercher une ligne qui ressemble à un nom produit.
    for line in card.stripped_strings:
        line = clean_text(line)
        low = line.lower()

        if (
            len(line) >= 8
            and not is_generic_name(line)
            and not PRICE_RE.search(line)
            and not any(word in low for word in (
                "promotion", "économies", "acheter",
                "profiter de l'offre", "ouvrir description",
                "avis pour une note", "sponsorisé",
            ))
        ):
            return line

    return ""


def get_promotion(text):
    lines = [clean_text(line) for line in text.split("  ") if clean_text(line)]
    keywords = (
        "%", "2ème", "2e ", "économie", "économies",
        "fidélité", "remise", "payez en", "acheté",
    )

    for line in lines:
        if any(word in line.lower() for word in keywords):
            if len(line) <= 140:
                return line

    return ""


def find_card(link):
    # Remonte depuis le lien jusqu'au premier bloc contenant un prix.
    for parent in link.parents:
        text = clean_text(parent.get_text(" ", strip=True))

        if 30 <= len(text) <= 1800 and PRICE_RE.search(text):
            return parent

    return None


def collect_promotions(html):
    soup = BeautifulSoup(html, "html.parser")
    results = []
    seen = set()

    links = soup.select('a[href*="/p/"]')

    for link in links:
        url = urljoin(SOURCE_URL, link.get("href", ""))

        if not url.startswith("https://www.carrefour.fr/p/"):
            continue
        if url in seen:
            continue

        card = find_card(link)
        if card is None:
            continue

        text = clean_text(card.get_text(" ", strip=True))
        price = get_price(text)
        product = get_product_name(link, card)

        if price is None or not product:
            continue

        unit_price, unit = get_unit_price(text)

        # Recherche d'une indication de promotion dans le texte de la carte.
        promotion = get_promotion(text)

        results.append({
            "id": "carrefour-" + str(abs(hash(url))),
            "product": product,
            "store": "Carrefour",
            "price": price,
            "quantity": 1,
            "unit": "unité",
            "endDate": "",
            "url": url,
            "notes": promotion or "Prix relevé sur la page Carrefour.",
            "unitPrice": unit_price,
            "unitPriceUnit": unit,
            "source": SOURCE_URL,
        })

        seen.add(url)

    return results


def main():
    print(f"Lecture de la source : {SOURCE_URL}")

    response = requests.get(
        SOURCE_URL,
        headers=HEADERS,
        timeout=45,
    )
    response.raise_for_status()

    offers = collect_promotions(response.text)

    if not offers:
        print(
            "ERREUR : aucun produit exploitable n'a été trouvé. "
            "Le site peut avoir changé ou bloquer la collecte. "
            "Le fichier existant ne sera pas remplacé.",
            file=sys.stderr,
        )
        sys.exit(1)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    data = {
        "source": SOURCE_URL,
        "updatedAt": datetime.now(timezone.utc).isoformat(
            timespec="seconds"
        ),
        "count": len(offers),
        "offers": offers,
    }

    OUTPUT_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Collecte terminée : {len(offers)} produits enregistrés.")
    print(f"Fichier généré : {OUTPUT_FILE}")


if __name__ == "__main__":
    main()

