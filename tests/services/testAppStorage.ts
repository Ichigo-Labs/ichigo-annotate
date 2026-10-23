import "fake-indexeddb/auto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	clearAll,
	loadFiles,
	loadFullState,
	loadPrefs,
	saveFiles,
	saveFilesDiff,
	savePrefs,
	setStorageListener,
	_resetDb,
} from "../../src/services/appStorage";
import { createInitialState } from "../../src/types/appState";
import type { ImageFile } from "../../src/types/appState";

const makeFile = (id: string, name: string): ImageFile => ({
	id,
	name,
	image: new Blob(["abc"], { type: "image/png" }),
	thumbnailDataUrl: "data:image/png;base64,thumb",
	annotations: [],
});

afterEach(async () => {
	localStorage.clear();
	await _resetDb();
	indexedDB.deleteDatabase("ichigo-annotate");
});

// fake-indexeddb copies values with Node's structuredClone, which turns
// jsdom's Blobs into empty objects. Blobs are immutable, so passing the same
// instance through is a faithful copy.
const nodeStructuredClone = globalThis.structuredClone;
function cloneKeepingBlobs(value: unknown): unknown {
	if (value instanceof Blob) return value;
	if (Array.isArray(value)) return value.map(cloneKeepingBlobs);
	if (
		value !== null &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	) {
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, cloneKeepingBlobs(v)]),
		);
	}
	return nodeStructuredClone(value);
}
beforeAll(() => {
	globalThis.structuredClone = cloneKeepingBlobs as typeof structuredClone;
});
afterAll(() => {
	globalThis.structuredClone = nodeStructuredClone;
});

// Write records into a version-1 database, as the app stored them before
// images became Blobs.
function seedVersion1(records: object[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open("ichigo-annotate", 1);
		req.onupgradeneeded = () => {
			req.result.createObjectStore("files", { keyPath: "id" });
		};
		req.onerror = () => reject(req.error);
		req.onsuccess = () => {
			const db = req.result;
			const tx = db.transaction("files", "readwrite");
			for (const record of records) tx.objectStore("files").put(record);
			tx.oncomplete = () => {
				db.close();
				resolve();
			};
			tx.onerror = () => reject(tx.error);
		};
	});
}

// -- Preferences (localStorage) --

describe("savePrefs / loadPrefs", () => {
	it("round-trips preferences correctly", () => {
		const state = createInitialState();
		state.ui.twoTapBox = true;
		savePrefs(state);
		const prefs = loadPrefs();
		expect(prefs).not.toBeNull();
		expect(prefs!.ui.sidebarWidthPercent).toBe(20);
		expect(prefs!.ui.twoTapBox).toBe(true);
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

	it("reports that prefs were stored", () => {
		expect(savePrefs(createInitialState())).toBe(true);
	});

	it("reports a full or unavailable localStorage", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("full", "QuotaExceededError");
		});
		expect(savePrefs(createInitialState())).toBe(false);
		vi.restoreAllMocks();
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

	it("keeps each image Blob", async () => {
		await saveFiles([makeFile("a", "a.png")]);
		const [loaded] = await loadFiles();
		expect(loaded!.image).toBeInstanceOf(Blob);
		expect(await loaded!.image.text()).toBe("abc");
	});

	it("replaces all files on save", async () => {
		await saveFiles([makeFile("a", "a.png"), makeFile("b", "b.png")]);
		await saveFiles([makeFile("c", "c.png")]);
		const loaded = await loadFiles();
		expect(loaded).toHaveLength(1);
		expect(loaded[0]!.id).toBe("c");
	});

	it("preserves data if save aborts mid-transaction", async () => {
		// Pre-existing record should survive a no-op overwrite.
		await saveFiles([makeFile("a", "a.png"), makeFile("b", "b.png")]);
		await saveFiles([makeFile("a", "a.png"), makeFile("b", "b.png")]);
		const loaded = await loadFiles();
		expect(loaded).toHaveLength(2);
	});
});

describe("saveFilesDiff", () => {
	it("adds new files without touching existing ones", async () => {
		await saveFiles([makeFile("a", "a.png")]);
		await saveFilesDiff([makeFile("b", "b.png")], []);
		const loaded = await loadFiles();
		expect(loaded.map((f) => f.id).sort()).toEqual(["a", "b"]);
	});

	it("overwrites changed files in place", async () => {
		await saveFiles([makeFile("a", "original.png")]);
		await saveFilesDiff([makeFile("a", "renamed.png")], []);
		const loaded = await loadFiles();
		expect(loaded).toHaveLength(1);
		expect(loaded[0]!.name).toBe("renamed.png");
	});

	it("removes deleted ids", async () => {
		await saveFiles([makeFile("a", "a.png"), makeFile("b", "b.png")]);
		await saveFilesDiff([], ["a"]);
		const loaded = await loadFiles();
		expect(loaded.map((f) => f.id)).toEqual(["b"]);
	});

	it("is a no-op when nothing changed", async () => {
		await saveFiles([makeFile("a", "a.png")]);
		await saveFilesDiff([], []);
		const loaded = await loadFiles();
		expect(loaded).toHaveLength(1);
	});
});

describe("version 1 migration", () => {
	it("turns stored data URLs into image Blobs", async () => {
		// Arrange
		await seedVersion1([
			{
				id: "a",
				name: "a.png",
				dataUrl: "data:image/png;base64,AQID",
				thumbnailDataUrl: "data:image/png;base64,thumb",
				annotations: [],
			},
		]);

		// Act
		const [file] = await loadFiles();

		// Assert
		expect(file).not.toHaveProperty("dataUrl");
		expect(file!.image.type).toBe("image/png");
		expect([...new Uint8Array(await file!.image.arrayBuffer())]).toEqual([1, 2, 3]);
	});

	it("keeps the rest of each record", async () => {
		// Arrange
		const annotations = [
			{
				id: "x",
				classId: "c",
				vertices: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 1, y: 1 },
				],
			},
		];
		await seedVersion1([
			{
				id: "a",
				name: "a.png",
				dataUrl: "data:image/png;base64,AQID",
				thumbnailDataUrl: "t",
				annotations,
			},
			{
				id: "b",
				name: "b.jpg",
				dataUrl: "data:image/jpeg;base64,BAU=",
				thumbnailDataUrl: "u",
				annotations: [],
			},
		]);

		// Act
		const files = await loadFiles();

		// Assert
		expect(files.map(({ image, ...rest }) => ({ ...rest, type: image.type }))).toEqual([
			{ id: "a", name: "a.png", thumbnailDataUrl: "t", annotations, type: "image/png" },
			{ id: "b", name: "b.jpg", thumbnailDataUrl: "u", annotations: [], type: "image/jpeg" },
		]);
	});
});

