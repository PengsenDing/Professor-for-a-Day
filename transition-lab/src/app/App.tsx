import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ROUTES } from "../introConfig";
import { IntroPage } from "./IntroPage";
import { SelectConceptPage } from "./SelectConceptPage";

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROUTES.intro} element={<IntroPage />} />
        <Route path={ROUTES.selectConcept} element={<SelectConceptPage />} />
      </Routes>
    </BrowserRouter>
  );
};
