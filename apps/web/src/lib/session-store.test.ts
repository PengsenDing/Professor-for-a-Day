import { describe, expect, it } from "vitest";
import { sessionFromSnapshot } from "./session-store";
import type { SessionSnapshot } from "./types";

const SNAPSHOT: SessionSnapshot = {
  session_id: "66bcd1f2a9c4e35d8f01a2b3",
  concept: { id: "gradient-descent", title: "Gradient Descent" },
  mode: "confident",
  opening_text: "Gradient descent is just random guessing, right?",
  turns: [
    {
      turn_number: 1,
      learner_transcript: "No — it computes the gradient and steps against it.",
      input_mode: "voice",
      student_text: "But the biggest step must be fastest, no?",
      newly_covered_points: [
        { id: "gd-1", label: "Uses the gradient of the loss" },
        { id: "gd-2", label: "Steps opposite the gradient direction" },
      ],
    },
    {
      turn_number: 2,
      learner_transcript: "Too big a step overshoots and can diverge.",
      input_mode: "text",
      student_text: "Ah, overshooting. What controls the step size then?",
      newly_covered_points: [
        // gd-2 repeated: the client-side accumulation must dedupe by id.
        { id: "gd-2", label: "Steps opposite the gradient direction" },
        { id: "gd-3", label: "Learning rate controls the step size" },
      ],
    },
  ],
  progress: { percent: 75 },
  active_misconception: null,
  learner_turn_count: 2,
  turns_remaining: 6,
  status: "active",
  end_reason: null,
  report: null,
  created_at: "2026-08-15T09:30:00Z",
};

describe("sessionFromSnapshot", () => {
  it("rebuilds the conversation in order with speech turn numbers", () => {
    const session = sessionFromSnapshot(SNAPSHOT);

    expect(session.messages.map((m) => m.role)).toEqual([
      "student",
      "learner",
      "student",
      "learner",
      "student",
    ]);
    // Student messages carry the turn number used by the speech endpoint.
    expect(session.messages[0]).toMatchObject({
      text: SNAPSHOT.opening_text,
      turn_number: 0,
    });
    expect(session.messages[2].turn_number).toBe(1);
    expect(session.messages[4].turn_number).toBe(2);
    // Learner messages keep their transcript and input mode.
    expect(session.messages[1]).toMatchObject({
      text: SNAPSHOT.turns[0].learner_transcript,
      input_mode: "voice",
    });
    expect(session.messages[3].input_mode).toBe("text");
  });

  it("accumulates covered points across turns without duplicates", () => {
    const session = sessionFromSnapshot(SNAPSHOT);
    expect(session.covered_points.map((p) => p.id)).toEqual([
      "gd-1",
      "gd-2",
      "gd-3",
    ]);
  });

  it("carries session-level state through unchanged", () => {
    const session = sessionFromSnapshot(SNAPSHOT);
    expect(session).toMatchObject({
      session_id: SNAPSHOT.session_id,
      concept: SNAPSHOT.concept,
      mode: "confident",
      progress: { percent: 75 },
      learner_turn_count: 2,
      turns_remaining: 6,
      status: "active",
      end_reason: null,
      active_misconception: null,
      report: null,
      created_at: "2026-08-15T09:30:00Z",
    });
  });

  it("preserves an ended session's report and end reason", () => {
    const ended = sessionFromSnapshot({
      ...SNAPSHOT,
      status: "ended",
      end_reason: "learner_finished",
      report: {
        final_percent: 75,
        explained_well: ["Explained the gradient."],
        misconceptions_corrected: [],
        gaps_and_accidental_implications: [],
        improvement_suggestion: "Add a worked example.",
        recommended_next_concept: { id: "learning-rate", title: "Learning Rate" },
        mastery_achieved: false,
      },
    });
    expect(ended.status).toBe("ended");
    expect(ended.end_reason).toBe("learner_finished");
    expect(ended.report?.final_percent).toBe(75);
  });
});
