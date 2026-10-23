import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppAction, AppState, ImageFile } from "../../src/types/appState";
import { createInitialState } from "../../src/types/appState";
import type { StorageListener } from "../../src/services/appStorage";

const storage = vi.hoisted(() => ({
	loadFullState: vi.fn(),
	saveFilesDiff: vi.fn(),
	savePrefs: vi.fn(),
	setStorageListener: vi.fn(),
	requestPersistentStorage: vi.fn(),
}));
vi.mock("../../src/services/appStorage", () => storage);

import { useAppReducer } from "../../src/hooks/useAppReducer";

const makeFile = (id: string): ImageFile => ({
	id,
	name: `${id}.png`,
	image: new Blob(),
	thumbnailDataUrl: "",
	annotations: [],
});

function stateWithFiles(files: ImageFile[]): AppState {
	const state = createInitialState();
	return { ...state, general: { ...state.general, files } };
}

// Render the hook and let the saved state (holding `files`) load.
async function renderLoaded(files: ImageFile[] = []) {
	storage.loadFullState.mockResolvedValue(stateWithFiles(files));
	const hook = renderHook(() => useAppReducer());
	await act(async () => {});
	return hook;
}

function listener(): StorageListener {
	return storage.setStorageListener.mock.calls[0]![0] as StorageListener;
}

type Hook = { result: { current: [AppState, React.Dispatch<AppAction>] } };

function dispatchIn(hook: Hook, action: AppAction) {
	act(() => hook.result.current[1](action));
}

const importFiles = (files: ImageFile[]): AppAction => ({
	type: "import_files",
	files,
	replace: false,
});

async function advance(ms: number) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

