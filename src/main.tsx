import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createServices } from "./app/container";

const services = createServices();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => services.dispose());
}
