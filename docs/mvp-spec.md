# Professor for a Day — Hackathon MVP Specification

Status: agreed product scope, ready for implementation

## Problem Statement

University students can often recognize or repeat a machine-learning definition without being able to explain the concept, distinguish it from neighboring concepts, or correct a plausible misunderstanding. Conventional AI tutors usually answer the learner's questions, which keeps the learner in a passive role and does not reveal weaknesses in the learner's mental model.

The MVP must let a learner test their understanding by teaching an intentionally imperfect AI Student. The AI Student must ask questions, form level-appropriate misunderstandings, and require the learner to repair them. The experience must provide visible, evidence-based progress rather than an arbitrary conversational score.

The current repository provides a FastAPI and LangChain backend, a DeutschlandGPT provider boundary, MongoDB conversation persistence, and tests around the existing API and repository. It does not yet provide the web application, teaching orchestration, structured Judge evaluation, knowledge graph, voice integration, or persistence between the stateless chat route and a teaching session.

## Solution

Build an English-language, single-learner hackathon experience focused on 15 curated machine-learning concepts. The Home screen presents a prerequisite knowledge graph and the learner's best mastery score for each concept. The learner selects any concept and one of three AI Student modes: Beginner, Confident, or Skeptic.

The AI Student starts the session with a question suited to the concept and selected mode. The learner teaches through text or push-to-talk voice input and may switch input mode at any turn. ElevenLabs transcribes voice input. A hidden Judge evaluates each submitted explanation against a stable, pre-authored Concept Rubric. The Judge identifies demonstrated rubric points, corrected or unresolved misconceptions, and the best next probe. A separate AI Student call then produces the next question or misunderstanding. Every AI Student reply remains visible as text and is also spoken through ElevenLabs using one fixed default voice.

The learner sees a non-decreasing session progress bar. A concept reaches 100% only after every required rubric point has been demonstrated and the required misconception challenge has been resolved. At 100%, the interface plays an accomplishment animation. A session also may end when the learner chooses Finish or after eight learner turns. Every ending produces a Teacher Report and updates the browser-local mastery state when the new score exceeds the learner's previous best. Anonymous conversations and Judge evaluations are stored in MongoDB, while raw recordings are discarded after transcription.

## User Stories

