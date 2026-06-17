"""Live evaluation of `titulo_agent_v2` (LangGraph agent) over the Teno corpus.

Gated by `RUN_TITLE_LIVE_EVAL=1`. pytest must never call the LLM (SDD 009
agent-execution rule); this script is the only allowed live-call path. It runs
the real agent loop over the recorded Teno page texts and reports:

1. field-level chain accuracy vs `tests/fixtures/titulo/teno_golden_chain.json`
   (SC-001), including expected alert coverage (SC-003);
2. deterministic verification stats (SC-002);
3. block fact-check of the agent-drafted comparecencia/PRIMERO — zero
   unverified facts allowed (FR-006);
4. token usage and LLM call count (SC-010).

Migration gate (plan-migracion-agente.md F5): the agent flag may only be
enabled after 3 consecutive clean runs (100% chain accuracy, all expected
alerts, blocks fact-check ok).

Run from `apps/api/`:

    RUN_TITLE_LIVE_EVAL=1 LEGAL_TITLE_AGENT_ENABLED=true OPENAI_API_KEY=... \
        ./.venv/bin/python scripts/titulo_live_eval.py [--report report.json]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

FIXTURES_DIR = BACKEND_ROOT / "tests" / "fixtures" / "titulo"
PAGE_FIXTURES = ("teno_dominio_1996_pages.json", "teno_dominio_2023_pages.json")
GOLDEN_CHAIN_PATH = FIXTURES_DIR / "teno_golden_chain.json"


def _load_source_documents() -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for filename in PAGE_FIXTURES:
        payload = json.loads((FIXTURES_DIR / filename).read_text(encoding="utf-8"))
        document_id = str(payload["legal_document_id"])
        documents.append(
            {
                "id": document_id,
                "legal_document_id": document_id,
                "document_type": str(payload["document_type"]),
                "filename": filename,
                "version": 1,
                "extraction_status": "text_extracted",
                "pages": [
                    {
                        "id": f"{document_id}-p{page['page_number']}",
                        "legal_document_id": document_id,
                        "page_number": int(page["page_number"]),
                        "text_content": str(page["text_content"]),
                    }
                    for page in payload["pages"]
                ],
            }
        )
    return documents


def _pages_by_doc(documents: list[dict[str, Any]]) -> dict[str, dict[int, str]]:
    return {
        document["legal_document_id"]: {
            page["page_number"]: page["text_content"]
            for page in document["pages"]
        }
        for document in documents
    }


def _ev(value: Any) -> str | None:
    return value.value if value is not None else None


def _match(expected: Any, actual: Any) -> bool:
    from services.legal_title_verification import normalize_text

    if expected is None and actual is None:
        return True
    if isinstance(expected, bool) or isinstance(actual, bool):
        return expected == actual
    return normalize_text(str(expected or "")) == normalize_text(str(actual or ""))


def _check(
    results: list[dict[str, Any]],
    section: str,
    field: str,
    expected: Any,
    actual: Any,
) -> None:
    results.append(
        {
            "section": section,
            "field": field,
            "expected": expected,
            "actual": actual,
            "match": _match(expected, actual),
        }
    )


def _evaluate_inscription(
    results: list[dict[str, Any]],
    golden: dict[str, Any],
    inscription: Any,
) -> None:
    section = f"inscripciones[orden={golden['orden']}]"
    if inscription is None:
        _check(results, section, "presente", "si", None)
        return

    _check(results, section, "tipo_adquisicion", golden.get("tipo_adquisicion"), inscription.tipo_adquisicion)
    detalle = inscription.inscripcion
    _check(results, section, "fojas", golden.get("fojas"), _ev(detalle.fojas) if detalle else None)
    _check(results, section, "numero", golden.get("numero"), _ev(detalle.numero) if detalle else None)
    _check(results, section, "anio", golden.get("anio"), _ev(detalle.anio) if detalle else None)
    _check(results, section, "cbr", golden.get("cbr"), _ev(detalle.cbr) if detalle else None)

    escritura = inscription.escritura
    _check(results, section, "escritura_fecha", golden.get("escritura_fecha"), _ev(escritura.fecha) if escritura else None)
    _check(results, section, "notario", golden.get("notario"), _ev(escritura.notario) if escritura else None)
    _check(results, section, "notaria_ciudad", golden.get("notaria_ciudad"), _ev(escritura.notaria_ciudad) if escritura else None)
    if golden.get("repertorio") is not None:
        _check(results, section, "repertorio", golden.get("repertorio"), _ev(escritura.repertorio) if escritura else None)

    if golden.get("rectificatoria_fecha") is not None:
        rect = inscription.rectificatorias[0] if inscription.rectificatorias else None
        _check(results, section, "rectificatoria_fecha", golden.get("rectificatoria_fecha"), _ev(rect.fecha) if rect else None)
        _check(results, section, "rectificatoria_notario", golden.get("rectificatoria_notario"), _ev(rect.notario) if rect else None)
        _check(results, section, "rectificatoria_repertorio", golden.get("rectificatoria_repertorio"), _ev(rect.repertorio) if rect else None)

    antecesor = inscription.antecesor
    _check(results, section, "antecesor", golden.get("antecesor"), _ev(antecesor.nombre) if antecesor else None)

    extracted_adquirentes = {
        (_match_key(_ev(adquirente.nombre)), adquirente.cuota)
        for adquirente in inscription.adquirentes
    }
    for golden_adquirente in golden.get("adquirentes", []):
        key = (_match_key(golden_adquirente.get("nombre")), golden_adquirente.get("cuota"))
        _check(
            results,
            section,
            f"adquirente[{golden_adquirente.get('nombre')}]",
            f"{golden_adquirente.get('nombre')} ({golden_adquirente.get('cuota')})",
            f"{golden_adquirente.get('nombre')} ({golden_adquirente.get('cuota')})" if key in extracted_adquirentes else None,
        )

    extracted_observaciones = {obs.tipo for obs in inscription.observaciones if obs.tipo}
    for tipo in golden.get("observaciones", []):
        _check(results, section, f"observacion[{tipo}]", tipo, tipo if tipo in extracted_observaciones else None)


def _match_key(value: Any) -> str:
    from services.legal_title_verification import normalize_text

    return normalize_text(str(value or ""))


def _evaluate(analysis: Any, golden: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    _check(results, "general", "structure_type", golden.get("structure_type"), analysis.structure_type)

    inscriptions_by_orden = {inscription.orden: inscription for inscription in analysis.inscripciones}
    for golden_inscription in golden.get("inscripciones", []):
        _evaluate_inscription(
            results,
            golden_inscription,
            inscriptions_by_orden.get(int(golden_inscription["orden"])),
        )

    golden_owner = golden.get("propietario_actual") or {}
    owner = analysis.propietarios_actuales[0] if analysis.propietarios_actuales else None
    section = "propietario_actual"
    if owner is None:
        _check(results, section, "presente", "si", None)
    else:
        for field in ("nombre", "rut", "estado_civil", "profesion", "domicilio"):
            _check(results, section, field, golden_owner.get(field), _ev(getattr(owner, field, None)))
        _check(results, section, "cuota", golden_owner.get("cuota"), owner.cuota)
        _check(results, section, "requiere_personeria", golden_owner.get("requiere_personeria"), owner.requiere_personeria)

    golden_identity = golden.get("property_identity") or {}
    identity = analysis.property_identity
    section = "property_identity"
    for field in ("nombre_predio", "ubicacion", "comuna", "provincia", "region", "superficie_texto", "rol_avaluo"):
        _check(
            results,
            section,
            field,
            golden_identity.get(field),
            _ev(getattr(identity, field, None)) if identity else None,
        )
    golden_deslindes = golden_identity.get("deslindes") or {}
    deslindes = identity.deslindes if identity else None
    for field in ("norte", "sur", "oriente", "poniente"):
        _check(
            results,
            section,
            f"deslindes.{field}",
            golden_deslindes.get(field),
            _ev(getattr(deslindes, field, None)) if deslindes else None,
        )

    extracted_alert_tipos = {alert.tipo for alert in analysis.alertas}
    for tipo in golden.get("alert_tipos_esperados", []):
        _check(results, "alertas", f"tipo[{tipo}]", tipo, tipo if tipo in extracted_alert_tipos else None)

    return results


def _print_report(
    results: list[dict[str, Any]],
    verification_stats: dict[str, Any],
    model_name: str,
) -> dict[str, Any]:
    sections: dict[str, dict[str, int]] = {}
    for result in results:
        bucket = sections.setdefault(result["section"], {"total": 0, "matched": 0})
        bucket["total"] += 1
        bucket["matched"] += 1 if result["match"] else 0

    total = len(results)
    matched = sum(1 for result in results if result["match"])
    accuracy = matched / total if total else 0.0

    print(f"\n=== Titulo live eval — modelo {model_name} ===\n")
    for result in results:
        if not result["match"]:
            print(f"  MISMATCH {result['section']}.{result['field']}")
            print(f"    esperado: {result['expected']!r}")
            print(f"    obtenido: {result['actual']!r}")
    print("\nPrecision por seccion:")
    for section, bucket in sorted(sections.items()):
        print(f"  {section}: {bucket['matched']}/{bucket['total']}")
    print(f"\nPrecision total: {matched}/{total} ({accuracy:.1%})")
    print(
        "Verificador: "
        f"{verification_stats.get('verified_count', 0)} verificados, "
        f"{verification_stats.get('unverified_count', 0)} no verificados"
    )
    for failure in verification_stats.get("failures", []):
        print(f"  fallo verificacion: {failure.get('path')} ({failure.get('reason')})")

    return {
        "model_name": model_name,
        "accuracy": accuracy,
        "matched": matched,
        "total": total,
        "sections": sections,
        "results": results,
        "verification_stats": verification_stats,
    }


async def _run() -> dict[str, Any]:
    from agent_titulo.runner import run_title_agent
    from core.config import get_settings
    from services.legal_title_block_check import check_title_blocks
    from services.legal_title_verification import verify_title_analysis

    settings = get_settings()
    if not settings.LEGAL_TITLE_AGENT_ENABLED:
        raise SystemExit(
            "LEGAL_TITLE_AGENT_ENABLED=false: exporta LEGAL_TITLE_AGENT_ENABLED=true "
            "para la corrida en vivo."
        )

    documents = _load_source_documents()
    golden = json.loads(GOLDEN_CHAIN_PATH.read_text(encoding="utf-8"))

    outcome = await run_title_agent(
        documents,
        expediente={
            "sii_rol_matriz": (golden.get("property_identity") or {}).get("rol_avaluo"),
            "plano_superficie": None,
        },
    )
    if not outcome.available:
        raise SystemExit("Agente no disponible: falta la API key del proveedor.")
    analysis = outcome.result.analysis
    verification_stats = await verify_title_analysis(analysis, _pages_by_doc(documents))
    block_checks = check_title_blocks(
        comparecencia=outcome.result.narrativa_comparecencia,
        primero=outcome.result.narrativa_primero,
        analysis=analysis,
    )

    results = _evaluate(analysis, golden)
    report = _print_report(results, verification_stats, settings.LEGAL_TITLE_AGENT_MODEL)

    print("\nBloques narrativos (fact-check determinístico):")
    for name, check in block_checks.items():
        status = "OK" if check.get("ok") else "FALLA"
        print(f"  {name}: {status}")
        for issue in check.get("issues", []):
            print(f"    - {issue.get('motivo')}: {issue.get('hecho')}")
    for name, text in (
        ("comparecencia", outcome.result.narrativa_comparecencia),
        ("primero", outcome.result.narrativa_primero),
    ):
        if text:
            print(f"\n--- {name} (borrador del agente) ---\n{text}")
    if outcome.result.notas_razonamiento:
        print("\nNotas de razonamiento del agente:")
        for nota in outcome.result.notas_razonamiento:
            print(f"  - {nota}")
    print(
        f"\nConsumo: {outcome.llm_calls} llamadas LLM, "
        f"{outcome.token_usage.get('total_tokens', 0)} tokens "
        f"(in {outcome.token_usage.get('input_tokens', 0)} / "
        f"out {outcome.token_usage.get('output_tokens', 0)})"
    )

    clean_run = (
        report["accuracy"] == 1.0
        and verification_stats.get("unverified_count", 0) == 0
        and all(check.get("ok") for check in block_checks.values())
    )
    print(f"\nCorrida limpia (gate F5): {'SI' if clean_run else 'NO'}")

    report["block_checks"] = block_checks
    report["narrativa_comparecencia"] = outcome.result.narrativa_comparecencia
    report["narrativa_primero"] = outcome.result.narrativa_primero
    report["agent_notes"] = outcome.result.notas_razonamiento
    report["token_usage"] = outcome.token_usage
    report["llm_calls"] = outcome.llm_calls
    report["clean_run"] = clean_run
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="Ruta opcional para escribir el reporte JSON completo.",
    )
    args = parser.parse_args()

    if os.environ.get("RUN_TITLE_LIVE_EVAL") != "1":
        print(
            "Saltado: la evaluacion en vivo llama al proveedor LLM real. "
            "Exporta RUN_TITLE_LIVE_EVAL=1 para ejecutarla."
        )
        raise SystemExit(2)

    report = asyncio.run(_run())
    if args.report is not None:
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2, default=str) + "\n",
            encoding="utf-8",
        )
        print(f"Reporte JSON escrito en {args.report}")


if __name__ == "__main__":
    main()
