// --- Domain types ---

export interface Point {
	x: number; // 0–1 normalized
	y: number;
}

export interface AnnotationClass {
	id: string;
	name: string;
	color: string; // hex, e.g. "#D4856A"
	hidden?: boolean;
}

export interface Annotation {
	id: string;
	classId: string;
	vertices: Point[]; // closed polygon, 3+ points
}

export interface ImageFile {
	id: string;
	name: string;
	dataUrl: string;
	thumbnailDataUrl: string;
	annotations: Annotation[];
}

export type ExportFormat = "yolo" | "coco" | "json" | "voc" | "labelme";
export type CanvasMode = "lasso" | "bucket";

// --- Toast ---

export interface Toast {
	id: string;
	message: string;
	progress?: { current: number; total: number };
}

// --- UI state (view-specific) ---

export interface UIState {
	sidebarWidthPercent: number;
	sidebarCollapsed: boolean;
	searchQuery: string;
	selectedFileId: string | null;
	activeClassId: string;
	activeLassoPoints: Point[] | null;
	palettePosition: { x: number; y: number };
	importModalOpen: boolean;
	exportModalOpen: boolean;
	stretchImage: boolean;
	canvasMode: CanvasMode;
	draggingAnnotationId: string | null;
	selectedAnnotationId: string | null;
	toasts: Toast[];
}

// --- General state (meaningful without a UI) ---

export interface GeneralState {
	files: ImageFile[];
	classes: AnnotationClass[];
	exportFormat: ExportFormat;
	lastDeletedFile: ImageFile | null;
	polygonize: boolean;
	polygonizeSides: number;
}

// --- Combined ---

export interface AppState {
	ui: UIState;
	general: GeneralState;
}

// --- Actions ---

export type AppAction =
	| { type: "hydrate"; state: AppState }
	| { type: "set_sidebar_width"; widthPercent: number }
	| { type: "toggle_sidebar_collapsed" }
	| { type: "set_search_query"; query: string }
	| { type: "select_file"; fileId: string }
	| { type: "delete_file"; fileId: string }
	| { type: "undo_delete_file" }
	| { type: "import_files"; files: ImageFile[]; importClasses?: AnnotationClass[]; replace: boolean }
	| { type: "set_export_format"; format: ExportFormat }
	| { type: "set_active_class"; classId: string }
	| { type: "add_class"; name: string; color: string }
	| { type: "delete_class"; classId: string }
	| { type: "rename_class"; classId: string; name: string }
	| { type: "set_stretch_image"; enabled: boolean }
	| { type: "set_polygonize"; enabled: boolean }
	| { type: "set_polygonize_sides"; sides: number }
	| { type: "start_lasso"; point: Point }
	| { type: "add_lasso_point"; point: Point }
	| { type: "complete_lasso" }
	| { type: "cancel_lasso" }
	| { type: "select_annotation"; annotationId: string | null }
	| { type: "change_annotation_class"; fileId: string; annotationId: string; classId: string }
	| { type: "delete_annotation"; fileId: string; annotationId: string }
	| {
			type: "move_annotation";
			fileId: string;
			annotationId: string;
			delta: Point;
	  }
	| { type: "set_palette_position"; position: { x: number; y: number } }
	| { type: "navigate_file"; direction: "forward" | "backward" }
	| { type: "open_import_modal" }
	| { type: "close_import_modal" }
	| { type: "open_export_modal" }
	| { type: "close_export_modal" }
	| { type: "add_toast"; toast: Toast }
	| {
			type: "update_toast";
			id: string;
			message: string;
			progress?: { current: number; total: number };
	  }
	| { type: "remove_toast"; id: string }
	| { type: "set_canvas_mode"; mode: CanvasMode }
	| { type: "add_annotation"; vertices: Point[] };

// --- Constants ---

export const DEFAULT_CLASS: AnnotationClass = {
	id: "default-class",
	name: "default-class",
	color: "#d4856a",
};

export const SIDEBAR_COLLAPSE_THRESHOLD = 5;

// --- Initial state factory ---

export function createInitialState(): AppState {
	return {
		ui: {
			sidebarWidthPercent: 20,
			sidebarCollapsed: false,
			searchQuery: "",
			selectedFileId: null,
			activeClassId: DEFAULT_CLASS.id,
			activeLassoPoints: null,
			palettePosition: { x: 16, y: 16 },
			importModalOpen: false,
			exportModalOpen: false,
			stretchImage: true,
			canvasMode: "lasso" as const,
			draggingAnnotationId: null,
			selectedAnnotationId: null,
			toasts: [],
		},
		general: {
			files: [],
			classes: [DEFAULT_CLASS],
			exportFormat: "yolo",
			lastDeletedFile: null,
			polygonize: false,
			polygonizeSides: 4,
		},
	};
}
