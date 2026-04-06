import { describe, expect, it } from "vitest";
import { appReducer } from "../../src/hooks/useAppReducer";
import type { AppState, ImageFile } from "../../src/types/appState";
import { createInitialState } from "../../src/types/appState";

function stateWith(overrides: {
	ui?: Partial<AppState["ui"]>;
	general?: Partial<AppState["general"]>;
}): AppState {
	const base = createInitialState();
	return {
		ui: { ...base.ui, ...overrides.ui },
		general: { ...base.general, ...overrides.general },
	};
}

const makeFile = (id: string, name: string): ImageFile => ({
	id,
	name,
	dataUrl: "",
	thumbnailDataUrl: "",
	annotations: [],
});

// -- Hydrate --

describe("hydrate", () => {
	it("replaces the entire state", () => {
		const state = createInitialState();
		const hydrated = stateWith({ ui: { sidebarWidthPercent: 42 } });
		const next = appReducer(state, { type: "hydrate", state: hydrated });
		expect(next.ui.sidebarWidthPercent).toBe(42);
		expect(next).toEqual(hydrated);
	});
});

// -- Sidebar --

describe("set_sidebar_width", () => {
	it("updates width percent", () => {
		const state = createInitialState();
		const next = appReducer(state, { type: "set_sidebar_width", widthPercent: 30 });
		expect(next.ui.sidebarWidthPercent).toBe(30);
		expect(next.ui.sidebarCollapsed).toBe(false);
	});

	it("collapses when below threshold", () => {
		const state = createInitialState();
		const next = appReducer(state, { type: "set_sidebar_width", widthPercent: 3 });
		expect(next.ui.sidebarCollapsed).toBe(true);
	});

	it("clamps to [0, 50]", () => {
		const state = createInitialState();
		const next = appReducer(state, { type: "set_sidebar_width", widthPercent: 80 });
		expect(next.ui.sidebarWidthPercent).toBe(50);
	});
});

describe("toggle_sidebar_collapsed", () => {
	it("toggles collapsed state", () => {
		const state = createInitialState();
		const next = appReducer(state, { type: "toggle_sidebar_collapsed" });
		expect(next.ui.sidebarCollapsed).toBe(true);
		const next2 = appReducer(next, { type: "toggle_sidebar_collapsed" });
		expect(next2.ui.sidebarCollapsed).toBe(false);
	});
});

// -- File management --

describe("import_files", () => {
	it("appends files when replace is false", () => {
		const state = stateWith({ general: { files: [makeFile("a", "a.png")] } });
		const next = appReducer(state, {
			type: "import_files",
			files: [makeFile("b", "b.png")],
			replace: false,
		});
		expect(next.general.files).toHaveLength(2);
	});

	it("replaces files when replace is true", () => {
		const state = stateWith({ general: { files: [makeFile("a", "a.png")] } });
		const next = appReducer(state, {
			type: "import_files",
			files: [makeFile("b", "b.png")],
			replace: true,
		});
		expect(next.general.files).toHaveLength(1);
		expect(next.general.files[0]!.id).toBe("b");
	});

	it("selects first imported file", () => {
		const state = createInitialState();
		const next = appReducer(state, {
			type: "import_files",
			files: [makeFile("x", "x.png")],
			replace: false,
		});
		expect(next.ui.selectedFileId).toBe("x");
	});
});

describe("delete_file", () => {
	it("removes file and stores in lastDeletedFile", () => {
		const f = makeFile("a", "a.png");
		const state = stateWith({ general: { files: [f] } });
		const next = appReducer(state, { type: "delete_file", fileId: "a" });
		expect(next.general.files).toHaveLength(0);
		expect(next.general.lastDeletedFile).toEqual(f);
	});

	it("selects next file when deleted file was selected", () => {
		const files = [makeFile("a", "a.png"), makeFile("b", "b.png")];
		const state = stateWith({
			ui: { selectedFileId: "a" },
			general: { files },
		});
		const next = appReducer(state, { type: "delete_file", fileId: "a" });
		expect(next.ui.selectedFileId).toBe("b");
	});
});

describe("undo_delete_file", () => {
	it("restores the last deleted file", () => {
		const f = makeFile("a", "a.png");
		const state = stateWith({ general: { lastDeletedFile: f, files: [] } });
		const next = appReducer(state, { type: "undo_delete_file" });
		expect(next.general.files).toHaveLength(1);
		expect(next.general.lastDeletedFile).toBeNull();
	});

	it("does nothing when no deleted file", () => {
		const state = createInitialState();
		const next = appReducer(state, { type: "undo_delete_file" });
		expect(next).toEqual(state);
	});
});

// -- Classes --

describe("add_class", () => {
	it("adds a new class", () => {
		const state = createInitialState();
		const next = appReducer(state, {
			type: "add_class",
			name: "tiger",
			color: "#ff0000",
		});
		expect(next.general.classes).toHaveLength(2);
		expect(next.general.classes[1]!.name).toBe("tiger");
	});
});

