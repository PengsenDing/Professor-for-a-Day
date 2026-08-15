"""Deterministic slugs for user-supplied topic titles.

The output always satisfies the `ConceptId` pattern (`^[a-z0-9]+(-[a-z0-9]+)*$`),
so a freeform topic can become a concept id without a second validation path.
"""

import re

_MAX_LENGTH = 60
_FALLBACK = "topic"


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    if len(slug) > _MAX_LENGTH:
        slug = slug[:_MAX_LENGTH].rstrip("-")
    return slug or _FALLBACK
