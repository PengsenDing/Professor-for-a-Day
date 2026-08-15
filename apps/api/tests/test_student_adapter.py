"""StudentAdapter guardrail tests (AC-STU-2..4, AC-STU-6..10).

Overrides the adapter's `_complete` seam with scripted outputs and injects a
scripted critic, so no LangChain model or live provider is involved.
"""

from app.curriculum.rubrics import load_rubrics
from app.schemas import Mode
from app.services.critic import CriterionVerdict, CriticVerdict
from app.services.student import StudentAdapter, StudentReply, validate_reply

GD = "gradient-descent"


def gd_rubric():
    return load_rubrics()[GD]


def clean_verdict(score: float = 0.9) -> CriticVerdict:
    return CriticVerdict(score=score)


def leaky_verdict() -> CriticVerdict:
    return CriticVerdict(
        answer_leakage=CriterionVerdict(
            violated=True, evidence="new parameter equals old minus learning rate times gradient"
        ),
        score=0.2,
    )


class ScriptedCritic:
    """CriticAdapter stand-in with scripted verdicts; records every review."""

    def __init__(self, verdicts: list) -> None:
        self.verdicts = list(verdicts)
        self.calls: list[dict] = []

    async def review(self, *, rubric, directive: str, candidate: str) -> CriticVerdict:
        self.calls.append({"directive": directive, "candidate": candidate})
        assert self.verdicts, "scripted critic ran out of verdicts"
        verdict = self.verdicts.pop(0)
        if isinstance(verdict, Exception):
            raise verdict
        return verdict


class ScriptedStudent(StudentAdapter):
    """StudentAdapter with a scripted provider seam; records every prompt."""

    def __init__(self, outputs: list, critic: ScriptedCritic | None = None) -> None:
        super().__init__(critic=critic)
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
) -> StudentReply:
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

    text = (await reply(student, pose=misconception)).text

    assert text == misconception.fallback_line
    assert not misconception.fallback_line.rstrip().endswith("?")
    _, task = student.calls[0]
    assert "Do not phrase your reply as a question" in task
    assert "assertion, not only a question" in student.calls[1][1]  # violation was named


async def test_beginner_pose_may_still_ask_a_question() -> None:
    misconception = gd_rubric().misconceptions[0]
    student = ScriptedStudent(["Doesn't it always reach the very bottom eventually?"])

    text = (await reply(student, pose=misconception, mode=Mode.beginner)).text

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

    text = (await reply(student, press=misconception)).text

    assert text == misconception.fallback_line
    assert len(student.calls) == 2  # one generation + one named-violation retry
    retry_task = student.calls[1][1]
    assert "rejected because" in retry_task  # the retry names the violations


async def test_valid_retry_output_is_used_instead_of_the_fallback() -> None:
    misconception = gd_rubric().misconceptions[0]
    student = ScriptedStudent(
        ["You're right, I was wrong.", "Downhill is downhill — it has to hit the bottom."]
    )

    text = (await reply(student, pose=misconception)).text

    assert text == "Downhill is downhill — it has to hit the bottom."


async def test_provider_exception_degrades_to_the_fallback_line() -> None:
    misconception = gd_rubric().misconceptions[0]
    student = ScriptedStudent([RuntimeError("provider down")])

    text = (await reply(student, pose=misconception)).text

    assert text == misconception.fallback_line


async def test_probe_turn_falls_back_to_a_preauthored_mode_probe() -> None:
    rubric = gd_rubric()
    student = ScriptedStudent([RuntimeError("provider down")])

    text = (await reply(student)).text

    assert text in rubric.probes[Mode.confident]


async def test_opening_falls_back_to_the_first_mode_probe() -> None:
    rubric = gd_rubric()
    student = ScriptedStudent([RuntimeError("provider down")])

    text = await student.opening_question(
        rubric=rubric, concept_title="Gradient Descent", mode=Mode.beginner
    )

    assert text == rubric.probes[Mode.beginner][0]

# --- Student Critic (AC-STU-7..10) ---


async def test_clean_critic_verdict_is_attached_without_regeneration() -> None:
    critic = ScriptedCritic([clean_verdict(0.9)])
    student = ScriptedStudent(["The gradient just points at the answer, plain and simple."], critic)

    result = await reply(student, pose=gd_rubric().misconceptions[1])

    assert result.text == "The gradient just points at the answer, plain and simple."
    assert result.regenerated is False
    assert result.critic is not None and result.critic.score == 0.9
    assert len(critic.calls) == 1
    assert "Voice this incorrect belief" in critic.calls[0]["directive"]


async def test_leak_verdict_triggers_exactly_one_evidence_fed_regeneration() -> None:
    critic = ScriptedCritic([leaky_verdict()])
    student = ScriptedStudent(
        [
            "So the update is new = old minus learning rate times gradient, and that's that.",
            "Whatever the exact rule is, my big-steps version has to win the race downhill.",
        ],
        critic,
    )

    result = await reply(student, pose=gd_rubric().misconceptions[0])

    assert result.regenerated is True
    assert result.text.startswith("Whatever the exact rule is")
    assert len(critic.calls) == 1  # deliberately no second review of the regeneration
    regen_task = student.calls[1][1]
    assert "leaks the correct answer" in regen_task
    assert "new parameter equals old minus learning rate times gradient" in regen_task


async def test_regenerated_reply_failing_code_checks_lands_on_the_fallback() -> None:
    misconception = gd_rubric().misconceptions[0]
    critic = ScriptedCritic([leaky_verdict()])
    student = ScriptedStudent(
        ["A leaky but code-valid statement about the update rule.", "You're right, I was wrong."],
        critic,
    )

    result = await reply(student, press=misconception)

    assert result.text == misconception.fallback_line
    assert result.regenerated is True


async def test_critic_failure_fails_open_to_the_code_validated_reply() -> None:
    critic = ScriptedCritic([RuntimeError("critic down")])
    student = ScriptedStudent(["Bigger steps always win the race downhill, obviously."], critic)

    result = await reply(student, pose=gd_rubric().misconceptions[0])

    assert result.text == "Bigger steps always win the race downhill, obviously."
    assert result.critic is None  # no verdict recorded, reply accepted as-is


async def test_no_critic_means_no_reviews_and_no_verdict() -> None:
    student = ScriptedStudent(["It has to land at the very lowest point eventually."])

    result = await reply(student, pose=gd_rubric().misconceptions[0])

    assert result.critic is None
    assert result.regenerated is False


async def test_fallback_and_farewell_replies_are_never_reviewed() -> None:
    critic = ScriptedCritic([])  # any review would fail: no scripted verdicts
    misconception = gd_rubric().misconceptions[0]

    fallback_student = ScriptedStudent([RuntimeError("provider down")], critic)
    fallback_result = await reply(fallback_student, pose=misconception)
    assert fallback_result.text == misconception.fallback_line

    farewell_student = ScriptedStudent(["Thanks for everything, teacher!"], critic)
    farewell_result = await reply(farewell_student, session_ended=True)
    assert farewell_result.text == "Thanks for everything, teacher!"

    assert critic.calls == []


async def test_opening_is_never_reviewed() -> None:
    critic = ScriptedCritic([])
    student = ScriptedStudent(["What is a gradient, actually?"], critic)

    text = await student.opening_question(
        rubric=gd_rubric(), concept_title="Gradient Descent", mode=Mode.beginner
    )

    assert text == "What is a gradient, actually?"
    assert critic.calls == []
