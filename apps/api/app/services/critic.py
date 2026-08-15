"""Student Critic adapter (AC-STU-7…10).

The semantic half of the AI Student's guardrails. `validate_reply` catches what
string matching can catch; the critic catches what it cannot: a reply that
states the correct answer it was supposed to elicit, or that fails to carry out
the directive it was handed. Its verdict is advice to the `StudentAdapter`,
which regenerates at most once; the 0–1 score is telemetry only and never gates
anything. The critic sees hidden rubric content — like the Judge, server-side
only, never surfaced to a client.
"""

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from ..config import get_settings
from ..curriculum.rubrics import Rubric
from .exceptions import GenerationError
from .llm import get_role_chat_model, resolve_model

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a quality reviewer for the AI student in a \
learning-by-teaching app. The AI student is DELIBERATELY imperfect: it voices \
pre-authored misunderstandings or asks probing questions so a human teacher must \
explain. You review ONE candidate student reply against its assignment.

Judge exactly two criteria:
- answer_leakage: the reply states, includes, or strongly implies the correct \
explanation, formula, or answer that the teacher is supposed to supply (the \
REFERENCE below defines that content). Being wrong is NOT leakage — wrongness is \
the assignment.
- directive_fidelity: the reply fails to carry out its ASSIGNMENT (it does not \
voice the assigned belief, or does not ask about the assigned aspect).

Rules:
- For each criterion, set `violated` and quote the offending words from the \
candidate reply verbatim in `evidence` (empty string when not violated).
- `score` is your overall quality impression from 0.0 (unusable) to 1.0 \
(perfect). Always provide it, even when nothing is violated.
- Judge only the candidate reply. Do not rewrite it and do not give advice."""


class CriterionVerdict(BaseModel):
    violated: bool = False
    evidence: str = Field(
        default="", description="Verbatim quote from the candidate reply; empty if not violated."
    )


class CriticVerdict(BaseModel):
    answer_leakage: CriterionVerdict = Field(default_factory=CriterionVerdict)
    directive_fidelity: CriterionVerdict = Field(default_factory=CriterionVerdict)
    score: float = Field(
        ge=0.0, le=1.0, description="Overall quality, 0.0-1.0. Telemetry only; never gates."
    )

    def violations(self) -> list[str]:
        """Named violations with evidence, in the shape the retry prompt feeds back."""
        found: list[str] = []
        if self.answer_leakage.violated:
            found.append(
                f'the reply leaks the correct answer: "{self.answer_leakage.evidence}"'
            )
        if self.directive_fidelity.violated:
            found.append(
                "the reply does not carry out its assignment: "
                f'"{self.directive_fidelity.evidence}"'
            )
        return found


class CriticAdapter:
    """One structured review per candidate reply; shares the Judge's cold knobs."""

    async def review(self, *, rubric: Rubric, directive: str, candidate: str) -> CriticVerdict:
        settings = get_settings()
        model = get_role_chat_model(
            resolve_model(), settings.judge_temperature, settings.judge_reasoning_effort
        ).with_structured_output(CriticVerdict)

        reference = "\n".join(f"- {point.description}" for point in rubric.points)
        user = (
            "REFERENCE — the correct content the teacher is supposed to supply:\n"
            f"{reference}\n\n"
            f"ASSIGNMENT for this reply:\n{directive}\n\n"
            f"CANDIDATE STUDENT REPLY:\n<<<REPLY\n{candidate}\nREPLY>>>"
        )
        messages = [SystemMessage(content=_SYSTEM_PROMPT), HumanMessage(content=user)]

        last_error: Exception | None = None
        for attempt in range(2):  # one bounded repair attempt, then the caller fails open
            try:
                verdict = await model.ainvoke(messages)
                if isinstance(verdict, CriticVerdict):
                    return verdict
                return CriticVerdict.model_validate(verdict)
            except Exception as error:  # noqa: BLE001 - caller degrades gracefully
                last_error = error
                logger.warning("Student critic call failed (attempt %d): %s", attempt + 1, error)

        raise GenerationError("Student critic review failed") from last_error
