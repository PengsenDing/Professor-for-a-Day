"""Teacher Report evidence tests (AC-END-12).

The report cites why each confirmed point was scored. A quote appears only when
the Judge's recorded evidence is a verbatim substring of that turn's learner
submission — the learner's own words, never Judge or rubric text.
"""

from app.schemas import TeacherReport
from app.services.evaluation import DemonstratedPoint, JudgeEvaluation
from tests.fakes import make_evaluation
from tests.test_session_flow import gd_rubric, start, submit


def evaluation_demonstrating(points: dict[str, str], **kwargs) -> JudgeEvaluation:
    """A Judge evaluation confirming `points` with per-point evidence text."""
    return JudgeEvaluation(
        newly_demonstrated_points=[
            DemonstratedPoint(point_id=point_id, evidence=evidence)
            for point_id, evidence in points.items()
        ],
        corrected_misconceptions=kwargs.get("corrected", []),
        unresolved_misconceptions=[],
        newly_introduced_misconceptions=[],
        recommended_next_probe="Probe the next idea.",
    )


def test_finish_report_cites_verbatim_learner_quotes(harness) -> None:
    session = start(harness)
    point = gd_rubric().points[0]
    learner_text = (
        "Gradient descent computes the gradient of the loss and steps against it."
    )
    harness.judge.queue(
        evaluation_demonstrating({point.id: "computes the gradient of the loss"})
    )
    submit(harness, session["session_id"], text=learner_text)

    report = harness.client.post(
        f"/api/sessions/{session['session_id']}/finish"
    ).json()["report"]

    assert report["evidence"] == [
        {
            "point": {"id": point.id, "label": point.label},
            "quote": "computes the gradient of the loss",
            "turn_number": 1,
        }
    ]
    # Learner-safety: the quote is the learner's own words.
    assert report["evidence"][0]["quote"] in learner_text


def test_non_verbatim_evidence_withholds_the_quote(harness) -> None:
    session = start(harness)
    point = gd_rubric().points[0]
    harness.judge.queue(
        evaluation_demonstrating(
            {point.id: "The learner paraphrased the loss-gradient relationship."}
        )
    )
    submit(harness, session["session_id"], text="Loss goes down along negative slope.")

    report = harness.client.post(
        f"/api/sessions/{session['session_id']}/finish"
    ).json()["report"]

    assert len(report["evidence"]) == 1
    assert report["evidence"][0]["point"]["id"] == point.id
    assert report["evidence"][0]["quote"] is None
    # The Judge's own wording never reaches the report.
    assert "paraphrased" not in str(report)


def test_mastery_report_collects_evidence_across_turns_in_rubric_order(harness) -> None:
    session = start(harness)
    rubric = gd_rubric()
    first_batch = {p.id: f"about {p.id}" for p in rubric.points[:3]}
    second_batch = {p.id: f"about {p.id}" for p in rubric.points[3:]}
    turn1_text = "I explain " + ", ".join(first_batch.values()) + "."
    turn2_text = "Now " + ", ".join(second_batch.values()) + " and the fix."

    harness.judge.queue(evaluation_demonstrating(first_batch))
    envelope1 = submit(harness, session["session_id"], text=turn1_text).json()
    posed = envelope1["active_misconception"]["id"]

    harness.judge.queue(
        evaluation_demonstrating(second_batch, corrected=[posed])
    )
    envelope2 = submit(harness, session["session_id"], text=turn2_text).json()

    assert envelope2["status"] == "ended"
    assert envelope2["end_reason"] == "mastery"
    evidence = envelope2["report"]["evidence"]
    # One entry per rubric point, in rubric order, each citing its turn.
    assert [e["point"]["id"] for e in evidence] == [p.id for p in rubric.points]
    assert [e["turn_number"] for e in evidence] == [1, 1, 1, 2, 2]
    for entry in evidence:
        source_text = turn1_text if entry["turn_number"] == 1 else turn2_text
        assert entry["quote"] in source_text


def test_unconfirmed_points_never_appear_in_evidence(harness) -> None:
    session = start(harness)
    point = gd_rubric().points[0]
    # The fake default evaluation confirms nothing.
    harness.judge.queue(make_evaluation())
    submit(harness, session["session_id"])

    report = harness.client.post(
        f"/api/sessions/{session['session_id']}/finish"
    ).json()["report"]

    assert report["evidence"] == []
    assert point.label not in str(report["evidence"])


def test_reports_stored_before_the_evidence_field_still_validate() -> None:
    legacy = {
        "final_percent": 60,
        "explained_well": ["Defined the gradient."],
        "misconceptions_corrected": [],
        "gaps_and_accidental_implications": [],
        "improvement_suggestion": "Add a worked example.",
        "recommended_next_concept": {"id": "learning-rate", "title": "Learning Rate"},
        "mastery_achieved": False,
    }
    report = TeacherReport.model_validate(legacy)
    assert report.evidence == []