describe("delete_class", () => {
	it("removes the class", () => {
		const state = createInitialState();
		const withTwo = appReducer(state, {
			type: "add_class",
			name: "tiger",
			color: "#ff0000",
		});
		const classId = withTwo.general.classes[1]!.id;
		const next = appReducer(withTwo, { type: "delete_class", classId });
		expect(next.general.classes).toHaveLength(1);
	});

	it("resets active class if deleted class was active", () => {
		const state = createInitialState();
		const withTwo = appReducer(state, {
			type: "add_class",
			name: "tiger",
			color: "#ff0000",
		});
		const classId = withTwo.general.classes[1]!.id;
		const active = appReducer(withTwo, {
			type: "set_active_class",
			classId,
		});
		const next = appReducer(active, { type: "delete_class", classId });
		expect(next.ui.activeClassId).toBe("default-class");
	});
});

// -- Polygonize --

describe("set_polygonize", () => {
	it("enables polygonize", () => {
		const state = createInitialState();
		const next = appReducer(state, { type: "set_polygonize", enabled: true });
		expect(next.general.polygonize).toBe(true);
	});
});

describe("set_polygonize_sides", () => {
	it("sets the number of sides", () => {
		const state = createInitialState();
		const next = appReducer(state, { type: "set_polygonize_sides", sides: 6 });
		expect(next.general.polygonizeSides).toBe(6);
	});

	it("clamps to minimum of 3", () => {
		const state = createInitialState();
		const next = appReducer(state, { type: "set_polygonize_sides", sides: 1 });
		expect(next.general.polygonizeSides).toBe(3);
	});
});

describe("complete_lasso with polygonize", () => {
	it("simplifies annotation vertices when polygonize is enabled", () => {
		// Create a freeform lasso with many points.
		const lassoPoints = Array.from({ length: 20 }, (_, i) => {
			const angle = (i / 20) * Math.PI * 2;
			return { x: 0.5 + 0.3 * Math.cos(angle), y: 0.5 + 0.3 * Math.sin(angle) };
		});
		const f = makeFile("f1", "img.png");
		const state = stateWith({
			ui: { selectedFileId: "f1", activeLassoPoints: lassoPoints },
			general: { files: [f], polygonize: true, polygonizeSides: 4 },
		});
		const next = appReducer(state, { type: "complete_lasso" });
		const ann = next.general.files[0]!.annotations[0]!;
		expect(ann.vertices).toHaveLength(4);
	});

	it("keeps all vertices when polygonize is disabled", () => {
		const lassoPoints = Array.from({ length: 20 }, (_, i) => {
			const angle = (i / 20) * Math.PI * 2;
			return { x: 0.5 + 0.3 * Math.cos(angle), y: 0.5 + 0.3 * Math.sin(angle) };
		});
		const f = makeFile("f1", "img.png");
		const state = stateWith({
			ui: { selectedFileId: "f1", activeLassoPoints: lassoPoints },
			general: { files: [f], polygonize: false, polygonizeSides: 4 },
		});
		const next = appReducer(state, { type: "complete_lasso" });
		const ann = next.general.files[0]!.annotations[0]!;
		expect(ann.vertices).toHaveLength(20);
	});
});

describe("rename_class", () => {
	it("renames a class", () => {
		const state = createInitialState();
		const next = appReducer(state, {
			type: "rename_class",
			classId: "default-class",
			name: "renamed",
		});
		expect(next.general.classes[0]!.name).toBe("renamed");
	});
});

// -- Lasso --

describe("lasso lifecycle", () => {
	it("start_lasso sets initial point", () => {
		const state = createInitialState();
		const next = appReducer(state, {
			type: "start_lasso",
			point: { x: 0.1, y: 0.2 },
		});
		expect(next.ui.activeLassoPoints).toEqual([{ x: 0.1, y: 0.2 }]);
	});

	it("add_lasso_point appends to points", () => {
		const state = stateWith({
			ui: { activeLassoPoints: [{ x: 0.1, y: 0.2 }] },
		});
		const next = appReducer(state, {
			type: "add_lasso_point",
			point: { x: 0.3, y: 0.4 },
		});
		expect(next.ui.activeLassoPoints).toHaveLength(2);
	});

	it("complete_lasso creates annotation on selected file", () => {
		const f = makeFile("f1", "img.png");
		const state = stateWith({
			ui: {
				selectedFileId: "f1",
				activeLassoPoints: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 1, y: 1 },
				],
			},
			general: { files: [f] },
		});
		const next = appReducer(state, { type: "complete_lasso" });
		expect(next.ui.activeLassoPoints).toBeNull();
		expect(next.general.files[0]!.annotations).toHaveLength(1);
	});

	it("complete_lasso with fewer than 3 points just cancels", () => {
		const state = stateWith({
			ui: { activeLassoPoints: [{ x: 0, y: 0 }] },
		});
		const next = appReducer(state, { type: "complete_lasso" });
		expect(next.ui.activeLassoPoints).toBeNull();
	});

	it("cancel_lasso clears points", () => {
		const state = stateWith({
			ui: { activeLassoPoints: [{ x: 0, y: 0 }] },
		});
		const next = appReducer(state, { type: "cancel_lasso" });
		expect(next.ui.activeLassoPoints).toBeNull();
	});
});

