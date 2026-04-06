import { useEffect, useReducer, useRef } from "react";
import type { AppAction, AppState, Point } from "../types/appState";
import {
	SIDEBAR_COLLAPSE_THRESHOLD,
	createInitialState,
} from "../types/appState";
import { translatePolygon } from "../utils/areaUtils";
import { loadFullState, saveFiles, savePrefs } from "../services/appStorage";

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
				ui: { ...state.ui, selectedFileId: action.fileId },
			};
		case "delete_file":
			return handleDeleteFile(state, action.fileId);
		case "undo_delete_file":
			return handleUndoDeleteFile(state);
		case "import_files":
			return handleImportFiles(state, action.files, action.replace);

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

		// -- Lasso --
		case "start_lasso":
			return {
				...state,
				ui: { ...state.ui, activeLassoPoints: [action.point] },
			};
		case "add_lasso_point":
			return handleAddLassoPoint(state, action.point);
		case "complete_lasso":
			return handleCompleteLasso(state);
		case "cancel_lasso":
			return {
				...state,
				ui: { ...state.ui, activeLassoPoints: null },
			};

		// -- Annotation manipulation --
		case "delete_annotation":
			return handleDeleteAnnotation(state, action.fileId, action.annotationId);
		case "move_annotation":
			return handleMoveAnnotation(
				state,
				action.fileId,
				action.annotationId,
				action.delta,
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
	replace: boolean,
): AppState {
	const newFiles = replace ? files : [...state.general.files, ...files];
	return {
		...state,
		ui: {
			...state.ui,
			selectedFileId: newFiles[0]?.id ?? null,
		},
		general: {
			...state.general,
			files: newFiles,
			lastDeletedFile: null,
		},
	};
}

function handleAddClass(
	state: AppState,
	name: string,
	color: string,
): AppState {
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
	const classes = state.general.classes.filter((c) => c.id !== classId);
	// If active class was deleted, select the first remaining.
	const activeClassId =
		state.ui.activeClassId === classId
			? (classes[0]?.id ?? "")
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

	const annotation = {
		id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		classId: state.ui.activeClassId,
		vertices: points,
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

function handleDeleteAnnotation(
	state: AppState,
	fileId: string,
	annotationId: string,
): AppState {
	return {
		...state,
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

function handleNavigateFile(
	state: AppState,
	direction: "forward" | "backward",
): AppState {
	const { files } = state.general;
	if (files.length === 0) return state;

	const currentIndex = files.findIndex(
		(f) => f.id === state.ui.selectedFileId,
	);
	let nextIndex: number;
	if (currentIndex === -1) {
		nextIndex = 0;
	} else if (direction === "forward") {
		nextIndex = (currentIndex + 1) % files.length;
	} else {
		nextIndex = (currentIndex - 1 + files.length) % files.length;
	}

	return {
		...state,
		ui: { ...state.ui, selectedFileId: files[nextIndex]!.id },
	};
}

// --- Hook ---

export function useAppReducer(): [AppState, React.Dispatch<AppAction>] {
	const [state, dispatch] = useReducer(appReducer, null, createInitialState);
	const hydrated = useRef(false);

	// Hydrate from IndexedDB + localStorage on mount.
	useEffect(() => {
		loadFullState().then((loaded) => {
			dispatch({ type: "hydrate", state: loaded });
			hydrated.current = true;
		});
	}, []);

	// Auto-save on state changes (debounced). Skip until hydrated.
	useEffect(() => {
		if (!hydrated.current) return;
		const timer = setTimeout(() => {
			savePrefs(state);
			saveFiles(state.general.files);
		}, 500);
		return () => clearTimeout(timer);
	}, [state]);

	return [state, dispatch];
}
