import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import OpeningExperience from "./components/OpeningExperience";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./explorer.css";
import { canonicalDestination } from "./services/canonical";
const destination = canonicalDestination(window.location.href);
if (!destination && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Normal browsing remains available if installation is unsupported.
    });
  });
}
class StartupBoundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section style={{ padding: 32, maxWidth: 600, margin: "40px auto" }}>
        <h1>Campus Navigator couldn’t start</h1>
        <p>Please reload the page to get the latest version.</p>
        <button onClick={() => location.reload()}>Reload campus map</button>
      </section>
    ) : (
      this.props.children
    );
  }
}
function OpenMainSite({ url }: { url: string }) {
  React.useEffect(() => {
    try {
      window.location.replace(url);
    } catch {
      /* The visible link works when automatic navigation is restricted. */
    }
  }, [url]);
  return (
    <section style={{ padding: 32, maxWidth: 600, margin: "40px auto" }}>
      <h1>Opening Campus Navigator…</h1>
      <p>If this page does not continue automatically, use the link below.</p>
      <a href={url} target="_top">
        Open the campus map
      </a>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StartupBoundary>
      {destination ? (
        <OpenMainSite url={destination} />
      ) : (
        <OpeningExperience>
          <App />
        </OpeningExperience>
      )}
    </StartupBoundary>
  </React.StrictMode>,
);
