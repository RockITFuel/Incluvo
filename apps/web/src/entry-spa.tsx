import { RouterProvider } from "@tanstack/solid-router";
import { render } from "solid-js/web";
import { getRouter } from "./router";
import "./app.css";

declare global {
	interface Window {
		__SPA_MODE__?: boolean;
	}
}

// Signal to the root component that we are client-only (no SSR shell).
window.__SPA_MODE__ = true;

const router = getRouter();

render(
	() => <RouterProvider router={router} />,
	document.getElementById("app")!,
);
