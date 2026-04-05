import type { ImageFile } from "../types/appState";

// Read a File into a base64 data URL.
export function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

// Create a downscaled thumbnail from a data URL.
export function generateThumbnail(
	dataUrl: string,
	maxDim = 80,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
			const w = Math.round(img.width * scale);
			const h = Math.round(img.height * scale);

			const canvas = document.createElement("canvas");
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Could not get canvas context"));
				return;
			}
			ctx.drawImage(img, 0, 0, w, h);
			resolve(canvas.toDataURL("image/png"));
		};
		img.onerror = () => reject(new Error("Failed to load image"));
		img.src = dataUrl;
	});
}

// Build an ImageFile from a raw File object.
export async function createImageFile(file: File): Promise<ImageFile> {
	const dataUrl = await fileToDataUrl(file);
	const thumbnailDataUrl = await generateThumbnail(dataUrl);
	return {
		id: crypto.randomUUID(),
		name: file.name,
		dataUrl,
		thumbnailDataUrl,
		annotations: [],
	};
}
