"""Provider-neutral service failures.

Adapters raise these; the orchestration/route layer maps them onto the error
envelope. Upstream detail goes to the log, never to the client (AC-ERR-1/3).
"""


class GenerationError(Exception):
    """An LLM role (Judge or AI Student) failed to produce usable output."""


class TranscriptionError(Exception):
    """Speech-to-text failed upstream."""


class SpeechSynthesisError(Exception):
    """Text-to-speech failed upstream."""