function beforeUnload(): Event {
	const event = new Event("beforeunload", { cancelable: true });
	window.dispatchEvent(event);
	return event;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.resetAllMocks();
	storage.savePrefs.mockReturnValue(true);
	storage.saveFilesDiff.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("useAppReducer storage", () => {
	it("saves nothing until the saved state has loaded", async () => {
		// Arrange
		storage.loadFullState.mockReturnValue(new Promise(() => {}));
		const hook = renderHook(() => useAppReducer());

		// Act
		dispatchIn(hook, importFiles([makeFile("a")]));
		await advance(10000);

		// Assert
		expect(storage.saveFilesDiff).not.toHaveBeenCalled();
		expect(hook.result.current[0].ui.storageStatus).toBe("loading");
	});

	it("marks the state saved once it has loaded", async () => {
		// Act
		const hook = await renderLoaded([makeFile("a")]);

		// Assert
		expect(hook.result.current[0].ui.storageStatus).toBe("saved");
		expect(hook.result.current[0].general.files).toHaveLength(1);
	});

	it("saves a change shortly after it is made", async () => {
		// Arrange
		const hook = await renderLoaded();
		const file = makeFile("a");

		// Act
		dispatchIn(hook, importFiles([file]));
		await advance(300);

		// Assert
		expect(storage.saveFilesDiff).toHaveBeenCalledWith([file], []);
		expect(storage.requestPersistentStorage).toHaveBeenCalled();
	});

	it("warns about a failed save and retries until it succeeds", async () => {
		// Arrange
		const hook = await renderLoaded();
		const file = makeFile("a");
		storage.saveFilesDiff.mockRejectedValueOnce(
			new DOMException("disk full", "QuotaExceededError"),
		);

		// Act
		dispatchIn(hook, importFiles([file]));
		await advance(300);
		const afterFailure = hook.result.current[0].ui;
		await advance(5000);

		// Assert
		expect(afterFailure.storageStatus).toBe("save_failed");
		expect(afterFailure.storageError).toContain("QuotaExceededError");
		expect(storage.saveFilesDiff).toHaveBeenNthCalledWith(2, [file], []);
		expect(hook.result.current[0].ui.storageStatus).toBe("saved");
	});

	it("writes a failed save's changes with the next save", async () => {
		// Arrange
		const hook = await renderLoaded();
		const [a, b] = [makeFile("a"), makeFile("b")];
		storage.saveFilesDiff.mockRejectedValueOnce(new Error("failed"));
		dispatchIn(hook, importFiles([a]));
		await advance(300);

		// Act
		dispatchIn(hook, importFiles([b]));
		await advance(300);

		// Assert
		expect(storage.saveFilesDiff).toHaveBeenLastCalledWith([a, b], []);
	});

	it("warns when settings can't be stored", async () => {
		// Arrange
		const hook = await renderLoaded();
		storage.savePrefs.mockReturnValue(false);

		// Act
		dispatchIn(hook, { type: "set_search_query", query: "x" });
		await advance(300);

		// Assert
		expect(hook.result.current[0].ui.storageStatus).toBe("save_failed");
		expect(hook.result.current[0].ui.storageError).toContain("Settings");
	});

	it("reports a failed load and then saves nothing", async () => {
		// Arrange
		storage.loadFullState.mockRejectedValue(
			new DOMException("newer version", "VersionError"),
		);
		const hook = renderHook(() => useAppReducer());
		await act(async () => {});

		// Act
		dispatchIn(hook, importFiles([makeFile("a")]));
		await advance(10000);

		// Assert
		expect(hook.result.current[0].ui.storageStatus).toBe("load_failed");
		expect(hook.result.current[0].ui.storageError).toContain("VersionError");
		expect(storage.saveFilesDiff).not.toHaveBeenCalled();
	});

	it("shows when another tab holds the data during an upgrade", () => {
		// Arrange
		storage.loadFullState.mockReturnValue(new Promise(() => {}));
		const hook = renderHook(() => useAppReducer());

		// Act
		act(() => listener().onBlocked!());

		// Assert
		expect(hook.result.current[0].ui.storageStatus).toBe("blocked");
	});

	it("stores the last changes, then stops saving, when another tab takes the data", async () => {
		// Arrange
		const hook = await renderLoaded();
		const a = makeFile("a");
		dispatchIn(hook, importFiles([a]));

		// Act
		await act(() => listener().onVersionChange!());
		dispatchIn(hook, importFiles([makeFile("b")]));
		await advance(10000);

		// Assert
		expect(storage.saveFilesDiff).toHaveBeenCalledOnce();
		expect(storage.saveFilesDiff).toHaveBeenCalledWith([a], []);
		expect(hook.result.current[0].ui.storageStatus).toBe("outdated");
	});

	it("writes every file again after the browser closes the database", async () => {
		// Arrange
		const a = makeFile("a");
		await renderLoaded([a]);

		// Act
		await act(async () => listener().onTerminated!());

		// Assert
		expect(storage.saveFilesDiff).toHaveBeenCalledWith([a], []);
	});

	it("saves pending changes when the app unmounts (e.g. after a render error)", async () => {
		// Arrange
		const hook = await renderLoaded();
		const file = makeFile("a");
		dispatchIn(hook, importFiles([file]));

		// Act
		hook.unmount();
		await act(async () => {});

		// Assert
		expect(storage.saveFilesDiff).toHaveBeenCalledWith([file], []);
	});

	it("asks before the page closes with changes not yet stored", async () => {
		// Arrange
		const hook = await renderLoaded();
		storage.saveFilesDiff.mockReturnValue(new Promise(() => {}));
		dispatchIn(hook, importFiles([makeFile("a")]));

		// Act
		const event = beforeUnload();

		// Assert
		expect(event.defaultPrevented).toBe(true);
	});

	it("lets the page close once everything is stored", async () => {
		// Arrange
		const hook = await renderLoaded();
		dispatchIn(hook, importFiles([makeFile("a")]));
		await advance(300);

		// Act
		const event = beforeUnload();

		// Assert
		expect(event.defaultPrevented).toBe(false);
	});
});
