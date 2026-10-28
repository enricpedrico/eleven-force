import "@fontsource/press-start-2p/400.css";
import "@fontsource-variable/nunito-sans";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import "./styles.css";
import "./product.css";

createRoot(document.getElementById("root")!).render(<StrictMode><I18nProvider><App /></I18nProvider></StrictMode>);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
