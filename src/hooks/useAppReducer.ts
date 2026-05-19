import { useEffect, useReducer, useRef } from "react";
import type { AppAction, AppState, Point } from "../types/appState";
import {
	SIDEBAR_COLLAPSE_THRESHOLD,
	createInitialState,
} from "../types/appState";
import { polygonizeVertices, translatePolygon } from "../utils/areaUtils";
import { sortFilesByName } from "../utils/fileSort";
import { loadFullState, saveFilesDiff, savePrefs } from "../services/appStorage";
import type { ImageFile } from "../types/appState";

// --- Reducer (exported for direct testing) ---

export function appReducer(state: AppState, action: AppAction): AppState {
	switch (action.type) {
		case "hydrate":
			return action.state;

		// -- Sidebar --
		case "set_sidebar_width":
			return handleSetSidebarWidth(state, action.widthPercent);
		case "toggle_sidebar_collapsed":
			return {
				...state,
				ui: { ...state.ui, sidebarCollapsed: !state.ui.sidebarCollapsed },
			};

		// -- Search --
		case "set_search_query":
			return {
				...state,
				ui: { ...state.ui, searchQuery: action.query },
			};

		// -- File management --
		case "select_file":
			return {
				...state,
				ui: { ...state.ui, selectedFileId: action.fileId, selectedAnnotationId: null, annotationUndoStack: [], annotationRedoStack: [] },
			};
		case "delete_file":
			return handleDeleteFile(state, action.fileId);
		case "undo_delete_file":
			return handleUndoDeleteFile(state);
		case "import_files":
			return handleImportFiles(state, action.files, action.importClasses ?? [], action.replace);

		// -- Export --
		case "set_export_format":
			return {
				...state,
				general: { ...state.general, exportFormat: action.format },
			};

		// -- Classes --
		case "set_active_class":
			return {
				...state,
				ui: { ...state.ui, activeClassId: action.classId },
			};
		case "add_class":
			return handleAddClass(state, action.name, action.color);
		case "delete_class":
			return handleDeleteClass(state, action.classId);
		case "rename_class":
			return handleRenameClass(state, action.classId, action.name);

		// -- Stretch --
		case "set_stretch_image":
			return {
				...state,
				ui: { ...state.ui, stretchImage: action.enabled },
			};

		// -- Polygonize --
		case "set_polygonize":
			return {
				...state,
				general: { ...state.general, polygonize: action.enabled },
			};
		case "set_polygonize_sides":
			return {
				...state,
				general: {
					...state.general,
					polygonizeSides: Math.max(3, action.sides),
				},
			};

		// -- Lasso --
		case "start_lasso":
			return {
				...state,
				ui: { ...state.ui, activeLassoPoints: [action.point] },
			};
		case "add_lasso_point":
			return handleAddLassoPoint(state, action.point);
		case "complete_lasso":
			return handleCompleteLasso(pushUndoSnapshot(state));
		case "cancel_lasso":
			return {
				...state,
				ui: { ...state.ui, activeLassoPoints: null },
			};

		// -- Annotation manipulation --
		case "select_annotation":
			return {
				...state,
				ui: { ...state.ui, selectedAnnotationId: action.annotationId },
			};
		case "change_annotation_class":
			return handleChangeAnnotationClass(
				pushUndoSnapshot(state),
				action.fileId,
				action.annotationId,
				action.classId,
			);
		case "delete_annotation":
			return handleDeleteAnnotation(pushUndoSnapshot(state), action.fileId, action.annotationId);
		case "move_annotation":
			return handleMoveAnnotation(
				state,
				action.fileId,
				action.annotationId,
				action.delta,
			);
		case "move_vertex":
			return handleMoveVertex(
				state,
				action.fileId,
				action.annotationId,
				action.vertexIndex,
				action.position,
			);
		// -- Palette --
		case "set_palette_position":
			return {
				...state,
				ui: { ...state.ui, palettePosition: action.position },
			};

		// -- Navigation --
		case "navigate_file":
			return handleNavigateFile(state, action.direction);

		// -- Modals --
		case "open_import_modal":
			return { ...state, ui: { ...state.ui, importModalOpen: true } };
		case "close_import_modal":
			return { ...state, ui: { ...state.ui, importModalOpen: false } };
		case "open_export_modal":
			return { ...state, ui: { ...state.ui, exportModalOpen: true } };
		case "close_export_modal":
			return { ...state, ui: { ...state.ui, exportModalOpen: false } };

		// -- Toasts --
		case "add_toast":
			return {
				...state,
				ui: { ...state.ui, toasts: [...state.ui.toasts, action.toast] },
			};
		case "update_toast":
			return {
				...state,
				ui: {
					...state.ui,
					toasts: state.ui.toasts.map((t) =>
						t.id === action.id
							? { ...t, message: action.message, progress: action.progress }
							: t,
					),
				},
			};
		case "remove_toast":
			return {
				...state,
				ui: {
					...state.ui,
					toasts: state.ui.toasts.filter((t) => t.id !== action.id),
				},
			};

		// -- Canvas mode --
		case "set_canvas_mode":
			return {
				...state,
				ui: { ...state.ui, canvasMode: action.mode },
			};
		case "add_annotation":
			return handleAddAnnotation(pushUndoSnapshot(state), action.vertices);
		case "undo_annotation":
			return handleUndoAnnotation(state);
		case "redo_annotation":
			return handleRedoAnnotation(state);
		case "push_undo_snapshot":
			return pushUndoSnapshot(state);
	}
}

