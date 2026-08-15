import React from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "../introConfig";

/**
 * Placeholder for the real "Select Concept" screen. In the actual
 * application, this route renders the knowledge graph of concepts.
 */
export const SelectConceptPage: React.FC = () => {
  return (
    <main className="select-concept-root">
      <h1 className="select-concept-title">Select a Concept</h1>
      <p className="select-concept-hint">
        The knowledge graph of the 15 ML concepts renders here.
      </p>
      <Link className="select-concept-back" to={ROUTES.intro}>
        Back to intro
      </Link>
    </main>
  );
};
