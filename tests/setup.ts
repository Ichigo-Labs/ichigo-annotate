import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
	cleanup();
});

// jsdom has no pointer capture; finger taps and drags call it.
Element.prototype.setPointerCapture ??= () => {};