1. As a university student, I want to test my understanding of machine learning by teaching, so that I can discover gaps that recognition-based study may hide.
2. As a learner, I want the product to focus only on machine learning, so that the hackathon experience feels coherent and purposeful.
3. As a learner, I want to see a graph of machine-learning concepts, so that I understand how the topics relate.
4. As a learner, I want prerequisite connections to be visible, so that I can choose a sensible learning order.
5. As a learner, I want every concept to remain selectable, so that prerequisites do not block a short demo or a topic I want to practise.
6. As a learner, I want each graph node to show my best mastery level, so that I can see my progress at a glance.
7. As a learner, I want completed concepts to remain accomplished, so that later practice does not erase an achievement.
8. As a learner, I want to repeat a concept, so that I can improve a previous result.
9. As a learner, I want a new attempt to update the graph only when it improves my best score, so that practice cannot reduce my recorded mastery.
10. As a learner, I want to choose the Beginner mode, so that the AI Student asks foundational questions and makes simple mistakes.
11. As a learner, I want to choose the Confident mode, so that I must correct plausible and overconfident misunderstandings.
12. As a learner, I want to choose the Skeptic mode, so that I must defend assumptions, address counterexamples, and explain edge cases.
13. As a learner, I want all three modes to use the same mastery standard, so that scores remain comparable.
14. As a learner, I want the AI Student to ask the first question, so that I have a concrete teaching prompt rather than an empty conversation.
15. As a learner, I want the opening question to reflect the selected mode, so that the difficulty choice has an immediate effect.
16. As a learner, I want to start with text input, so that the core experience works in a quiet or constrained environment.
17. As a learner, I want to opt into voice input, so that I can practise explaining a concept aloud.
18. As a learner, I want push-to-talk voice capture, so that I control exactly when recording begins and ends.
19. As a learner, I want to switch between text and voice at any turn, so that one input choice does not constrain the entire session.
20. As a learner, I want to see and edit a voice transcript before submitting it, so that recognition errors are not judged as knowledge gaps.
21. As a learner, I want text input to remain available when transcription fails, so that a voice-provider problem does not end the session.
22. As a learner, I want every AI Student reply to be spoken, so that voice output is a real part of the MVP rather than an optional demo extra.
23. As a learner, I want the AI Student's words to remain visible while audio plays, so that I can read along or recover from an audio problem.
24. As a learner, I want to mute spoken replies, so that I retain control over playback without disabling the product's TTS capability.
25. As a learner, I want one consistent default AI voice, so that I do not need to configure voices before learning.
26. As a learner, I want the conversation to continue when speech synthesis fails, so that the text interaction remains usable.
27. As a learner, I want an AI Student that reacts to what I actually explained, so that follow-up questions do not feel random.
28. As a learner, I want plausible misconceptions to expose oversimplifications in my explanation, so that I can refine my mental model.
29. As a learner, I want a hidden Judge separate from the AI Student, so that friendly dialogue and consistent evaluation have distinct responsibilities.
30. As a learner, I want the Judge to use a stable rubric, so that the definition of completion does not change between sessions.
31. As a learner, I want progress to reflect demonstrated learning points, so that it is not based merely on message count.
32. As a learner, I want progress to remain non-decreasing during a session, so that the interface rewards confirmed understanding.
33. As a learner, I want unresolved misconceptions to prevent premature completion, so that 100% remains meaningful.
34. As a learner, I want a visible progress bar after every submitted explanation, so that I can see the effect of my teaching.
35. As a learner, I want to see the current misconception, so that I know what misunderstanding I am trying to repair.
36. As a learner, I want to see the current turn count, so that I know how much of the session remains.
37. As a learner, I want a session to finish automatically at 100%, so that successful completion has a clear endpoint.
38. As a learner, I want to finish a session early, so that I can leave without abandoning the result.
39. As a learner, I want sessions limited to eight teaching turns, so that the exercise remains short and predictable.
40. As a learner, I want a Teacher Report even when I stop below 100%, so that an incomplete attempt still gives useful feedback.
41. As a learner, I want the report to show my final percentage, so that the session outcome is clear.
42. As a learner, I want the report to list what I explained well, so that successful parts of my explanation are reinforced.
43. As a learner, I want the report to list misconceptions I corrected, so that I can recognize conceptual repairs.
44. As a learner, I want the report to identify gaps and accidental implications, so that I know where my explanation was misleading.
45. As a learner, I want one concrete improvement suggestion, so that the feedback is actionable.
46. As a learner, I want a recommended next graph concept, so that I know what to teach next.
47. As a learner, I want an accomplishment animation only at genuine 100% completion, so that the celebration feels earned.
48. As a learner, I want my graph to update after the report, so that the learning loop has a visible lasting result.
49. As a learner, I want to use the MVP without creating an account, so that I can begin immediately.
50. As a learner, I want my mastery graph restored after a browser refresh, so that the single-device demo has continuity.
51. As a privacy-conscious learner, I want raw recordings discarded after transcription, so that my voice is not retained unnecessarily.
52. As a project team member, I want anonymous teaching sessions stored in MongoDB, so that we can demonstrate persistent conversation data.
53. As a project team member, I want Judge evaluations stored with the turns they evaluated, so that score changes can be traced to evidence.
54. As a project team member, I want provider credentials to remain on the server, so that secrets are never exposed to the browser.
55. As a demo presenter, I want a reliable Gradient Descent golden path, so that the complete value proposition can be shown in a few minutes.
56. As a demo presenter, I want provider failures to degrade to text where possible, so that a temporary voice failure does not destroy the presentation.

## Implementation Decisions

### Product vocabulary

- A **Concept** is one curated machine-learning topic that can be taught and mastered.
- The **Knowledge Graph** is the fixed set of Concepts and directed prerequisite relationships bundled with the web application.
- A **Concept Rubric** is the hidden, pre-authored set of required learning points, common misconceptions, and suggested probes for one Concept.
- A **Teaching Session** is one attempt to teach one Concept to one AI Student mode.
- A **Teaching Turn** begins with a learner submission and ends after Judge evaluation and the AI Student's next spoken reply. The opening AI Student question is not a learner turn.
- The **AI Student** is the conversational role visible to the learner.
- The **Judge** is a hidden evaluation role that never talks directly to the learner.
- **Session Progress** is the non-decreasing rubric coverage within the current Teaching Session.
- **Mastery** is the highest Session Progress retained locally for a Concept across attempts.

### Curated machine-learning graph

- The MVP contains exactly these 15 selectable Concepts: Dataset; Features and Labels; Model; Training vs. Inference; Supervised Learning; Unsupervised Learning; Neural Networks; Loss Function; Gradient Descent; Learning Rate; Overfitting; Regularization; Train/Validation/Test Split; Confusion Matrix; and Precision vs. Recall.
- The graph and prerequisite edges are local, version-controlled curriculum data. The LLM does not add, delete, or reconnect nodes at runtime.
- Prerequisite edges communicate recommended order but never lock a node.
- Each node has one of three presentation states: Not Attempted at 0%, Developing from 1–99%, or Accomplished at 100%.
- The browser stores the single demo learner's best score per Concept. There is no account, owner record, or cross-device synchronization.
- A new Teaching Session starts its session progress at 0%. At the end, the local Mastery value changes only if the new result is higher than the stored best.

