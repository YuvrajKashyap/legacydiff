/** Start the React app in the browser and load its styles. Stylesheets load here so Vite resolves each one directly. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./styles/motion.css";
import "./styles/shell.css";
import "./styles/home.css";
import "./styles/workspace.css";
import "./styles/workspace-redesign.css";
import "./styles/investigation.css";
import "./styles/scenarios.css";
import "./styles/scenarios-redesign.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
