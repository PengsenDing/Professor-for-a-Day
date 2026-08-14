"""Request/response contracts.

The authoritative contract is `packages/shared/openapi.yaml` (ADR-0001). The models
here are verified against it by `tests/test_contract.py`; they are split by domain
but re-exported flat, so routes import from `app.schemas`.
"""

from .curriculum import Concept, ConceptId, ConceptRef, Curriculum, PrerequisiteEdge
from .errors import Error, ErrorCode, ErrorEnvelope
from .health import Database, Health
from .sessions import (
    ActiveMisconception,
    EndReason,
    InputMode,
    Mode,
    Progress,
    RubricPointRef,
    SessionCreated,
    SessionFinished,
    SessionStatus,
    StartSessionRequest,
    SubmitTurnRequest,
    TeacherReport,
    TurnEnvelope,
)
from .speech import Transcription

__all__ = [
    "ActiveMisconception",
    "Concept",
    "ConceptId",
    "ConceptRef",
    "Curriculum",
    "Database",
    "EndReason",
    "Error",
    "ErrorCode",
    "ErrorEnvelope",
    "Health",
    "InputMode",
    "Mode",
    "PrerequisiteEdge",
    "Progress",
    "RubricPointRef",
    "SessionCreated",
    "SessionFinished",
    "SessionStatus",
    "StartSessionRequest",
    "SubmitTurnRequest",
    "TeacherReport",
    "Transcription",
    "TurnEnvelope",
]
