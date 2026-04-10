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

export async function exportAsZip(
	files: ImageFile[],
	classes: AnnotationClass[],
	format: ExportFormat,
): Promise<void> {
	const zip = new JSZip();

	if (format === "yolo") {
		// One .txt per image + classes.txt.
		zip.file("classes.txt", classes.map((c) => c.name).join("\n"));
		for (const file of files) {
			const baseName = file.name.replace(/\.[^.]+$/, "");
			const yolo = toYoloFormat(file.annotations, classes);
			zip.file(`${baseName}.txt`, yolo);
		}
	} else if (format === "coco") {
		// Single annotations.json in COCO format.
		const coco = toCocoFormat(files, classes);
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
				toLabelMeFormat(file.name, file.annotations, classes),
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
