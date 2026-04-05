import type { AppState } from "../types/appState";

const STORAGE_KEY = "ichigo-annotate-state";

export function saveState(state: AppState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Storage full or unavailable — silently ignore.
	}
}

export function loadState(): AppState | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as AppState;
	} catch {
		return null;
	}
}

export function clearState(): void {
	localStorage.removeItem(STORAGE_KEY);
}
