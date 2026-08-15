"""HintAdapter guardrail tests.

Overrides the adapter's `_complete` seam with scripted outputs, so no LangChain
model or live provider is involved.
"""

import pytest

from app.schemas import Mode
from app.services.exceptions import GenerationError
from app.services.hint import MAX_HINT_CHARS, HintAdapter, validate_hint


class ScriptedHint(HintAdapter):
    """HintAdapter with a scripted provider seam; records every prompt."""

    def __init__(self, outputs: list) -> None:
        self.outputs = list(outputs)
        self.calls: list[tuple[str, str]] = []

    async def _complete(self, system: str, task: str) -> str:
        self.calls.append((system, task))
        assert self.outputs, "scripted hint ran out of outputs"
        output = self.outputs.pop(0)
        if isinstance(output, Exception):
            raise output
        return output


async def hint(adapter: ScriptedHint, *, misconception_summary: str | None = None) -> str:
    return await adapter.hint(
        concept_title="Gradient Descent",
        mode=Mode.confident,
        transcript=[("student", "Opening question?"), ("teacher", "An explanation.")],
        student_text="So a bigger step always gets there faster, no?",
        misconception_summary=misconception_summary,
    )


def test_validate_hint_flags_leaks_emptiness_and_length() -> None:
    assert validate_hint("") == ["hint is empty"]
    assert validate_hint("The rubric wants you to mention divergence.")
    assert validate_hint("x" * (MAX_HINT_CHARS + 1))
    assert validate_hint("Ask what happens when the step overshoots the minimum.") == []


async def test_valid_hint_is_returned_stripped() -> None:
    adapter = ScriptedHint(["  Contrast a tiny and a huge step size.  "])
    assert await hint(adapter) == "Contrast a tiny and a huge step size."


async def test_prompt_carries_only_learner_visible_context() -> None:
    adapter = ScriptedHint(["Show what the claim predicts, then test it."])
    await hint(adapter, misconception_summary="Thinks bigger steps always converge faster.")

    _, task = adapter.calls[0]
    assert "So a bigger step always gets there faster" in task
    assert "Thinks bigger steps always converge faster." in task
    assert "teacher: An explanation." in task


async def test_leaky_hint_is_retried_with_violations_named() -> None:
    adapter = ScriptedHint(
        [
            "The judge marked the step-size point as missing.",
            "Walk through one update with a huge learning rate.",
        ]
    )
    assert await hint(adapter) == "Walk through one update with a huge learning rate."
    assert len(adapter.calls) == 2
    assert "rejected because" in adapter.calls[1][1]


async def test_hint_invalid_after_retry_raises_generation_error() -> None:
    adapter = ScriptedHint(["", ""])
    with pytest.raises(GenerationError):
        await hint(adapter)


async def test_provider_failure_raises_generation_error() -> None:
    adapter = ScriptedHint([RuntimeError("provider down")])
    with pytest.raises(GenerationError):
        await hint(adapter)
