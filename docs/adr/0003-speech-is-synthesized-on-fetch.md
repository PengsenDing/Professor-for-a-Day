# Speech is synthesized on fetch

AI Student replies carry no audio in their JSON responses. The client fetches
`GET /api/sessions/{session_id}/turns/{turn_number}/speech`, which synthesizes the
stored reply text on demand and streams `audio/mpeg` back. This was chosen over inline
base64 (bloats every envelope with audio the learner may never play) and over a
server-side transient audio cache (in-memory state breaks under multiple workers).
Consequences: a muted learner costs zero synthesis calls; replay re-synthesizes unless
the client caches the blob — the web app is expected to cache; a synthesis failure is an
error on this endpoint only and never touches the session or the text flow.
