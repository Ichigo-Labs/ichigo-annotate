import { openDB, type IDBPDatabase } from "idb";
import type {
	AnnotationClass,
	AppState,
	ExportFormat,
	ImageFile,
} from "../types/appState";
import { createInitialState } from "../types/appState";

// --- Types ---

export interface StoredPrefs {
	ui: {
		sidebarWidthPercent: number;
		sidebarCollapsed: boolean;
		activeClassId: string;
		palettePosition: { x: number; y: number };
		selectedFileId: string | null;
		searchQuery: string;
		stretchImage: boolean;
	};
	general: {
		classes: AnnotationClass[];
		exportFormat: ExportFormat;
		polygonize: boolean;
		polygonizeSides: number;
	};
}

// --- Constants ---

const PREFS_KEY = "ichigo-annotate-prefs";
const DB_NAME = "ichigo-annotate";
const FILES_STORE = "files";
const DB_VERSION = 1;

// --- IndexedDB setup ---

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(FILES_STORE)) {
					db.createObjectStore(FILES_STORE, { keyPath: "id" });
				}
			},
		});
	}
	return dbPromise;
}

// --- UI preferences (localStorage, sync) ---

export function savePrefs(state: AppState): void {
	const prefs: StoredPrefs = {
		ui: {
			sidebarWidthPercent: state.ui.sidebarWidthPercent,
			sidebarCollapsed: state.ui.sidebarCollapsed,
			activeClassId: state.ui.activeClassId,
			palettePosition: state.ui.palettePosition,
			selectedFileId: state.ui.selectedFileId,
			searchQuery: state.ui.searchQuery,
			stretchImage: state.ui.stretchImage,
		},
		general: {
			classes: state.general.classes,
			exportFormat: state.general.exportFormat,
			polygonize: state.general.polygonize,
			polygonizeSides: state.general.polygonizeSides,
		},
	};
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
	} catch {
		// Storage unavailable — silently ignore.
	}
}

export function loadPrefs(): StoredPrefs | null {
	try {
		const raw = localStorage.getItem(PREFS_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as StoredPrefs;
	} catch {
		return null;
	}
}

// --- File data (IndexedDB, async) ---

export async function saveFiles(files: ImageFile[]): Promise<void> {
	const db = await getDb();
	const tx = db.transaction(FILES_STORE, "readwrite");

	// Within a single transaction, replace the entire file set. If the
	// transaction aborts (tab close, etc.) nothing commits, so existing data
	// is preserved.
	const keepIds = new Set(files.map((f) => f.id));
	const existingKeys = (await tx.store.getAllKeys()) as string[];

	for (const file of files) {
		tx.store.put(file);
	}
	for (const key of existingKeys) {
		if (!keepIds.has(key)) tx.store.delete(key);
	}
	await tx.done;
}

// Incremental save: only writes changed files and removes deleted ones.
// Much cheaper than re-serializing every image's dataUrl on each change,
// enabling save-on-every-edit without locking up the UI.
export async function saveFilesDiff(
	changedFiles: ImageFile[],
	deletedIds: string[],
): Promise<void> {
	if (changedFiles.length === 0 && deletedIds.length === 0) return;
	const db = await getDb();
	const tx = db.transaction(FILES_STORE, "readwrite");
	for (const file of changedFiles) {
		tx.store.put(file);
	}
	for (const id of deletedIds) {
		tx.store.delete(id);
	}
	await tx.done;
}

export async function loadFiles(): Promise<ImageFile[]> {
	const db = await getDb();
	return (await db.getAll(FILES_STORE)) as ImageFile[];
}

export async function saveFile(file: ImageFile): Promise<void> {
	const db = await getDb();
	await db.put(FILES_STORE, file);
}

export async function deleteFile(fileId: string): Promise<void> {
	const db = await getDb();
	await db.delete(FILES_STORE, fileId);
}

// --- Combined ---

export async function loadFullState(): Promise<AppState> {
	const base = createInitialState();
	const prefs = loadPrefs();
	const files = await loadFiles();

	return {
		ui: {
			...base.ui,
			...(prefs?.ui ?? {}),
		},
		general: {
			...base.general,
			...(prefs?.general ?? {}),
			files,
			lastDeletedFile: null,
		},
	};
}

export async function clearAll(): Promise<void> {
	localStorage.removeItem(PREFS_KEY);
	const db = await getDb();
	await db.clear(FILES_STORE);
}

// Allow tests to close and reset the cached db connection.
export async function _resetDb(): Promise<void> {
	if (dbPromise) {
		const db = await dbPromise;
		db.close();
		dbPromise = null;
	}
}
