import type {
	AnnotationClass,
	ExportFormat,
	ImageFile,
} from "../types/appState";
import { toCocoFormat, toYoloFormat } from "../utils/exportUtils";
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
	} else {
		// Single annotations.json in COCO format.
		const coco = toCocoFormat(files, classes);
		zip.file("annotations.json", JSON.stringify(coco, null, 2));
	}

	// Generate and trigger download.
	const blob = await zip.generateAsync({ type: "blob" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `annotations-${format}.zip`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
