"""StudentAdapter guardrail tests (AC-STU-2..4, AC-STU-6).

Overrides the adapter's `_complete` seam with scripted outputs, so no LangChain
model or live provider is involved.
"""

from app.curriculum.rubrics import load_rubrics
from app.schemas import Mode
from app.services.student import StudentAdapter, validate_reply

GD = "gradient-descent"


def gd_rubric():
    return load_rubrics()[GD]


class ScriptedStudent(StudentAdapter):
    """StudentAdapter with a scripted provider seam; records every prompt."""

    def __init__(self, outputs: list) -> None:
        self.outputs = list(outputs)
        self.calls: list[tuple[str, str]] = []

    async def _complete(self, system: str, task: str) -> str:
        self.calls.append((system, task))
        assert self.outputs, "scripted student ran out of outputs"
        output = self.outputs.pop(0)
        if isinstance(output, Exception):
            raise output
        return output


async def reply(
    student: ScriptedStudent,
    *,
    pose=None,
    press=None,
    session_ended=False,
    mode=Mode.confident,
    learner_text="An explanation.",
    pose_trigger=None,
) -> str:
    return await student.reply(
        rubric=gd_rubric(),
        concept_title="Gradient Descent",
        mode=mode,
        transcript=[("student", "Opening question?"), ("teacher", "An explanation.")],
        learner_text=learner_text,
        probe_focus="The update rule and iteration",
        pose=pose,
        press=press,
        session_ended=session_ended,
        pose_trigger=pose_trigger,
    )


def test_validate_reply_flags_leaks_concessions_and_emptiness() -> None:
    assert validate_reply("", challenging=True) == ["reply is empty"]
    assert validate_reply("According to my rubric you did well.", challenging=False)
    assert validate_reply("You're right, I get it now.", challenging=True)
    # A concession is acceptable when no challenge is being defended.
    assert validate_reply("You're right, that helps.", challenging=False) == []
    assert validate_reply("But why not use a giant learning rate?", challenging=True) == []


def test_validate_reply_flags_pure_questions_only_when_assertion_is_required() -> None:
    question = "Doesn't it always reach the bottom?"
    assert validate_reply(question, challenging=True, must_assert=True)
    assert validate_reply(question, challenging=True) == []
    # A declarative sentence with a trailing tag question still asserts.
    mixed = "It always reaches the bottom. Right?"
    assert validate_reply(mixed, challenging=True, must_assert=True) == []


async def test_pose_prompt_carries_belief_and_plausibility() -> None:
    misconception = gd_rubric().misconceptions[0]
    student = ScriptedStudent(["Run it long enough and it lands at the lowest point, simple."])

    await reply(student, pose=misconception)

    _, task = student.calls[0]
    assert misconception.belief in task
    assert misconception.why_plausible in task


async def test_pose_trigger_anchors_the_directive_to_the_teachers_words() -> None:
    misconception = gd_rubric().misconceptions[1]
    student = ScriptedStudent(
        ["You said it guides the model, so following it must lead straight to the minimum."]
    )

    await reply(student, pose=misconception, pose_trigger="the gradient guides the model")

    _, task = student.calls[0]
    assert '"the gradient guides the model"' in task
    assert "the teacher's own words" in task


async def test_pose_without_trigger_has_no_anchor_directive() -> None:
    misconception = gd_rubric().misconceptions[1]
    student = ScriptedStudent(["Following the gradient takes you straight to the minimum."])

    await reply(student, pose=misconception)

    _, task = student.calls[0]
    assert "the teacher's own words" not in task


async def test_press_prompt_forbids_conceding_and_carries_the_belief() -> None:
    misconception = gd_rubric().misconceptions[0]
    student = ScriptedStudent(["I still don't buy it — it keeps improving until the bottom."])

    await reply(student, press=misconception)

    _, task = student.calls[0]
    assert misconception.belief in task
    assert "Do not concede" in task


