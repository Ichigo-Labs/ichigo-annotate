import "fake-indexeddb/auto";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/app";
import { _resetDb } from "../src/services/appStorage";

beforeEach(async () => {
	localStorage.clear();
	await _resetDb();
	indexedDB.deleteDatabase("ichigo-annotate");
});

describe("App", () => {
	it("renders sidebar with Files header", () => {
		render(<App />);
		expect(screen.getByText("Files (0)")).toBeInTheDocument();
	});

	it("renders canvas area with placeholder", () => {
		render(<App />);
		expect(
			screen.getByText("Import images to get started"),
		).toBeInTheDocument();
	});

	it("renders the default-class pill in palette", () => {
		render(<App />);
		expect(screen.getByText("default-class")).toBeInTheDocument();
	});

	it("opens and closes the import modal", () => {
		render(<App />);
		fireEvent.click(screen.getByTestId("import-btn"));
		expect(screen.getByTestId("import-modal")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("import-cancel"));
		expect(screen.queryByTestId("import-modal")).not.toBeInTheDocument();
	});

	it("opens and closes the export modal", () => {
		render(<App />);
		fireEvent.click(screen.getByTestId("export-btn"));
		expect(screen.getByTestId("export-modal")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("export-cancel"));
		expect(screen.queryByTestId("export-modal")).not.toBeInTheDocument();
	});

	it("can add a new annotation class via palette", () => {
		render(<App />);
		fireEvent.click(screen.getByTestId("add-class-btn"));
		const input = screen.getByTestId("new-class-input");
		fireEvent.change(input, { target: { value: "tiger" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(screen.getByText("tiger")).toBeInTheDocument();
	});
});
