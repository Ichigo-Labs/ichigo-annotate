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

	it("merges new classes on append and hides unused default-class", () => {
		const state = createInitialState();
		const newClass = { id: "new-cls", name: "tiger", color: "#00ff00" };
		const next = appReducer(state, {
			type: "import_files",
			files: [makeFile("x", "x.png")],
			importClasses: [newClass],
			replace: false,
		});
		expect(next.general.classes).toHaveLength(2);
		expect(next.general.classes[0]!.hidden).toBe(true);
		expect(next.general.classes[1]!.name).toBe("tiger");
	});

	it("keeps default-class visible on append when annotations use it", () => {
		const file = makeFile("a", "a.png");
		file.annotations = [
			{ id: "ann1", classId: "default-class", vertices: [] },
		];
		const state = stateWith({ general: { files: [file] } });
		const newClass = { id: "new-cls", name: "tiger", color: "#00ff00" };
		const next = appReducer(state, {
			type: "import_files",
			files: [makeFile("x", "x.png")],
			importClasses: [newClass],
			replace: false,
		});
		const defCls = next.general.classes.find((c) => c.id === "default-class");
		expect(defCls!.hidden).toBeFalsy();
	});

	it("does not duplicate existing classes on append", () => {
		const state = createInitialState();
		const next = appReducer(state, {
			type: "import_files",
			files: [makeFile("x", "x.png")],
			importClasses: [{ id: "default-class", name: "default-class", color: "#d4856a" }],
			replace: false,
		});
		expect(next.general.classes).toHaveLength(1);
	});

	it("removes default-class on replace with importClasses", () => {
		const state = createInitialState();
		const newClass = { id: "new-cls", name: "tiger", color: "#00ff00" };
		const next = appReducer(state, {
			type: "import_files",
			files: [makeFile("x", "x.png")],
			importClasses: [newClass],
			replace: true,
		});
		const names = next.general.classes.map((c) => c.name);
		expect(names).not.toContain("default-class");
		expect(names).toContain("tiger");
	});

	it("updates activeClassId when default-class is removed on replace", () => {
		const state = createInitialState();
		expect(state.ui.activeClassId).toBe("default-class");
		const newClass = { id: "new-cls", name: "tiger", color: "#00ff00" };
		const next = appReducer(state, {
			type: "import_files",
			files: [makeFile("x", "x.png")],
			importClasses: [newClass],
			replace: true,
		});
		expect(next.ui.activeClassId).toBe("new-cls");
	});

	it("keeps all classes on replace when importClasses includes matched existing ones", () => {
		const existingClass = { id: "cls-1", name: "tiger", color: "#00ff00" };
		const state = stateWith({ general: { classes: [existingClass] } });
		const next = appReducer(state, {
			type: "import_files",
			files: [makeFile("x", "x.png")],
			importClasses: [
				existingClass,
				{ id: "cls-2", name: "lion", color: "#0000ff" },
			],
			replace: true,
		});
		const names = next.general.classes.map((c) => c.name);
		expect(names).toEqual(["tiger", "lion"]);
	});

	it("works without importClasses (backward compatible)", () => {
		const state = createInitialState();
		const next = appReducer(state, {
			type: "import_files",
			files: [makeFile("x", "x.png")],
			replace: false,
		});
		expect(next.general.classes).toHaveLength(1);
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
	it("hides the class instead of removing it", () => {
		const state = createInitialState();
		const withTwo = appReducer(state, {
			type: "add_class",
			name: "tiger",
			color: "#ff0000",
		});
		const classId = withTwo.general.classes[1]!.id;
		const next = appReducer(withTwo, { type: "delete_class", classId });
		// Class still exists but is hidden.
		expect(next.general.classes).toHaveLength(2);
		expect(next.general.classes[1]!.hidden).toBe(true);
	});

	it("resets active class if hidden class was active", () => {
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

describe("add_class un-hides", () => {
	it("re-shows a hidden class with the same name", () => {
		const state = createInitialState();
		const withTwo = appReducer(state, {
			type: "add_class",
			name: "tiger",
			color: "#ff0000",
		});
		const classId = withTwo.general.classes[1]!.id;
		const hidden = appReducer(withTwo, { type: "delete_class", classId });
		expect(hidden.general.classes[1]!.hidden).toBe(true);

		const restored = appReducer(hidden, {
			type: "add_class",
			name: "tiger",
			color: "#00ff00",
		});
		// Same class un-hidden, not a new one added.
		expect(restored.general.classes).toHaveLength(2);
		expect(restored.general.classes[1]!.hidden).toBeFalsy();
		// Keeps the original color.
		expect(restored.general.classes[1]!.color).toBe("#ff0000");
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

// -- Rect / box --

describe("rect lifecycle", () => {
	it("creates a proper non-criss-cross box from four unordered corner taps", () => {
		const f = makeFile("f1", "img.png");
		let state = stateWith({
			ui: { selectedFileId: "f1" },
			general: { files: [f] },
		});
		for (const point of [
			{ x: 0.1, y: 0.1 },
			{ x: 0.9, y: 0.9 },
			{ x: 0.9, y: 0.1 },
			{ x: 0.1, y: 0.9 },
		]) {
			state = appReducer(state, { type: "add_rect_point", point });
		}

		expect(state.ui.activeRectPoints).toBeNull();
		expect(state.general.files[0]!.annotations[0]!.vertices).toEqual([
			{ x: 0.1, y: 0.1 },
			{ x: 0.9, y: 0.1 },
			{ x: 0.9, y: 0.9 },
			{ x: 0.1, y: 0.9 },
		]);
	});

	it("creates an axis-aligned box from two diagonal taps when twoTapBox is enabled", () => {
		const f = makeFile("f1", "img.png");
		let state = stateWith({
			ui: { selectedFileId: "f1", twoTapBox: true },
			general: { files: [f] },
		});
		state = appReducer(state, {
			type: "add_rect_point",
			point: { x: 0.8, y: 0.7 },
		});
		state = appReducer(state, {
			type: "add_rect_point",
			point: { x: 0.2, y: 0.1 },
		});

		expect(state.ui.activeRectPoints).toBeNull();
		expect(state.general.files[0]!.annotations[0]!.vertices).toEqual([
			{ x: 0.2, y: 0.1 },
			{ x: 0.8, y: 0.1 },
			{ x: 0.8, y: 0.7 },
			{ x: 0.2, y: 0.7 },
		]);
	});

	it("ignores near-duplicate rect taps", () => {
		const f = makeFile("f1", "img.png");
		let state = stateWith({
			ui: { selectedFileId: "f1" },
			general: { files: [f] },
		});
		state = appReducer(state, {
			type: "add_rect_point",
			point: { x: 0.5, y: 0.5 },
		});
		state = appReducer(state, {
			type: "add_rect_point",
			point: { x: 0.505, y: 0.505 },
		});

		expect(state.ui.activeRectPoints).toEqual([{ x: 0.5, y: 0.5 }]);
		expect(state.general.files[0]!.annotations).toHaveLength(0);
	});
});

// -- Polygon --

describe("polygon lifecycle", () => {
	const tapAll = (state: AppState, points: { x: number; y: number }[]) =>
		points.reduce(
			(s, point) => appReducer(s, { type: "add_polygon_point", point }),
			state,
		);

	const drawingState = () =>
		stateWith({
			ui: { selectedFileId: "f1", canvasMode: "polygon" },
			general: { files: [makeFile("f1", "img.png")] },
		});

	const pentagon = [
		{ x: 0.5, y: 0.1 },
		{ x: 0.9, y: 0.4 },
		{ x: 0.75, y: 0.9 },
		{ x: 0.25, y: 0.9 },
		{ x: 0.1, y: 0.4 },
	];

	it("places vertices in tap order without committing", () => {
		const state = tapAll(drawingState(), pentagon.slice(0, 3));

		expect(state.ui.activePolygonPoints).toEqual(pentagon.slice(0, 3));
		expect(state.general.files[0]!.annotations).toHaveLength(0);
	});

	it("tapping the first vertex again closes the loop into an annotation", () => {
		const state = tapAll(
			stateWith({
				ui: {
					selectedFileId: "f1",
					activeClassId: "c-dialog",
					activeAttributes: ["bold"],
				},
				general: { files: [makeFile("f1", "img.png")] },
			}),
			[...pentagon, { x: 0.505, y: 0.105 }],
		);

		expect(state.ui.activePolygonPoints).toBeNull();
		const anns = state.general.files[0]!.annotations;
		expect(anns).toHaveLength(1);
		expect(anns[0]!.vertices).toEqual(pentagon);
		expect(anns[0]!.classId).toBe("c-dialog");
		expect(anns[0]!.attributes).toEqual(["bold"]);
	});

	it("does not close before there are three vertices", () => {
		const state = tapAll(drawingState(), [
			{ x: 0.2, y: 0.2 },
			{ x: 0.6, y: 0.2 },
			{ x: 0.2, y: 0.2 },
		]);

		expect(state.ui.activePolygonPoints).toHaveLength(2);
		expect(state.general.files[0]!.annotations).toHaveLength(0);
	});

	it("ignores near-duplicate taps on other vertices", () => {
		const state = tapAll(drawingState(), [
			{ x: 0.2, y: 0.2 },
			{ x: 0.6, y: 0.2 },
			{ x: 0.605, y: 0.205 },
		]);

		expect(state.ui.activePolygonPoints).toHaveLength(2);
	});

	it("places the vertex beside the start of a thin shape instead of closing", () => {
		const thinQuad = [
			{ x: 0.2, y: 0.5 },
			{ x: 0.6, y: 0.5 },
			{ x: 0.6, y: 0.52 },
			{ x: 0.2, y: 0.52 },
		];

		const state = tapAll(drawingState(), [...thinQuad, { x: 0.2, y: 0.5 }]);

		expect(state.general.files[0]!.annotations[0]!.vertices).toEqual(thinQuad);
	});

	it("closing the polygon is undoable", () => {
		const closed = tapAll(drawingState(), [...pentagon, pentagon[0]!]);

		const undone = appReducer(closed, { type: "undo_annotation" });

		expect(undone.general.files[0]!.annotations).toHaveLength(0);
	});

	it("undo while drawing takes back the last vertex, not an annotation edit", () => {
		const existing: ImageFile = {
			...makeFile("f1", "img.png"),
			annotations: [{ id: "a1", classId: "c1", vertices: pentagon }],
		};
		const state = stateWith({
			ui: {
				selectedFileId: "f1",
				activePolygonPoints: pentagon.slice(0, 2),
				annotationUndoStack: [[]],
			},
			general: { files: [existing] },
		});

		const once = appReducer(state, { type: "undo_annotation" });
		const twice = appReducer(once, { type: "undo_annotation" });

		expect(once.ui.activePolygonPoints).toEqual(pentagon.slice(0, 1));
		expect(twice.ui.activePolygonPoints).toBeNull();
		expect(twice.general.files[0]!.annotations).toHaveLength(1);
		expect(twice.ui.annotationUndoStack).toHaveLength(1);
	});

	it("switching modes or files discards the in-progress polygon", () => {
		const drawing = stateWith({
			ui: { selectedFileId: "f1", activePolygonPoints: pentagon.slice(0, 2) },
			general: { files: [makeFile("f1", "a.png"), makeFile("f2", "b.png")] },
		});

		const modeSwitched = appReducer(drawing, { type: "set_canvas_mode", mode: "lasso" });
		const navigated = appReducer(drawing, { type: "navigate_file", direction: "forward" });
		const selected = appReducer(drawing, { type: "select_file", fileId: "f2" });

		expect(modeSwitched.ui.activePolygonPoints).toBeNull();
		expect(navigated.ui.activePolygonPoints).toBeNull();
		expect(selected.ui.activePolygonPoints).toBeNull();
	});
});

// -- Canvas view --

describe("canvas view", () => {
	const fitted = { zoom: 1, x: 0, y: 0 };
	const zoomed = { zoom: 4, x: -1, y: -2 };

	const viewState = (zoom: number, ui: Partial<AppState["ui"]> = {}) =>
		stateWith({
			ui: { selectedFileId: "f1", canvasView: { zoom, x: 0, y: 0 }, ...ui },
			general: { files: [makeFile("f1", "a.png")] },
		});

	it("stores the pinched view and resets it on request", () => {
		const state = appReducer(createInitialState(), { type: "set_canvas_view", view: zoomed });
		const reset = appReducer(state, { type: "reset_canvas_view" });

		expect(state.ui.canvasView).toEqual(zoomed);
		expect(reset.ui.canvasView).toEqual(fitted);
	});

	it("opens every newly shown image fitted to the screen", () => {
		const state = stateWith({
			ui: { selectedFileId: "f1", canvasView: zoomed },
			general: { files: [makeFile("f1", "a.png"), makeFile("f2", "b.png")] },
		});

		const selected = appReducer(state, { type: "select_file", fileId: "f2" });
		const navigated = appReducer(state, { type: "navigate_file", direction: "forward" });
		const deleted = appReducer(state, { type: "delete_file", fileId: "f1" });

		expect(selected.ui.canvasView).toEqual(fitted);
		expect(navigated.ui.canvasView).toEqual(fitted);
		expect(deleted.ui.canvasView).toEqual(fitted);
	});

	it("keeps the view while editing the same image", () => {
		const state = viewState(4, { canvasMode: "polygon" });

		const next = appReducer(state, { type: "add_polygon_point", point: { x: 0.5, y: 0.5 } });

		expect(next.ui.canvasView).toBe(state.ui.canvasView);
	});

	it("lets polygon vertices sit closer together when zoomed in", () => {
		const tapPair = (zoom: number) =>
			[{ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.5 }].reduce(
				(s, point) => appReducer(s, { type: "add_polygon_point", point }),
				viewState(zoom),
			);

		expect(tapPair(1).ui.activePolygonPoints).toHaveLength(1);
		expect(tapPair(4).ui.activePolygonPoints).toHaveLength(2);
	});

	it("shrinks the polygon close target when zoomed in", () => {
		const triangle = [
			{ x: 0.2, y: 0.2 },
			{ x: 0.6, y: 0.2 },
			{ x: 0.4, y: 0.6 },
		];
		const nearFirst = { x: 0.21, y: 0.2 };
		const tapAt = (zoom: number) =>
			appReducer(viewState(zoom, { activePolygonPoints: triangle }), {
				type: "add_polygon_point",
				point: nearFirst,
			});

		const fittedResult = tapAt(1);
		const zoomedResult = tapAt(4);

		expect(fittedResult.general.files[0]!.annotations).toHaveLength(1);
		expect(zoomedResult.general.files[0]!.annotations).toHaveLength(0);
		expect(zoomedResult.ui.activePolygonPoints).toEqual([...triangle, nearFirst]);
	});

	it("accepts a smaller two-tap box when zoomed in", () => {
		const tapBox = (zoom: number) =>
			[{ x: 0.5, y: 0.5 }, { x: 0.506, y: 0.506 }].reduce(
				(s, point) => appReducer(s, { type: "add_rect_point", point }),
				viewState(zoom, { twoTapBox: true }),
			);

		expect(tapBox(1).general.files[0]!.annotations).toHaveLength(0);
		expect(tapBox(4).general.files[0]!.annotations).toHaveLength(1);
	});
});

// -- Annotation selection & class change --

describe("select_annotation", () => {
	it("sets selectedAnnotationId", () => {
		const state = createInitialState();
		const next = appReducer(state, { type: "select_annotation", annotationId: "a1" });
		expect(next.ui.selectedAnnotationId).toBe("a1");
	});

	it("clears selection with null", () => {
		const state = stateWith({ ui: { selectedAnnotationId: "a1" } });
		const next = appReducer(state, { type: "select_annotation", annotationId: null });
		expect(next.ui.selectedAnnotationId).toBeNull();
	});
});

describe("change_annotation_class", () => {
	it("changes the classId of the target annotation", () => {
		const f: ImageFile = {
			...makeFile("f1", "img.png"),
			annotations: [{ id: "a1", classId: "c1", vertices: [] }],
		};
		const state = stateWith({ general: { files: [f] } });
		const next = appReducer(state, {
			type: "change_annotation_class",
			fileId: "f1",
			annotationId: "a1",
			classId: "c2",
		});
		expect(next.general.files[0]!.annotations[0]!.classId).toBe("c2");
	});

	it("does not affect other annotations", () => {
		const f: ImageFile = {
			...makeFile("f1", "img.png"),
			annotations: [
				{ id: "a1", classId: "c1", vertices: [] },
				{ id: "a2", classId: "c1", vertices: [] },
			],
		};
		const state = stateWith({ general: { files: [f] } });
		const next = appReducer(state, {
			type: "change_annotation_class",
			fileId: "f1",
			annotationId: "a1",
			classId: "c2",
		});
		expect(next.general.files[0]!.annotations[0]!.classId).toBe("c2");
		expect(next.general.files[0]!.annotations[1]!.classId).toBe("c1");
	});
});

describe("tag_annotation", () => {
	const fileWith = (attrs?: string[]): ImageFile => ({
		...makeFile("f1", "img.png"),
		annotations: [
			{
				id: "a1",
				classId: "Dialog",
				vertices: [],
				...(attrs ? { attributes: attrs } : {}),
			},
			{ id: "a2", classId: "Mutter", vertices: [] },
		],
	});

	it("applies the active attributes without changing the class", () => {
		const state = stateWith({ general: { files: [fileWith()] } });
		const next = appReducer(state, {
			type: "tag_annotation",
			fileId: "f1",
			annotationId: "a1",
			attributes: ["bold", "float"],
		});
		const a1 = next.general.files[0]!.annotations[0]!;
		expect(a1.attributes).toEqual(["bold", "float"]);
		expect(a1.classId).toBe("Dialog");
	});

	it("clears attributes when the active set is empty", () => {
		const state = stateWith({ general: { files: [fileWith(["bold"])] } });
		const next = appReducer(state, {
			type: "tag_annotation",
			fileId: "f1",
			annotationId: "a1",
			attributes: [],
		});
		const a1 = next.general.files[0]!.annotations[0]!;
		expect(a1.attributes).toBeUndefined();
		expect(a1.classId).toBe("Dialog");
	});

	it("overwrites rather than merges existing attributes", () => {
		const state = stateWith({
			general: { files: [fileWith(["italic", "handwritten"])] },
		});
		const next = appReducer(state, {
			type: "tag_annotation",
			fileId: "f1",
			annotationId: "a1",
			attributes: ["bold"],
		});
		expect(next.general.files[0]!.annotations[0]!.attributes).toEqual(["bold"]);
	});

	it("does not affect other annotations", () => {
		const state = stateWith({ general: { files: [fileWith()] } });
		const next = appReducer(state, {
			type: "tag_annotation",
			fileId: "f1",
			annotationId: "a1",
			attributes: ["bold"],
		});
		const a2 = next.general.files[0]!.annotations[1]!;
		expect(a2.attributes).toBeUndefined();
		expect(a2.classId).toBe("Mutter");
	});

	it("is undoable", () => {
		const state = stateWith({
			ui: { selectedFileId: "f1" },
			general: { files: [fileWith()] },
		});
		const next = appReducer(state, {
			type: "tag_annotation",
			fileId: "f1",
			annotationId: "a1",
			attributes: ["bold"],
		});
		const undone = appReducer(next, { type: "undo_annotation" });
		expect(undone.general.files[0]!.annotations[0]!.attributes).toBeUndefined();
	});
});

describe("selection cleared on navigation and deletion", () => {
	it("clears selectedAnnotationId on select_file", () => {
		const state = stateWith({
			ui: { selectedAnnotationId: "a1" },
			general: { files: [makeFile("f1", "img.png"), makeFile("f2", "img2.png")] },
		});
		const next = appReducer(state, { type: "select_file", fileId: "f2" });
		expect(next.ui.selectedAnnotationId).toBeNull();
	});

	it("clears selectedAnnotationId on navigate_file", () => {
		const files = [makeFile("a", "a.png"), makeFile("b", "b.png")];
		const state = stateWith({
			ui: { selectedFileId: "a", selectedAnnotationId: "a1" },
			general: { files },
		});
		const next = appReducer(state, { type: "navigate_file", direction: "forward" });
		expect(next.ui.selectedAnnotationId).toBeNull();
	});

	it("clears selectedAnnotationId when deleting the selected annotation", () => {
		const f: ImageFile = {
			...makeFile("f1", "img.png"),
			annotations: [{ id: "a1", classId: "c1", vertices: [] }],
		};
		const state = stateWith({
			ui: { selectedAnnotationId: "a1" },
			general: { files: [f] },
		});
		const next = appReducer(state, {
			type: "delete_annotation",
			fileId: "f1",
			annotationId: "a1",
		});
		expect(next.ui.selectedAnnotationId).toBeNull();
	});

	it("keeps selectedAnnotationId when deleting a different annotation", () => {
		const f: ImageFile = {
			...makeFile("f1", "img.png"),
			annotations: [
				{ id: "a1", classId: "c1", vertices: [] },
				{ id: "a2", classId: "c1", vertices: [] },
			],
		};
		const state = stateWith({
			ui: { selectedAnnotationId: "a1" },
			general: { files: [f] },
		});
		const next = appReducer(state, {
			type: "delete_annotation",
			fileId: "f1",
			annotationId: "a2",
		});
		expect(next.ui.selectedAnnotationId).toBe("a1");
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

	it("navigates in sorted order, not insertion order", () => {
		// Files inserted out of order: img10 before img2
		const unsorted = [
			makeFile("f10", "img10.png"),
			makeFile("f2", "img2.png"),
			makeFile("f1", "img1.png"),
		];
		const state = stateWith({
			ui: { selectedFileId: "f1" },
			general: { files: unsorted },
		});
		// Sorted order: img1 -> img2 -> img10
		const next = appReducer(state, {
			type: "navigate_file",
			direction: "forward",
		});
		expect(next.ui.selectedFileId).toBe("f2");

		const next2 = appReducer(next, {
			type: "navigate_file",
			direction: "forward",
		});
		expect(next2.ui.selectedFileId).toBe("f10");
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

// -- Attributes --

describe("attributes", () => {
	const fileWithAnn = (): ImageFile => ({
		id: "f1",
		name: "img.png",
		dataUrl: "",
		thumbnailDataUrl: "",
		annotations: [
			{
				id: "a1",
				classId: "default-class",
				vertices: [
					{ x: 0.1, y: 0.1 },
					{ x: 0.5, y: 0.1 },
					{ x: 0.5, y: 0.5 },
				],
			},
		],
	});

	it("toggle_attribute with no selection toggles the active set", () => {
		const state = createInitialState();
		const on = appReducer(state, { type: "toggle_attribute", name: "italic" });
		expect(on.ui.activeAttributes).toEqual(["italic"]);
		const off = appReducer(on, { type: "toggle_attribute", name: "italic" });
		expect(off.ui.activeAttributes).toEqual([]);
	});

	it("toggle_attribute with a selected annotation edits that annotation and is undoable", () => {
		const state = stateWith({
			ui: { selectedFileId: "f1", selectedAnnotationId: "a1" },
			general: { files: [fileWithAnn()] },
		});
		const next = appReducer(state, { type: "toggle_attribute", name: "bold" });
		expect(next.general.files[0]!.annotations[0]!.attributes).toEqual(["bold"]);
		expect(next.ui.activeAttributes).toEqual([]);
		expect(next.ui.annotationUndoStack).toHaveLength(1);

		const undone = appReducer(next, { type: "undo_annotation" });
		expect(undone.general.files[0]!.annotations[0]!.attributes).toBeUndefined();
	});

	it("add_attribute appends unique trimmed names", () => {
		const state = createInitialState();
		const next = appReducer(state, { type: "add_attribute", name: "  tiny  " });
		expect(next.general.attributes).toContain("tiny");
		const dup = appReducer(next, { type: "add_attribute", name: "tiny" });
		expect(dup.general.attributes.filter((n) => n === "tiny")).toHaveLength(1);
	});

	it("delete_attribute removes it from vocab and active set but keeps annotation tags", () => {
		const file = fileWithAnn();
		file.annotations[0]!.attributes = ["italic", "bold"];
		const state = stateWith({
			ui: { activeAttributes: ["italic"] },
			general: { files: [file] },
		});
		const next = appReducer(state, { type: "delete_attribute", name: "italic" });
		expect(next.general.attributes).not.toContain("italic");
		expect(next.ui.activeAttributes).toEqual([]);
		expect(next.general.files[0]!.annotations[0]!.attributes).toEqual([
			"italic",
			"bold",
		]);
		expect(next.general.files[0]).toBe(state.general.files[0]);
	});

	it("new annotations inherit the active attribute set", () => {
		const state = stateWith({
			ui: {
				selectedFileId: "f1",
				activeAttributes: ["italic"],
			},
			general: { files: [fileWithAnn()] },
		});
		const next = appReducer(state, {
			type: "add_annotation",
			vertices: [
				{ x: 0.2, y: 0.2 },
				{ x: 0.6, y: 0.2 },
				{ x: 0.6, y: 0.6 },
			],
		});
		const anns = next.general.files[0]!.annotations;
		expect(anns[anns.length - 1]!.attributes).toEqual(["italic"]);
	});

	it("import_files merges imported attribute names into the vocabulary", () => {
		const state = createInitialState();
		const next = appReducer(state, {
			type: "import_files",
			files: [fileWithAnn()],
			importClasses: [],
			importAttributes: ["italic", "sparkle"],
			replace: false,
		});
		expect(next.general.attributes).toEqual([
			"italic",
			"bold",
			"handwritten",
			"sparkle",
		]);
	});
});