// --- Sub-handlers ---

function handleSetSidebarWidth(
	state: AppState,
	widthPercent: number,
): AppState {
	const clamped = Math.max(0, Math.min(50, widthPercent));
	return {
		...state,
		ui: {
			...state.ui,
			sidebarWidthPercent: clamped,
			sidebarCollapsed: clamped < SIDEBAR_COLLAPSE_THRESHOLD,
		},
	};
}

function handleDeleteFile(state: AppState, fileId: string): AppState {
	const file = state.general.files.find((f) => f.id === fileId);
	if (!file) return state;

	const remaining = state.general.files.filter((f) => f.id !== fileId);

	// Select the next file if the deleted one was selected.
	let selectedFileId = state.ui.selectedFileId;
	if (selectedFileId === fileId) {
		const oldIndex = state.general.files.indexOf(file);
		selectedFileId =
			remaining[Math.min(oldIndex, remaining.length - 1)]?.id ?? null;
	}

	return {
		...state,
		ui: { ...state.ui, selectedFileId },
		general: {
			...state.general,
			files: remaining,
			lastDeletedFile: file,
		},
	};
}

function handleUndoDeleteFile(state: AppState): AppState {
	if (!state.general.lastDeletedFile) return state;
	return {
		...state,
		general: {
			...state.general,
			files: [...state.general.files, state.general.lastDeletedFile],
			lastDeletedFile: null,
		},
	};
}

function handleImportFiles(
	state: AppState,
	files: AppState["general"]["files"],
	importClasses: AppState["general"]["classes"],
	replace: boolean,
): AppState {
	const newFiles = replace ? files : [...state.general.files, ...files];

	// Merge imported classes with existing ones.
	let classes: AppState["general"]["classes"];
	if (replace && importClasses.length > 0) {
		// Replace: use imported classes only (discard default-class).
		classes = [...importClasses];
	} else if (importClasses.length > 0) {
		// Append: add imported classes, hide default-class when unused.
		const existingIds = new Set(state.general.classes.map((c) => c.id));
		const defaultUsed = state.general.files.some((f) =>
			f.annotations.some((a) => a.classId === "default-class"),
		);
		classes = [
			...state.general.classes.map((c) =>
				c.id === "default-class" && !defaultUsed
					? { ...c, hidden: true }
					: c,
			),
			...importClasses.filter((c) => !existingIds.has(c.id)),
		];
	} else {
		const existingIds = new Set(state.general.classes.map((c) => c.id));
		classes = [
			...state.general.classes,
			...importClasses.filter((c) => !existingIds.has(c.id)),
		];
	}

	// If the active class was removed or hidden, switch to the first visible.
	let activeClassId = state.ui.activeClassId;
	const visibleClasses = classes.filter((c) => !c.hidden);
	if (!visibleClasses.some((c) => c.id === activeClassId)) {
		activeClassId = visibleClasses[0]?.id ?? activeClassId;
	}

	return {
		...state,
		ui: {
			...state.ui,
			selectedFileId: newFiles[0]?.id ?? null,
			activeClassId,
		},
		general: {
			...state.general,
			files: newFiles,
			classes,
			lastDeletedFile: null,
		},
	};
}

