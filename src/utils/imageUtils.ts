import type { ImageFile } from "../types/appState";

// Decode an image Blob for drawing. createImageBitmap decodes off the main
// thread and frees its pixels on close(); formats it rejects (e.g. SVG) load
// through an <img> instead.
async function decodeImage(image: Blob): Promise<ImageBitmap | HTMLImageElement> {
	try {
		return await createImageBitmap(image);
	} catch {
		return await loadImageElement(image);
	}
}

function loadImageElement(image: Blob): Promise<HTMLImageElement> {
	const url = URL.createObjectURL(image);
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Failed to load image"));
		img.src = url;
	}).finally(() => URL.revokeObjectURL(url));
}

// Decode an image Blob once for its natural size and a downscaled PNG
// thumbnail.
export async function readImageInfo(
	image: Blob,
	maxDim = 80,
): Promise<{ width: number; height: number; thumbnailDataUrl: string }> {
	const source = await decodeImage(image);
	try {
		const width = "naturalWidth" in source ? source.naturalWidth : source.width;
		const height = "naturalHeight" in source ? source.naturalHeight : source.height;
		const scale = Math.min(maxDim / width, maxDim / height, 1);

		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(width * scale));
		canvas.height = Math.max(1, Math.round(height * scale));
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Could not get canvas context");
		ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
		return { width, height, thumbnailDataUrl: canvas.toDataURL("image/png") };
	} finally {
		if ("close" in source) source.close();
	}
}

// Build an ImageFile from a raw File object. The File itself becomes the
// image, so its bytes stay on disk rather than in tab memory.
export async function createImageFile(file: File): Promise<ImageFile> {
	const { width, height, thumbnailDataUrl } = await readImageInfo(file);
	return {
		id: crypto.randomUUID(),
		name: file.name,
		image: file,
		width,
		height,
		thumbnailDataUrl,
		annotations: [],
	};
}

// Decode a base64 data URL (how images were stored before Blobs) into a Blob.
export function dataUrlToBlob(dataUrl: string): Blob {
	const comma = dataUrl.indexOf(",");
	const type = dataUrl.slice("data:".length, comma).split(";")[0]!;
	const binary = atob(dataUrl.slice(comma + 1));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new Blob([bytes], { type });
}
