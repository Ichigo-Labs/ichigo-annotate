import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
	clearAll,
	loadFiles,
	loadFullState,
	loadPrefs,
	saveFiles,
	savePrefs,
	_resetDb,
} from "../../src/services/appStorage";
import { createInitialState } from "../../src/types/appState";
import type { ImageFile } from "../../src/types/appState";

const makeFile = (id: string, name: string): ImageFile => ({
	id,
	name,
	dataUrl: "data:image/png;base64,abc",
	thumbnailDataUrl: "data:image/png;base64,thumb",
	annotations: [],
});

afterEach(async () => {
	localStorage.clear();
	await _resetDb();
	indexedDB.deleteDatabase("ichigo-annotate");
});

// -- Preferences (localStorage) --

describe("savePrefs / loadPrefs", () => {
	it("round-trips preferences correctly", () => {
		const state = createInitialState();
		savePrefs(state);
		const prefs = loadPrefs();
		expect(prefs).not.toBeNull();
		expect(prefs!.ui.sidebarWidthPercent).toBe(20);
		expect(prefs!.general.exportFormat).toBe("yolo");
		expect(prefs!.general.classes).toHaveLength(1);
	});

	it("returns null when nothing stored", () => {
		expect(loadPrefs()).toBeNull();
	});

	it("returns null when stored data is corrupt", () => {
		localStorage.setItem("ichigo-annotate-prefs", "{bad json");
		expect(loadPrefs()).toBeNull();
	});
});

// -- Files (IndexedDB) --

describe("saveFiles / loadFiles", () => {
	it("round-trips files correctly", async () => {
		const files = [makeFile("a", "a.png"), makeFile("b", "b.png")];
		await saveFiles(files);
		const loaded = await loadFiles();
		expect(loaded).toHaveLength(2);
		expect(loaded.map((f) => f.id).sort()).toEqual(["a", "b"]);
	});

	it("returns empty array when nothing stored", async () => {
		const loaded = await loadFiles();
		expect(loaded).toEqual([]);
	});

	it("replaces all files on save", async () => {
		await saveFiles([makeFile("a", "a.png"), makeFile("b", "b.png")]);
		await saveFiles([makeFile("c", "c.png")]);
		const loaded = await loadFiles();
		expect(loaded).toHaveLength(1);
		expect(loaded[0]!.id).toBe("c");
	});
});

// -- Combined --

describe("loadFullState", () => {
	it("combines prefs and files into AppState", async () => {
		const state = createInitialState();
		state.ui.sidebarWidthPercent = 30;
		savePrefs(state);
		await saveFiles([makeFile("f1", "img.png")]);

		const loaded = await loadFullState();
		expect(loaded.ui.sidebarWidthPercent).toBe(30);
		expect(loaded.general.files).toHaveLength(1);
		expect(loaded.general.files[0]!.name).toBe("img.png");
	});

	it("returns defaults when nothing stored", async () => {
		const loaded = await loadFullState();
		expect(loaded.ui.sidebarWidthPercent).toBe(20);
		expect(loaded.general.files).toEqual([]);
	});
});

describe("clearAll", () => {
	it("removes prefs and files", async () => {
		savePrefs(createInitialState());
		await saveFiles([makeFile("a", "a.png")]);

		await clearAll();

		expect(loadPrefs()).toBeNull();
		const files = await loadFiles();
		expect(files).toEqual([]);
	});
});