function handleAddClass(
	state: AppState,
	name: string,
	color: string,
): AppState {
	// Un-hide if a class with the same name already exists.
	const existing = state.general.classes.find(
		(c) => c.name === name && c.hidden,
	);
	if (existing) {
		return {
			...state,
			general: {
				...state.general,
				classes: state.general.classes.map((c) =>
					c.id === existing.id ? { ...c, hidden: false } : c,
				),
			},
		};
	}

	const id = `class-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	const newClass = { id, name, color };
	return {
		...state,
		general: {
			...state.general,
			classes: [...state.general.classes, newClass],
		},
	};
}

function handleDeleteClass(state: AppState, classId: string): AppState {
	// Hide the class instead of removing it so annotations keep their color.
	const classes = state.general.classes.map((c) =>
		c.id === classId ? { ...c, hidden: true } : c,
	);
	const visibleClasses = classes.filter((c) => !c.hidden);
	// If active class was hidden, select the first visible.
	const activeClassId =
		state.ui.activeClassId === classId
			? (visibleClasses[0]?.id ?? "")
			: state.ui.activeClassId;
	return {
		...state,
		ui: { ...state.ui, activeClassId },
		general: { ...state.general, classes },
	};
}

function handleRenameClass(
	state: AppState,
	classId: string,
	name: string,
): AppState {
	return {
		...state,
		general: {
			...state.general,
			classes: state.general.classes.map((c) =>
				c.id === classId ? { ...c, name } : c,
			),
		},
	};
}

function handleAddLassoPoint(state: AppState, point: Point): AppState {
	if (!state.ui.activeLassoPoints) return state;
	return {
		...state,
		ui: {
			...state.ui,
			activeLassoPoints: [...state.ui.activeLassoPoints, point],
		},
	};
}

function handleCompleteLasso(state: AppState): AppState {
	const points = state.ui.activeLassoPoints;
	if (!points || points.length < 3 || !state.ui.selectedFileId) {
		return { ...state, ui: { ...state.ui, activeLassoPoints: null } };
	}

	// Polygonize if enabled.
	const finalVertices = state.general.polygonize
		? polygonizeVertices(points, state.general.polygonizeSides)
		: points;

	const annotation = {
		id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		classId: state.ui.activeClassId,
		vertices: finalVertices,
	};

	return {
		...state,
		ui: { ...state.ui, activeLassoPoints: null },
		general: {
			...state.general,
			files: state.general.files.map((f) =>
				f.id === state.ui.selectedFileId
					? { ...f, annotations: [...f.annotations, annotation] }
					: f,
			),
		},
	};
}

function handleChangeAnnotationClass(
	state: AppState,
	fileId: string,
	annotationId: string,
	classId: string,
): AppState {
	return {
		...state,
		general: {
			...state.general,
			files: state.general.files.map((f) =>
				f.id === fileId
					? {
							...f,
							annotations: f.annotations.map((a) =>
								a.id === annotationId
									? { ...a, classId }
									: a,
							),
						}
					: f,
			),
		},
	};
}

function handleDeleteAnnotation(
	state: AppState,
	fileId: string,
	annotationId: string,
): AppState {
	return {
		...state,
		ui: {
			...state.ui,
			selectedAnnotationId:
				state.ui.selectedAnnotationId === annotationId
					? null
					: state.ui.selectedAnnotationId,
		},
		general: {
			...state.general,
			files: state.general.files.map((f) =>
				f.id === fileId
					? {
							...f,
							annotations: f.annotations.filter(
								(a) => a.id !== annotationId,
							),
						}
					: f,
			),
		},
	};
}

function handleMoveAnnotation(
	state: AppState,
	fileId: string,
	annotationId: string,
	delta: Point,
): AppState {
	return {
		...state,
		general: {
			...state.general,
			files: state.general.files.map((f) =>
				f.id === fileId
					? {
							...f,
							annotations: f.annotations.map((a) =>
								a.id === annotationId
									? { ...a, vertices: translatePolygon(a.vertices, delta) }
									: a,
							),
						}
					: f,
			),
		},
	};
}

function handleMoveVertex(
	state: AppState,
	fileId: string,
	annotationId: string,
	vertexIndex: number,
	position: Point,
): AppState {
	return {
		...state,
		general: {
			...state.general,
			files: state.general.files.map((f) =>
				f.id === fileId
					? {
							...f,
							annotations: f.annotations.map((a) =>
								a.id === annotationId
									? {
											...a,
											vertices: a.vertices.map((v, i) =>
												i === vertexIndex ? position : v,
											),
										}
									: a,
							),
						}
					: f,
			),
		},
	};
}

const MAX_UNDO_STACK = 50;

function pushUndoSnapshot(state: AppState): AppState {
	const file = state.general.files.find(
		(f) => f.id === state.ui.selectedFileId,
	);
	if (!file) return state;
	const stack = [...state.ui.annotationUndoStack, file.annotations];
	return {
		...state,
		ui: {
			...state.ui,
			annotationUndoStack: stack.length > MAX_UNDO_STACK ? stack.slice(-MAX_UNDO_STACK) : stack,
			annotationRedoStack: [],
		},
	};
}

function handleUndoAnnotation(state: AppState): AppState {
	const { annotationUndoStack } = state.ui;
	if (annotationUndoStack.length === 0 || !state.ui.selectedFileId) return state;

	const file = state.general.files.find(
		(f) => f.id === state.ui.selectedFileId,
	);
	if (!file) return state;

	const prev = annotationUndoStack[annotationUndoStack.length - 1]!;
	return {
		...state,
		ui: {
			...state.ui,
			annotationUndoStack: annotationUndoStack.slice(0, -1),
			annotationRedoStack: [...state.ui.annotationRedoStack, file.annotations],
			selectedAnnotationId: null,
		},
		general: {
			...state.general,
			files: state.general.files.map((f) =>
				f.id === state.ui.selectedFileId
					? { ...f, annotations: prev }
					: f,
			),
		},
	};
}

function handleRedoAnnotation(state: AppState): AppState {
	const { annotationRedoStack } = state.ui;
	if (annotationRedoStack.length === 0 || !state.ui.selectedFileId) return state;

	const file = state.general.files.find(
		(f) => f.id === state.ui.selectedFileId,
	);
	if (!file) return state;

	const next = annotationRedoStack[annotationRedoStack.length - 1]!;
	return {
		...state,
		ui: {
			...state.ui,
			annotationUndoStack: [...state.ui.annotationUndoStack, file.annotations],
			annotationRedoStack: annotationRedoStack.slice(0, -1),
			selectedAnnotationId: null,
		},
		general: {
			...state.general,
			files: state.general.files.map((f) =>
				f.id === state.ui.selectedFileId
					? { ...f, annotations: next }
					: f,
			),
		},
	};
}

function handleAddAnnotation(state: AppState, vertices: Point[]): AppState {
	if (!state.ui.selectedFileId || vertices.length < 3) return state;

	const annotation = {
		id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		classId: state.ui.activeClassId,
		vertices,
	};

	return {
		...state,
		general: {
			...state.general,
			files: state.general.files.map((f) =>
				f.id === state.ui.selectedFileId
					? { ...f, annotations: [...f.annotations, annotation] }
					: f,
			),
		},
	};
}

function handleNavigateFile(
	state: AppState,
	direction: "forward" | "backward",
): AppState {
	const sorted = sortFilesByName(state.general.files);
	if (sorted.length === 0) return state;

	const currentIndex = sorted.findIndex(
		(f) => f.id === state.ui.selectedFileId,
	);
	let nextIndex: number;
	if (currentIndex === -1) {
		nextIndex = 0;
	} else if (direction === "forward") {
		nextIndex = (currentIndex + 1) % sorted.length;
	} else {
		nextIndex = (currentIndex - 1 + sorted.length) % sorted.length;
	}

	return {
		...state,
		ui: { ...state.ui, selectedFileId: sorted[nextIndex]!.id, selectedAnnotationId: null, annotationUndoStack: [], annotationRedoStack: [] },
	};
}

// --- Hook ---

// Frequent saves: typical debounce, plus a hard ceiling so continuous
// editing (e.g. dragging a vertex) still flushes to disk regularly.
const SAVE_DEBOUNCE_MS = 300;
const SAVE_MAX_WAIT_MS = 2000;

export function useAppReducer(): [AppState, React.Dispatch<AppAction>] {
	const [state, dispatch] = useReducer(appReducer, null, createInitialState);
	const hydrated = useRef(false);

	// Track the latest state and last-persisted files for diffed saves.
	const stateRef = useRef(state);
	stateRef.current = state;
	const lastSavedFilesRef = useRef<ImageFile[]>([]);

	// Save the current state — prefs synchronously, files via incremental diff.
	const flushSave = useRef(() => {
		const current = stateRef.current;
		savePrefs(current);

		const prev = lastSavedFilesRef.current;
		const prevMap = new Map(prev.map((f) => [f.id, f]));
		const nextFiles = current.general.files;
		const nextIds = new Set(nextFiles.map((f) => f.id));

		const changed = nextFiles.filter((f) => prevMap.get(f.id) !== f);
		const deletedIds = prev
			.filter((f) => !nextIds.has(f.id))
			.map((f) => f.id);

		lastSavedFilesRef.current = nextFiles;
		saveFilesDiff(changed, deletedIds);
	});

	// Hydrate from IndexedDB + localStorage on mount.
	useEffect(() => {
		loadFullState().then((loaded) => {
			dispatch({ type: "hydrate", state: loaded });
			lastSavedFilesRef.current = loaded.general.files;
			hydrated.current = true;
		});
	}, []);

	// Auto-save on state changes. Debounced for typical edits, but capped by
	// SAVE_MAX_WAIT_MS so continuous activity still persists frequently.
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!hydrated.current) return;

		if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
		debounceTimerRef.current = setTimeout(() => {
			if (maxWaitTimerRef.current) {
				clearTimeout(maxWaitTimerRef.current);
				maxWaitTimerRef.current = null;
			}
			flushSave.current();
		}, SAVE_DEBOUNCE_MS);

		if (!maxWaitTimerRef.current) {
			maxWaitTimerRef.current = setTimeout(() => {
				if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
				maxWaitTimerRef.current = null;
				flushSave.current();
			}, SAVE_MAX_WAIT_MS);
		}
	}, [state]);

	// Flush pending changes when the tab is closed or hidden so users don't
	// lose the last few edits on accidental close, refresh, or mobile suspend.
	useEffect(() => {
		const flushNow = () => {
			if (!hydrated.current) return;
			flushSave.current();
		};
		const onVisibility = () => {
			if (document.visibilityState === "hidden") flushNow();
		};
		window.addEventListener("beforeunload", flushNow);
		window.addEventListener("pagehide", flushNow);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			window.removeEventListener("beforeunload", flushNow);
			window.removeEventListener("pagehide", flushNow);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, []);

	return [state, dispatch];
}
