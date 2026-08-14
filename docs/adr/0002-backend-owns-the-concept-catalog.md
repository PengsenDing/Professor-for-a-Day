# The backend owns the Concept Catalog

The backend owns the canonical, version-controlled Concept Catalog and exposes its public
projection to the frontend. This keeps Concept identifiers and prerequisite relationships
aligned with the backend's hidden Concept Rubrics while allowing the frontend to render and
mock the Knowledge Graph without duplicating curriculum ownership.
