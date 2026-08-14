# Professor for a Day

Professor for a Day lets a learner test their understanding by teaching an intentionally
imperfect AI Student. This glossary names the learning concepts shared by the product,
curriculum, and teaching-session contract.

## Language

**Concept**:
One curated machine-learning topic that a learner can teach and master.
_Avoid_: Topic, lesson

**Concept Catalog**:
The fixed collection of Concepts and their directed prerequisite relationships.
_Avoid_: Course catalog, generated curriculum

**Knowledge Graph**:
The learner-facing representation of the Concept Catalog and the learner's Mastery values.
_Avoid_: Cognitive model, graph database

**Concept Rubric**:
The hidden, pre-authored mastery standard for one Concept, consisting of required learning
points, common misconceptions, and suggested probes.
_Avoid_: Score prompt, generated rubric

**Teaching Session**:
One attempt by a learner to teach one Concept to one AI Student mode.
_Avoid_: Conversation, chat session

**Teaching Turn**:
The unit beginning with one learner submission and ending after its Judge evaluation and the
AI Student's next reply. The opening AI Student question is not a Teaching Turn.
_Avoid_: Message, chat turn

**AI Student**:
The learner-visible conversational role that asks questions and presents plausible
misunderstandings.
_Avoid_: Tutor, Judge

**Judge**:
The hidden evaluation role that compares the learner's explanation with the Concept Rubric.
_Avoid_: AI Student, grader persona

**Session Progress**:
The non-decreasing rubric coverage demonstrated during one Teaching Session.
_Avoid_: Mastery, message score

**Mastery**:
The learner's highest retained Session Progress for a Concept across Teaching Sessions.
_Avoid_: Session Progress, current score

**Teacher Report**:
The evidence-based summary produced whenever a Teaching Session ends.
_Avoid_: Judge response, transcript