async def test_confident_challenge_demands_assertion_and_falls_back_on_questions() -> None:
    """In confident mode a posed challenge must be voiced as a claim; a Student that
    keeps dodging with questions ends up on the (assertion-form) fallback line."""
    misconception = gd_rubric().misconceptions[0]
    student = ScriptedStudent(
        ["Doesn't it always reach the bottom?", "Why would it ever stop early?"]
    )

    text = await reply(student, pose=misconception)

    assert text == misconception.fallback_line
    assert not misconception.fallback_line.rstrip().endswith("?")
    _, task = student.calls[0]
    assert "Do not phrase your reply as a question" in task
    assert "assertion, not only a question" in student.calls[1][1]  # violation was named


async def test_beginner_pose_may_still_ask_a_question() -> None:
    misconception = gd_rubric().misconceptions[0]
    student = ScriptedStudent(["Doesn't it always reach the very bottom eventually?"])

    text = await reply(student, pose=misconception, mode=Mode.beginner)

    assert text == "Doesn't it always reach the very bottom eventually?"
    assert len(student.calls) == 1  # no retry: the question form is allowed here
    assert "Do not phrase your reply as a question" not in student.calls[0][1]


async def test_teacher_question_adds_the_answer_first_directive() -> None:
    student = ScriptedStudent(["I think the loss just keeps shrinking forever."])

    await reply(student, learner_text="Does that make sense so far?")

    _, task = student.calls[0]
    assert "Answer it from your current beliefs" in task


async def test_statement_from_teacher_adds_no_answer_first_directive() -> None:
    student = ScriptedStudent(["So the loss just keeps shrinking forever, I assume."])

    await reply(student, learner_text="The gradient points uphill, so we step downhill.")

    _, task = student.calls[0]
    assert "Answer it from your current beliefs" not in task


async def test_probe_directive_names_the_topic_and_forbids_answering_it() -> None:
    """The probe prompt carries only the learner-safe focus label — never Judge free
    text — and explicitly forbids the Student from stating the answer itself."""
    student = ScriptedStudent(["So what actually happens to the weights in one step?"])

    await reply(student)

    _, task = student.calls[0]
    assert "The update rule and iteration" in task
    assert "Never state the explanation, formula, or answer yourself" in task
    assert "Judge" not in task


async def test_conceding_reply_is_retried_then_replaced_by_fallback_line() -> None:
    misconception = gd_rubric().misconceptions[0]
    student = ScriptedStudent(
        ["You're right, I was wrong about that.", "Oh, I see now — that makes sense now!"]
    )

    text = await reply(student, press=misconception)

    assert text == misconception.fallback_line
    assert len(student.calls) == 2  # one generation + one named-violation retry
    retry_task = student.calls[1][1]
    assert "rejected because" in retry_task  # the retry names the violations


async def test_valid_retry_output_is_used_instead_of_the_fallback() -> None:
    misconception = gd_rubric().misconceptions[0]
    student = ScriptedStudent(
        ["You're right, I was wrong.", "Downhill is downhill — it has to hit the bottom."]
    )

    text = await reply(student, pose=misconception)

    assert text == "Downhill is downhill — it has to hit the bottom."


async def test_provider_exception_degrades_to_the_fallback_line() -> None:
    misconception = gd_rubric().misconceptions[0]
    student = ScriptedStudent([RuntimeError("provider down")])

    text = await reply(student, pose=misconception)

    assert text == misconception.fallback_line


async def test_probe_turn_falls_back_to_a_preauthored_mode_probe() -> None:
    rubric = gd_rubric()
    student = ScriptedStudent([RuntimeError("provider down")])

    text = await reply(student)

    assert text in rubric.probes[Mode.confident]


async def test_opening_falls_back_to_the_first_mode_probe() -> None:
    rubric = gd_rubric()
    student = ScriptedStudent([RuntimeError("provider down")])

    text = await student.opening_question(
        rubric=rubric, concept_title="Gradient Descent", mode=Mode.beginner
    )

    assert text == rubric.probes[Mode.beginner][0]