"""Curriculum contract schemas: `Concept`, `PrerequisiteEdge`, `Curriculum`."""

from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

ConceptId = Annotated[
    str,
    StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$"),
    Field(description="Stable, URL-safe concept identifier (e.g. `gradient-descent`)."),
]


class ConceptRef(BaseModel):
    id: ConceptId
    title: str


class Concept(BaseModel):
    id: ConceptId
    title: str
    summary: str = Field(
        description="Short learner-facing description. Never contains rubric content."
    )


class PrerequisiteEdge(BaseModel):
    from_: ConceptId = Field(alias="from")
    to: ConceptId

    model_config = {"populate_by_name": True}


class Curriculum(BaseModel):
    concepts: list[Concept] = Field(min_length=15, max_length=15)
    edges: list[PrerequisiteEdge] = Field(
        description="Directed prerequisite recommendations. Acyclic; never locks a node."
    )