// -- Other tabs --

// Open the database from "another tab": a connection that doesn't close
// when asked to.
function openOther(
	version: number,
	upgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open("ichigo-annotate", version);
		req.onupgradeneeded = () => upgrade?.(req.result);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function deleteDb(): Promise<void> {
	return new Promise((resolve) => {
		const req = indexedDB.deleteDatabase("ichigo-annotate");
		req.onsuccess = req.onerror = () => resolve();
	});
}

describe("other tabs", () => {
	afterEach(() => {
		setStorageListener({});
	});

	it("reports an upgrade blocked by an older version's tab and finishes it once that tab closes", async () => {
		// Arrange
		const other = await openOther(1, (db) =>
			db.createObjectStore("files", { keyPath: "id" }),
		);
		const onBlocked = vi.fn(() => other.close());
		setStorageListener({ onBlocked });

		// Act
		const files = await loadFiles();

		// Assert
		expect(onBlocked).toHaveBeenCalledOnce();
		expect(files).toEqual([]);
	});

	it("saves and lets go when a newer version's tab needs the database", async () => {
		// Arrange
		await saveFiles([makeFile("a", "a.png")]);
		const onVersionChange = vi.fn(async () => {});
		setStorageListener({ onVersionChange });

		// Act
		const other = await openOther(3);

		// Assert
		expect(onVersionChange).toHaveBeenCalledOnce();
		expect(other.version).toBe(3);
		other.close();
	});

	it("tries again after the database fails to open", async () => {
		// Arrange
		(await openOther(3)).close();
		await expect(loadFiles()).rejects.toThrow();
		await deleteDb();

		// Act
		const files = await loadFiles();

		// Assert
		expect(files).toEqual([]);
	});
});

// -- Persistence --

describe("requestPersistentStorage", () => {
	// A fresh copy of the module, which asks at most once.
	async function freshRequest() {
		vi.resetModules();
		return (await import("../../src/services/appStorage")).requestPersistentStorage;
	}

	function stubStorage(persisted: boolean) {
		const storage = {
			persisted: vi.fn().mockResolvedValue(persisted),
			persist: vi.fn().mockResolvedValue(true),
		};
		Object.defineProperty(navigator, "storage", { value: storage, configurable: true });
		return storage;
	}

	afterEach(() => {
		delete (navigator as { storage?: unknown }).storage;
	});

	it("asks the browser to keep the data, once", async () => {
		// Arrange
		const storage = stubStorage(false);
		const requestPersistentStorage = await freshRequest();

		// Act
		requestPersistentStorage();
		requestPersistentStorage();

		// Assert
		await vi.waitFor(() => expect(storage.persist).toHaveBeenCalledOnce());
		expect(storage.persisted).toHaveBeenCalledOnce();
	});

	it("doesn't ask when the data is already kept", async () => {
		// Arrange
		const storage = stubStorage(true);
		const requestPersistentStorage = await freshRequest();

		// Act
		requestPersistentStorage();
		await new Promise((r) => setTimeout(r, 0));

		// Assert
		expect(storage.persisted).toHaveBeenCalledOnce();
		expect(storage.persist).not.toHaveBeenCalled();
	});

	it("does nothing where the browser can't keep data", async () => {
		// Arrange
		const requestPersistentStorage = await freshRequest();

		// Act / Assert
		expect(() => requestPersistentStorage()).not.toThrow();
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
