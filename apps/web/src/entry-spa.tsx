import { render } from "@solidjs/web";
import { RouterProvider } from "@tanstack/solid-router";
import { router } from "./router";
import "./app.css";
import "./design-system.css";
// Importing the store creates it and starts the effect that mirrors the
// persisted a11y settings onto <html data-*> for the whole app.
import "./lib/a11y/store";

render(() => <RouterProvider router={router} />, document.getElementById("app")!);
