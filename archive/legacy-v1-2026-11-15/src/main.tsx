import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createStore } from "./app/store";
import { App } from "./ui/App";
import "./ui/styles.css";

const container = document.getElementById("root");
if (container) {
  const store = createStore();
  createRoot(container).render(
    <StrictMode>
      <App store={store} />
    </StrictMode>
  );
}
