import io

from docx import Document

from services.matriz_semantic_validation import validate_semantics


def docx_bytes(text: str) -> bytes:
    document = Document()
    document.add_paragraph(text)
    output = io.BytesIO()
    document.save(output)
    return output.getvalue()


def complete_person() -> dict:
    return {
        "personId": "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa",
        **{field: {"value": value, "state": "approved", "evidenceRef": "evidence:1"} for field, value in {
            "tratamiento": "Doña", "nombre": "Persona", "rut": "11.111.111-1",
            "nacionalidad": "chilena", "estadoCivil": "soltera",
        }.items()},
    }


def test_two_layer_validator_passes_ast_and_exact_docx_bytes() -> None:
    artifact = docx_bytes("Doña Persona comparece con sus hechos aprobados.")
    result = validate_semantics(
        resolved_ast={"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Doña Persona comparece con sus hechos aprobados."}]}]},
        artifact_bytes=artifact,
        comparecientes=[complete_person()],
    )
    assert result.status == "passed"
    assert len(result.artifact_sha256) == 64


def test_placeholder_and_unresolved_fact_are_blocking() -> None:
    person = complete_person()
    person["nacionalidad"] = {"value": None, "state": "missing", "evidenceRef": None}
    result = validate_semantics(
        resolved_ast={"type": "variable_token", "attrs": {"variableKey": "vendedor.nacionalidad"}},
        resolved_text="Doña Persona, de nacionalidad [NACIONALIDAD].",
        artifact_bytes=b"fixture",
        comparecientes=[person],
    )
    assert result.status == "failed"
    assert {issue.code for issue in result.issues} >= {"SEM_UNRESOLVED_TOKEN", "SEM_PLACEHOLDER_LITERAL", "SEM_MISSING_REQUIRED"}
