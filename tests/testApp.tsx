import "fake-indexeddb/auto";
import {
	fireEvent,
	render,
	screen,
	waitForElementToBeRemoved,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { _resetDb } from "../src/services/appStorage";

// jsdom decodes no images, so imports get their ImageFile from this stub.
const images = vi.hoisted(() => ({ createImageFile: vi.fn() }));
vi.mock("../src/utils/imageUtils", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/utils/imageUtils")>()),
	createImageFile: images.createImageFile,
}));

beforeEach(async () => {
	localStorage.clear();
	await _resetDb();
	indexedDB.deleteDatabase("ichigo-annotate");
});

describe("App", () => {
	it("renders sidebar with Files header", () => {
		render(<App />);
		expect(screen.getByText("Files (0/0)")).toBeInTheDocument();
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

describe("App storage", () => {
	it("covers the app until the saved files have loaded", async () => {
		// Act
		render(<App />);

		// Assert
		expect(screen.getByTestId("storage-overlay")).toBeInTheDocument();
		await waitForElementToBeRemoved(() => screen.queryByTestId("storage-overlay"));
	});
});

describe("App import", () => {
	const png = (name: string) => new File(["png"], name, { type: "image/png" });

	// Render the app, wait for it to load, and import `files`.
	async function renderAndImport(files: File[], replace = false) {
		render(<App />);
		await waitForElementToBeRemoved(() => screen.queryByTestId("storage-overlay"));
		await importAgain(files, replace);
	}

	async function importAgain(files: File[], replace = false) {
		fireEvent.click(screen.getByTestId("import-btn"));
		if (replace) fireEvent.click(screen.getByTestId("replace-checkbox"));
		fireEvent.change(screen.getByTestId("file-input"), { target: { files } });
		fireEvent.click(screen.getByTestId("import-done"));
	}

	beforeEach(() => {
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
		images.createImageFile.mockImplementation(async (file: File) => {
			if (file.name.startsWith("broken")) throw new Error("Failed to load image");
			return {
				id: file.name,
				name: file.name,
				image: file,
				width: 10,
				height: 10,
				thumbnailDataUrl: "",
				annotations: [],
			};
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("skips images that can't be read and names them", async () => {
		// Act
		await renderAndImport([png("good.png"), png("broken.png")]);

		// Assert
		expect(
			await screen.findByText("Skipped 1 unreadable image: broken.png"),
		).toBeInTheDocument();
		expect(screen.getByText("good.png")).toBeInTheDocument();
		expect(screen.getByText("Files (0/1)")).toBeInTheDocument();
	});

	it("keeps the current files when no image of a replacing import can be read", async () => {
		// Arrange
		await renderAndImport([png("good.png")]);
		await screen.findByText("good.png");

		// Act
		await importAgain([png("broken-1.png"), png("broken-2.png")], true);

		// Assert
		expect(
			await screen.findByText(
				"Skipped 2 unreadable images: broken-1.png, broken-2.png",
			),
		).toBeInTheDocument();
		expect(screen.getByText("good.png")).toBeInTheDocument();
	});
});