### Concept Rubrics and scoring

- Every Concept has a pre-authored Concept Rubric containing three to five required learning points, common misconceptions, and mode-appropriate probe suggestions.
- The Judge runs after every learner submission and returns structured evaluation data: newly demonstrated points with evidence, corrected misconceptions, unresolved or newly introduced misconceptions, and a recommended next probe.
- The application derives progress from confirmed rubric coverage. The Judge does not invent an unconstrained percentage.
- Confirmed rubric points remain confirmed for the rest of the Teaching Session, making progress monotonic.
- Reaching 100% requires all required learning points and successful resolution of the misconception challenge posed during the session. An unresolved misconception gates completion even if all points have been mentioned.
- Beginner, Confident, and Skeptic change question style and depth but do not change the rubric or scoring standard.

### AI Student and Judge orchestration

- DeutschlandGPT supplies both LLM roles through separate calls. Separate providers or models are not required.
- Starting a Teaching Session loads the selected Concept Rubric and asks the AI Student to produce the first question according to the selected mode.
- After each learner submission, the Judge evaluates the cumulative conversation and current rubric state before the AI Student generates a response.
- The AI Student receives the Judge's recommended target and current unresolved misconception, then generates one concise, in-character follow-up question or plausible misunderstanding.
- The AI Student does not reveal the hidden rubric, Judge reasoning, or the correct answer.
- Beginner asks foundational clarification questions and surfaces simple mistakes.
- Confident has partial understanding and asserts plausible but incorrect conclusions.
- Skeptic challenges causal claims, assumptions, transfer, counterexamples, and edge cases.
- The session ends at 100%, when the learner selects Finish Session, or immediately after the eighth learner turn. Every exit path generates a Teacher Report.

### Hybrid input and mandatory voice output

- Text input is the default. Voice input is an advanced input mode that the learner may select when starting and enable or disable at any later turn.
- Voice input is turn-based push-to-talk rather than a full-duplex real-time conversation.
- ElevenLabs performs speech-to-text. The resulting transcript is visible and editable before it is submitted to the Judge.
- If transcription fails, the product explains the failure without losing the current conversation and leaves text input ready for use.
- Every successful AI Student reply is sent to ElevenLabs text-to-speech with one fixed default voice. Selecting a voice is not part of the MVP.
- AI Student text is rendered before or alongside audio playback and remains visible.
- The learner may mute or replay the current spoken reply. Muting does not remove text-to-speech from the underlying response flow.
- A speech-synthesis failure shows a non-blocking error and leaves the text reply usable for the next turn.
- Raw input recordings and generated audio are transient. They are not stored in MongoDB or browser persistence.
- DeutschlandGPT and ElevenLabs credentials remain server-side and are read from environment configuration.

### Screens and interaction

- The **Knowledge Graph / Home** screen renders the graph, best Mastery values, Concept selection, AI Student mode selection, and initial text-or-voice input choice.
- The **Teaching Session** screen renders the conversation, push-to-talk or text composer, editable unsubmitted transcript, spoken AI Student response, current misconception, progress bar, and learner-turn count.
- The **Teacher Report** screen renders the final percentage, concepts explained well, misconceptions corrected, gaps or accidental implications, one concrete improvement suggestion, and a recommended next Concept.
- At 100%, the product plays an accomplishment animation before or as the Teacher Report appears and marks the Concept Accomplished.
- Below 100%, the product provides encouraging feedback without playing the completion animation or marking the Concept Accomplished.

### Persistence

- MongoDB stores anonymous Teaching Sessions and their ordered turns.
- A stored Teaching Session includes an anonymous session identifier, selected Concept, AI Student mode, lifecycle status, turn count, final score when present, created and updated timestamps, and Teacher Report when present.
- Each stored turn includes the learner transcript, input mode, AI Student text, Judge structured evaluation, resulting progress, and timestamp.
- MongoDB does not store raw audio, generated audio, browser-local graph state, credentials, or hidden provider payloads that are unnecessary for the learning record.
- Teaching orchestration uses the existing repository boundary rather than accessing the MongoDB driver from routes or agents.
- The existing stateless chat behavior is not the Teaching Session contract. The MVP adds a session-oriented API that atomically coordinates evaluation, reply generation, and persistence.

### API behavior

