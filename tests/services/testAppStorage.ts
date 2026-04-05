import { afterEach, describe, expect, it } from "vitest";
import {
	clearState,
	loadState,
	saveState,
} from "../../src/services/appStorage";
import { createInitialState } from "../../src/types/appState";

afterEach(() => {
	localStorage.clear();
});

describe("saveState / loadState", () => {
	it("round-trips state correctly", () => {
		const state = createInitialState();
		saveState(state);
		const loaded = loadState();
		expect(loaded).toEqual(state);
	});

	it("returns null when nothing stored", () => {
		expect(loadState()).toBeNull();
	});

	it("returns null when stored data is corrupt", () => {
		localStorage.setItem("ichigo-annotate-state", "{bad json");
		expect(loadState()).toBeNull();
	});
});

describe("clearState", () => {
	it("removes stored data", () => {
		saveState(createInitialState());
		clearState();
		expect(loadState()).toBeNull();
	});
});
