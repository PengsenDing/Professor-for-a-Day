"""T20 — repository semantics against a real MongoDB; skips when none is reachable."""

from app.repositories.sessions import SessionRepository


async def test_create_get_append_finish_roundtrip(mongo_database) -> None:
    repository = SessionRepository(mongo_database)
    await repository.ensure_indexes()

    created = await repository.create(
        concept_id="gradient-descent",
        concept_title="Gradient Descent",
        mode="confident",
        student_text="Why steps?",
        graph_id="machine-learning",
    )
    session_id = str(created["_id"])

    fetched = await repository.get(session_id)
    assert fetched is not None
    assert fetched["status"] == "active"
    assert fetched["opening_text"] == "Why steps?"

    turn = {
        "turn_number": 1,
        "client_turn_id": "abc",
        "learner_text": "explanation",
        "input_mode": "text",
        "student_text": "reply",
        "evaluation": {"newly_demonstrated_points": []},
        "progress_percent": 40,
        "newly_covered_points": [],
        "active_misconception": None,
        "status_after": "active",
        "end_reason_after": None,
    }
    appended = await repository.append_turn(
        session_id,
        expected_learner_turn_count=0,
        turn=turn,
        session_fields={"progress_percent": 40, "confirmed_point_ids": ["gd-1", "gd-2"]},
    )
    assert appended is True

    # The same expected count again must not append a duplicate turn (AC-TRN-10).
    duplicate = await repository.append_turn(
        session_id,
        expected_learner_turn_count=0,
        turn=turn,
        session_fields={},
    )
    assert duplicate is False

    stored = await repository.get(session_id)
    assert stored["learner_turn_count"] == 1
    assert len(stored["turns"]) == 1
    assert stored["progress_percent"] == 40  # turn + progress in one write (AC-PER-10)

    finished = await repository.finish(
        session_id,
        end_reason="learner_finished",
        final_percent=40,
        report={"final_percent": 40},
    )
    assert finished["status"] == "ended"

    # Finishing again returns the stored document unchanged (AC-END-4).
    again = await repository.finish(
        session_id,
        end_reason="mastery",
        final_percent=100,
        report={"final_percent": 100},
    )
    assert again["end_reason"] == "learner_finished"
    assert again["final_score"] == 40

    # No turn can be appended to an ended session.
    late = await repository.append_turn(
        session_id, expected_learner_turn_count=1, turn=turn, session_fields={}
    )
    assert late is False


async def test_get_with_malformed_id_returns_none(mongo_database) -> None:
    repository = SessionRepository(mongo_database)
    assert await repository.get("not-an-object-id") is None
