import { initializeTheme, ThemeProvider } from "@blackglass/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./styles.css";

const rootElement = document.querySelector<HTMLDivElement>("#root");
if (!rootElement) throw new Error("Blackglass root element is missing.");

initializeTheme();

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