- The web app can fetch the Concept catalog and prerequisite graph without invoking an LLM.
- Starting a Teaching Session accepts a Concept identifier and AI Student mode and returns a session identifier plus the opening AI Student text and speech result.
- Submitting a text turn accepts the session identifier and learner text. Submitting a voice turn first transcribes audio, allows client-side correction, and then uses the same text-turn contract.
- A completed Teaching Turn returns AI Student text, playable speech output, current progress, newly covered points suitable for display, active misconception, turn count, and session status.
- Finishing a Teaching Session returns the Teacher Report and final progress whether completion was automatic, manual, or caused by the turn limit.
- Invalid Concept identifiers, modes, lifecycle transitions, and empty submissions are rejected at the API boundary.
- A retry must not create duplicate persisted turns or double-count progress.
- Provider failures are mapped to safe, provider-neutral errors. Secret values, raw upstream payloads, and internal Judge instructions are never returned to the browser.

### Primary acceptance scenario

- A presenter selects Gradient Descent and one AI Student mode.
- The AI Student asks the first, mode-appropriate question and speaks it using the default ElevenLabs voice.
- The learner answers through voice; ElevenLabs transcribes the answer; the learner reviews and submits the transcript.
- The Judge evaluates the answer, the progress bar advances, and the AI Student speaks a targeted misconception or follow-up.
- The learner corrects the misconception and covers every remaining rubric point within eight turns.
- Progress reaches 100%, the accomplishment animation plays, and the Teacher Report is shown.
- Returning to the Knowledge Graph shows Gradient Descent as Accomplished.
- The anonymous Teaching Session, turns, evaluations, and report can be read back from MongoDB, with no raw audio stored.

## Testing Decisions

- Tests assert externally observable behavior and stable contracts rather than exact prompts, private helper calls, or verbatim model wording.
- The primary automated seam is the session API boundary. A test starts a session, submits learner transcripts, finishes the session, and reads the stored result using fake DeutschlandGPT and ElevenLabs adapters plus a test repository.
- Session API tests verify the opening question, ordered Judge-before-Student loop, structured progress, monotonic coverage, misconception completion gate, eight-turn limit, manual finish, report production, safe provider failures, idempotent retry behavior, and persisted turn evidence.
- Existing FastAPI route tests with dependency overrides are the prior art for exercising HTTP behavior without live infrastructure.
- Existing conversation repository tests are the prior art for validating persistence separately against a real test MongoDB when one is available.
- One browser-level golden-path test covers Knowledge Graph selection, the AI Student's opening question, a typed fallback teaching loop, 100% completion, animation state, Teacher Report, and updated local Mastery.
- Browser tests mock microphone and audio playback behavior; small opt-in smoke tests verify real ElevenLabs transcription and speech synthesis with credentials present.
- A small opt-in DeutschlandGPT smoke test verifies that both AI roles can produce parseable outputs. CI and normal local tests do not depend on live provider availability.
- Contract tests verify that raw audio is not present in persisted Teaching Sessions and that provider keys never appear in frontend responses.
- Manual demo rehearsal uses the Gradient Descent acceptance scenario with both voice and text fallback before presentation.

## Out of Scope

- Accounts, authentication, learner profiles, multiple users, and cross-device progress synchronization.
- Machine-learning topics outside the curated 15-node graph and all non-machine-learning domains.
- LLM-generated graph nodes or prerequisite edges.
- A graph database or server-side storage of the single learner's Mastery graph.
- Hard prerequisite locks.
- Languages other than English.
- Selectable voice types, voice cloning, or custom AI Student voices.
- Real-time full-duplex speech, interruption, wake-word detection, and continuous microphone streaming.
- Persisting raw recordings or generated audio.
- Additional AI Student personalities beyond Beginner, Confident, and Skeptic.
- Easier scoring standards for Beginner or harder scoring standards for Skeptic.
- Sessions longer than eight learner turns.
- Production analytics, educator dashboards, classroom management, social sharing, leaderboards, and achievements beyond the single completion animation.
- Automated rubric authoring or curriculum-management tooling.
- Replacing DeutschlandGPT, ElevenLabs, MongoDB, or the existing FastAPI and LangChain backend during the MVP.

## Further Notes

- The product's distinguishing loop is: **AI asks → learner explains → AI misunderstands → learner repairs → Judge confirms**. It should not be presented as a conventional AI tutor with a reversed chat layout.
- The AI Student's plausible misunderstanding is the core demonstration. Visual polish should support that loop rather than displace implementation of structured evaluation and persistence.
- The Knowledge Graph is a curriculum and progress visualization, not a claim that the system infers a complete cognitive model of the learner.
- Voice output is mandatory MVP behavior. Voice selection is the advanced feature intentionally deferred.
- The Teacher Report should distinguish evidence observed in this session from general encouragement. It must not claim that a learner fully understands a Concept below the rubric-defined 100% threshold.
