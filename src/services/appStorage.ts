import { openDB, type IDBPDatabase, type IDBPObjectStore } from "idb";
import type {
	AnnotationClass,
	AppState,
	ExportFormat,
	ImageFile,
} from "../types/appState";
import { createInitialState } from "../types/appState";
import { dataUrlToBlob } from "../utils/imageUtils";

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
		twoTapBox?: boolean;
		activeAttributes?: string[];
	};
	general: {
		classes: AnnotationClass[];
		attributes?: string[];
		exportFormat: ExportFormat;
		polygonize: boolean;
		polygonizeSides: number;
	};
}

// --- Constants ---

const PREFS_KEY = "ichigo-annotate-prefs";
const DB_NAME = "ichigo-annotate";
const FILES_STORE = "files";
// Version 2 stores each image as a Blob instead of a base64 `dataUrl`.
const DB_VERSION = 2;

// --- IndexedDB setup ---

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, DB_VERSION, {
			async upgrade(db, oldVersion, _newVersion, tx) {
				if (!db.objectStoreNames.contains(FILES_STORE)) {
					db.createObjectStore(FILES_STORE, { keyPath: "id" });
				}
				if (oldVersion === 1) {
					await migrateDataUrlsToBlobs(tx.objectStore(FILES_STORE));
				}
			},
		});
	}
	return dbPromise;
}

// Convert version-1 records, which held the image as a base64 `dataUrl`, one
// record at a time so a large store never has to fit in memory at once.
async function migrateDataUrlsToBlobs(
	store: IDBPObjectStore<unknown, string[], typeof FILES_STORE, "versionchange">,
): Promise<void> {
	let cursor = await store.openCursor();
	while (cursor) {
		const { dataUrl, ...rest } = cursor.value as Omit<ImageFile, "image"> & {
			dataUrl?: string;
		};
		if (typeof dataUrl === "string") {
			await cursor.update({ ...rest, image: dataUrlToBlob(dataUrl) });
		}
		cursor = await cursor.continue();
	}
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
			twoTapBox: state.ui.twoTapBox,
			activeAttributes: state.ui.activeAttributes,
		},
		general: {
			classes: state.general.classes,
			attributes: state.general.attributes,
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
// Much cheaper than rewriting every file on each change,
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
			importModalOpen: false,
			exportModalOpen: false,
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