// -- Annotation manipulation --

describe("move_annotation", () => {
	it("translates annotation vertices", () => {
		const f: ImageFile = {
			...makeFile("f1", "img.png"),
			annotations: [
				{
					id: "a1",
					classId: "default-class",
					vertices: [
						{ x: 0.2, y: 0.2 },
						{ x: 0.4, y: 0.2 },
						{ x: 0.3, y: 0.4 },
					],
				},
			],
		};
		const state = stateWith({ general: { files: [f] } });
		const next = appReducer(state, {
			type: "move_annotation",
			fileId: "f1",
			annotationId: "a1",
			delta: { x: 0.1, y: 0.1 },
		});
		const v = next.general.files[0]!.annotations[0]!.vertices;
		expect(v[0]!.x).toBeCloseTo(0.3);
		expect(v[0]!.y).toBeCloseTo(0.3);
	});
});

describe("delete_annotation", () => {
	it("removes the annotation", () => {
		const f: ImageFile = {
			...makeFile("f1", "img.png"),
			annotations: [{ id: "a1", classId: "c1", vertices: [] }],
		};
		const state = stateWith({ general: { files: [f] } });
		const next = appReducer(state, {
			type: "delete_annotation",
			fileId: "f1",
			annotationId: "a1",
		});
		expect(next.general.files[0]!.annotations).toHaveLength(0);
	});
});

// -- Navigation --

describe("navigate_file", () => {
	const files = [makeFile("a", "a.png"), makeFile("b", "b.png"), makeFile("c", "c.png")];

	it("moves forward", () => {
		const state = stateWith({
			ui: { selectedFileId: "a" },
			general: { files },
		});
		const next = appReducer(state, {
			type: "navigate_file",
			direction: "forward",
		});
		expect(next.ui.selectedFileId).toBe("b");
	});

	it("wraps around forward", () => {
		const state = stateWith({
			ui: { selectedFileId: "c" },
			general: { files },
		});
		const next = appReducer(state, {
			type: "navigate_file",
			direction: "forward",
		});
		expect(next.ui.selectedFileId).toBe("a");
	});

	it("moves backward", () => {
		const state = stateWith({
			ui: { selectedFileId: "b" },
			general: { files },
		});
		const next = appReducer(state, {
			type: "navigate_file",
			direction: "backward",
		});
		expect(next.ui.selectedFileId).toBe("a");
	});

	it("wraps around backward", () => {
		const state = stateWith({
			ui: { selectedFileId: "a" },
			general: { files },
		});
		const next = appReducer(state, {
			type: "navigate_file",
			direction: "backward",
		});
		expect(next.ui.selectedFileId).toBe("c");
	});

	it("does nothing with no files", () => {
		const state = createInitialState();
		const next = appReducer(state, {
			type: "navigate_file",
			direction: "forward",
		});
		expect(next.ui.selectedFileId).toBeNull();
	});
});

// -- Toasts --

describe("toast actions", () => {
	it("add_toast appends a toast", () => {
		const state = createInitialState();
		const next = appReducer(state, {
			type: "add_toast",
			toast: { id: "t1", message: "hello" },
		});
		expect(next.ui.toasts).toHaveLength(1);
		expect(next.ui.toasts[0]!.message).toBe("hello");
	});

	it("update_toast changes message and progress", () => {
		const state = stateWith({
			ui: { toasts: [{ id: "t1", message: "old" }] },
		});
		const next = appReducer(state, {
			type: "update_toast",
			id: "t1",
			message: "new",
			progress: { current: 5, total: 10 },
		});
		expect(next.ui.toasts[0]!.message).toBe("new");
		expect(next.ui.toasts[0]!.progress).toEqual({ current: 5, total: 10 });
	});

	it("remove_toast removes by id", () => {
		const state = stateWith({
			ui: { toasts: [{ id: "t1", message: "a" }, { id: "t2", message: "b" }] },
		});
		const next = appReducer(state, { type: "remove_toast", id: "t1" });
		expect(next.ui.toasts).toHaveLength(1);
		expect(next.ui.toasts[0]!.id).toBe("t2");
	});
});

// -- Modals --

describe("modal actions", () => {
	it("opens and closes import modal", () => {
		const state = createInitialState();
		const opened = appReducer(state, { type: "open_import_modal" });
		expect(opened.ui.importModalOpen).toBe(true);
		const closed = appReducer(opened, { type: "close_import_modal" });
		expect(closed.ui.importModalOpen).toBe(false);
	});

	it("opens and closes export modal", () => {
		const state = createInitialState();
		const opened = appReducer(state, { type: "open_export_modal" });
		expect(opened.ui.exportModalOpen).toBe(true);
		const closed = appReducer(opened, { type: "close_export_modal" });
		expect(closed.ui.exportModalOpen).toBe(false);
	});
});
