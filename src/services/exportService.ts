import type {
	AnnotationClass,
	ExportFormat,
	ImageFile,
} from "../types/appState";
import {
	toCocoFormat,
	toJsonFormat,
	toLabelMeFormat,
	toVocFormat,
	toYoloFormat,
} from "../utils/exportUtils";
import JSZip from "jszip";

// Decode an image's natural pixel dimensions from its data URL. Returns null
// when decoding fails or stalls (jsdom never fires image load events, so the
// timeout keeps tests and broken data URLs from hanging the export).
function getImageDims(dataUrl: string): Promise<{ w: number; h: number } | null> {
	const decode = new Promise<{ w: number; h: number } | null>((resolve) => {
		try {
			const img = new Image();
			img.onload = () =>
				resolve(
					img.naturalWidth > 0
						? { w: img.naturalWidth, h: img.naturalHeight }
						: null,
				);
			img.onerror = () => resolve(null);
			img.src = dataUrl;
		} catch {
			resolve(null);
		}
	});
	const timeout = new Promise<null>((resolve) =>
		setTimeout(() => resolve(null), 1500),
	);
	return Promise.race([decode, timeout]);
}

export async function exportAsZip(
	files: ImageFile[],
	classes: AnnotationClass[],
	format: ExportFormat,
	attributes: string[] = [],
): Promise<void> {
	const zip = new JSZip();

	if (format === "yolo") {
		// One .txt per image + classes.txt. NOTE: YOLO label files cannot carry
		// attributes — export COCO when training with the attribute head.
		zip.file("classes.txt", classes.map((c) => c.name).join("\n"));
		for (const file of files) {
			const baseName = file.name.replace(/\.[^.]+$/, "");
			const yolo = toYoloFormat(file.annotations, classes);
			zip.file(`${baseName}.txt`, yolo);
		}
	} else if (format === "coco") {
		// Single annotations.json in COCO format, in absolute pixel coordinates
		// (with image width/height) whenever the images can be decoded.
		const dims = new Map<string, { w: number; h: number }>();
		const decoded = await Promise.all(
			files.map(async (f) => [f.id, await getImageDims(f.dataUrl)] as const),
		);
		for (const [id, d] of decoded) {
			if (d) dims.set(id, d);
		}
		const coco = toCocoFormat(files, classes, attributes, dims);
		zip.file("annotations.json", JSON.stringify(coco, null, 2));
	} else if (format === "voc") {
		// Per-image Pascal VOC XML files.
		for (const file of files) {
			const baseName = file.name.replace(/\.[^.]+$/, "");
			zip.file(
				`${baseName}.xml`,
				toVocFormat(file.name, file.annotations, classes),
			);
		}
	} else if (format === "labelme") {
		// Per-image LabelMe JSON files.
		for (const file of files) {
			const baseName = file.name.replace(/\.[^.]+$/, "");
			zip.file(
				`${baseName}.json`,
				toLabelMeFormat(file.name, file.annotations, classes, attributes),
			);
		}
	} else {
		// Per-image JSON files.
		for (const file of files) {
			const baseName = file.name.replace(/\.[^.]+$/, "");
			zip.file(`${baseName}.json`, toJsonFormat(file.annotations, classes));
		}
	}

	// Generate and trigger download.
	const blob = await zip.generateAsync({ type: "blob" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	const now = new Date();
	const dateSuffix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}`;
	a.download = `annotations-${format}-${dateSuffix}.zip`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
