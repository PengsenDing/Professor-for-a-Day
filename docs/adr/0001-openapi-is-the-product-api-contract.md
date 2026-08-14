# OpenAPI is the product API contract

The checked-in OpenAPI document is the authoritative agreement between frontend and backend,
so both can develop independently before either implementation is complete. FastAPI must be
verified against that document rather than silently redefining it through generated output;
maintaining two hand-edited contract definitions is explicitly avoided.
