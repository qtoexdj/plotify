"""SDD 010 T002: inventario de etiquetas humanas del catalogo canonico.

Garantias:
- Toda clave y todo grupo del catalogo tienen etiqueta es-CL (cobertura 100%).
- Ninguna etiqueta es una clave cruda (sin underscores ni prefijos tecnicos).
- Paridad con la copia web del CCL (`LEGAL_VARIABLE_GROUP_LABELS` en
  apps/web/src/lib/legal/variable-resolution-types.ts): la copia web queda
  para el CCL hasta su rediseno (research D4); aqui se compara normalizando
  diacriticos para que el API pueda llevar tildes correctas mientras la
  copia web siga en ASCII.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import pytest

from services.legal_variable_catalog import (
    VARIABLE_GROUP_LABELS,
    VARIABLE_GROUPS,
    VARIABLE_KEYS,
    VARIABLE_LABELS,
    variable_group_label,
    variable_label_for_key,
)

WEB_GROUP_LABELS_FILE = (
    Path(__file__).resolve().parents[3]
    / "apps"
    / "web"
    / "src"
    / "lib"
    / "legal"
    / "variable-resolution-types.ts"
)

RAW_KEY_PATTERN = re.compile(r"^[a-z_]+\.")


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return stripped.casefold().strip()


def _web_group_labels() -> dict[str, str]:
    source = WEB_GROUP_LABELS_FILE.read_text(encoding="utf-8")
    match = re.search(
        r"export const LEGAL_VARIABLE_GROUP_LABELS = \{(.*?)\}",
        source,
        re.DOTALL,
    )
    assert match, "LEGAL_VARIABLE_GROUP_LABELS no encontrado en la copia web"
    entries = re.findall(r"(\w+):\s*'([^']*)'", match.group(1))
    assert entries, "Copia web de etiquetas de grupo vacia o ilegible"
    return dict(entries)


def test_every_variable_key_has_label() -> None:
    missing = [key for key in VARIABLE_KEYS if key not in VARIABLE_LABELS]
    assert not missing, f"Claves sin etiqueta humana: {missing}"


def test_no_orphan_labels() -> None:
    orphans = [key for key in VARIABLE_LABELS if key not in VARIABLE_KEYS]
    assert not orphans, f"Etiquetas de claves que no existen en el catalogo: {orphans}"


def test_labels_are_human_not_raw_keys() -> None:
    offenders = [
        (key, label)
        for key, label in VARIABLE_LABELS.items()
        if not label.strip()
        or label == key
        or "_" in label
        or RAW_KEY_PATTERN.match(label)
    ]
    assert not offenders, f"Etiquetas que parecen claves crudas: {offenders}"


def test_every_group_has_label() -> None:
    missing = [group for group in VARIABLE_GROUPS if group not in VARIABLE_GROUP_LABELS]
    assert not missing, f"Grupos sin etiqueta humana: {missing}"
    orphans = [group for group in VARIABLE_GROUP_LABELS if group not in VARIABLE_GROUPS]
    assert not orphans, f"Etiquetas de grupos inexistentes: {orphans}"


def test_label_helper_resolves_catalog_and_dynamic_deslindes() -> None:
    assert variable_label_for_key("comprador.nombre") == "Nombre del comprador"
    assert (
        variable_label_for_key("matriz.deslindes.norte")
        == "Deslinde norte del predio matriz"
    )
    assert (
        variable_label_for_key("matriz.deslindes.*")
        == "Deslindes del predio matriz"
    )


def test_label_helper_raises_on_unknown_key() -> None:
    with pytest.raises(KeyError):
        variable_label_for_key("desconocido.clave")


def test_group_label_helper() -> None:
    assert variable_group_label("titulo") == "Estudio de título"
    with pytest.raises(KeyError):
        variable_group_label("grupo_fantasma")


def test_group_labels_parity_with_web_ccl_copy() -> None:
    web_labels = _web_group_labels()
    unknown = [group for group in web_labels if group not in VARIABLE_GROUP_LABELS]
    assert not unknown, f"La copia web tiene grupos fuera del catalogo: {unknown}"
    divergent = {
        group: (web_label, VARIABLE_GROUP_LABELS[group])
        for group, web_label in web_labels.items()
        if _normalize(web_label) != _normalize(VARIABLE_GROUP_LABELS[group])
    }
    assert not divergent, (
        "Etiquetas de grupo divergentes entre API y copia web del CCL "
        f"(web, api): {divergent}"
    )
