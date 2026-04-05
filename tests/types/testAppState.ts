import { describe, expect, it } from "vitest";
import {
	createInitialState,
	DEFAULT_CLASS,
	SIDEBAR_COLLAPSE_THRESHOLD,
} from "../../src/types/appState";

describe("createInitialState", () => {
	it("returns valid default state", () => {
		const state = createInitialState();

		// UI defaults.
		expect(state.ui.sidebarWidthPercent).toBe(20);
		expect(state.ui.sidebarCollapsed).toBe(false);
		expect(state.ui.searchQuery).toBe("");
		expect(state.ui.selectedFileId).toBeNull();
		expect(state.ui.activeClassId).toBe(DEFAULT_CLASS.id);
		expect(state.ui.activeLassoPoints).toBeNull();
		expect(state.ui.importModalOpen).toBe(false);
		expect(state.ui.exportModalOpen).toBe(false);
		expect(state.ui.toasts).toEqual([]);

		// General defaults.
		expect(state.general.files).toEqual([]);
		expect(state.general.classes).toHaveLength(1);
		expect(state.general.exportFormat).toBe("yolo");
		expect(state.general.lastDeletedFile).toBeNull();
	});

	it("includes the default class with valid fields", () => {
		const state = createInitialState();
		const cls = state.general.classes[0]!;

		expect(cls.id).toBe("default-class");
		expect(cls.name).toBe("default-class");
		expect(cls.color).toMatch(/^#[0-9a-f]{6}$/);
	});
});

describe("SIDEBAR_COLLAPSE_THRESHOLD", () => {
	it("is a positive number", () => {
		expect(SIDEBAR_COLLAPSE_THRESHOLD).toBeGreaterThan(0);
	});
});
