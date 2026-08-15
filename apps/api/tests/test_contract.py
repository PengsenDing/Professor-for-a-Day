"""Contract drift test (ADR-0001).

`packages/shared/openapi.yaml` is the authoritative contract. These tests compare
the schema FastAPI derives from the code against it and fail on drift: a missing
route, a changed status code, a renamed field, a diverging enum.
"""

from pathlib import Path

import pytest
import yaml

CONTRACT_PATH = Path(__file__).resolve().parents[3] / "packages" / "shared" / "openapi.yaml"
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}

# Components compared field-by-field. Pure string aliases (e.g. ConceptId) are
# inlined by FastAPI rather than emitted as named components, so they are absent.
COMPARED_COMPONENTS = [
    "Health",
    "Concept",
    "ConceptRef",
    "PrerequisiteEdge",
    "Curriculum",
    "GraphSummary",
    "GraphList",
    "GraphUpdate",
    "StartSessionRequest",
    "SessionCreated",
    "SubmitTurnRequest",
    "RubricPointRef",
    "ActiveMisconception",
    "Progress",
    "TurnEnvelope",
    "SnapshotTurn",
    "SessionSnapshot",
    "DemonstratedEvidence",
    "TeacherReport",
    "SessionFinished",
    "Transcription",
    "TurnHint",
    # `Error` is inlined inside ErrorEnvelope in the contract, not a named component.
    "ErrorEnvelope",
]
COMPARED_ENUMS = ["Mode", "InputMode", "SessionStatus", "EndReason", "GraphSource", "ErrorCode"]


@pytest.fixture(scope="module")
def contract() -> dict:
    return yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def app_schema() -> dict:
    from app.main import app

    return app.openapi()


def operations(schema: dict) -> dict[tuple[str, str], dict]:
    return {
        (path, method): operation
        for path, path_item in schema["paths"].items()
        for method, operation in path_item.items()
        if method in HTTP_METHODS
    }


def resolve(schema: dict, node: dict) -> dict:
    """Follow a local $ref (e.g. into components/responses) to its definition."""
    while "$ref" in node:
        target = schema
        for part in node["$ref"].removeprefix("#/").split("/"):
            target = target[part]
        node = target
    return node


def test_paths_and_methods_match(contract: dict, app_schema: dict) -> None:
    assert set(operations(app_schema)) == set(operations(contract))


def test_operation_ids_match(contract: dict, app_schema: dict) -> None:
    app_operations = operations(app_schema)
    for key, contract_operation in operations(contract).items():
        assert app_operations[key].get("operationId") == contract_operation.get(
            "operationId"
        ), key


def test_status_codes_match(contract: dict, app_schema: dict) -> None:
    app_operations = operations(app_schema)
    for key, contract_operation in operations(contract).items():
        assert set(app_operations[key]["responses"]) == set(
            contract_operation["responses"]
        ), key


def test_response_content_types_match(contract: dict, app_schema: dict) -> None:
    app_operations = operations(app_schema)
    for key, contract_operation in operations(contract).items():
        for status_code, contract_response in contract_operation["responses"].items():
            contract_content = set(resolve(contract, contract_response).get("content", {}))
            app_response = resolve(app_schema, app_operations[key]["responses"][status_code])
            app_content = set(app_response.get("content", {}))
            assert contract_content == app_content, (key, status_code)


def test_component_fields_match(contract: dict, app_schema: dict) -> None:
    contract_schemas = contract["components"]["schemas"]
    app_schemas = app_schema["components"]["schemas"]

    for name in COMPARED_COMPONENTS:
        assert name in app_schemas, f"component {name} missing from the app schema"
        contract_component = contract_schemas[name]
        app_component = app_schemas[name]
        assert set(app_component.get("properties", {})) == set(
            contract_component.get("properties", {})
        ), name
        assert set(app_component.get("required", [])) == set(
            contract_component.get("required", [])
        ), name


def test_enums_match(contract: dict, app_schema: dict) -> None:
    contract_schemas = contract["components"]["schemas"]
    app_schemas = app_schema["components"]["schemas"]

    for name in COMPARED_ENUMS:
        assert name in app_schemas, f"enum {name} missing from the app schema"
        contract_values = {value for value in contract_schemas[name]["enum"] if value is not None}
        app_values = {value for value in app_schemas[name]["enum"] if value is not None}
        assert app_values == contract_values, name
