import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./explorer.css";
import { canonicalDestination } from "./services/canonical";
const destination = canonicalDestination(window.location.href);
if (destination) window.location.replace(destination);
else createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
