import type { ImageFile } from "../types/appState";

export function sortFilesByName(files: ImageFile[]): ImageFile[] {
	return [...files].sort((a, b) => {
		const numA = a.name.match(/\d+/);
		const numB = b.name.match(/\d+/);
		if (numA && numB) return parseInt(numA[0], 10) - parseInt(numB[0], 10);
		if (numA) return -1;
		if (numB) return 1;
		return a.name.localeCompare(b.name);
	});
}
