import type {
	Annotation,
	AnnotationClass,
	ImageFile,
} from "../types/appState";
import { polygonBoundingBox } from "./areaUtils";

// Convert annotations to YOLO segmentation format.
// One line per annotation: class_index x1 y1 x2 y2 ...
export function toYoloFormat(
	annotations: Annotation[],
	classes: AnnotationClass[],
): string {
	const classIndex = new Map(classes.map((c, i) => [c.id, i]));

	return annotations
		.map((ann) => {
			const idx = classIndex.get(ann.classId) ?? 0;
			const coords = ann.vertices
				.map((v) => `${v.x.toFixed(6)} ${v.y.toFixed(6)}`)
				.join(" ");
			return `${idx} ${coords}`;
		})
		.join("\n");
}

// Per-image JSON: array of { class, vertices } objects.
export function toJsonFormat(
	annotations: Annotation[],
	classes: AnnotationClass[],
): string {
	const classById = new Map(classes.map((c) => [c.id, c.name]));
	return JSON.stringify(
		annotations.map((ann) => ({
			class: classById.get(ann.classId) ?? "",
			vertices: ann.vertices.map((v) => [
				parseFloat(v.x.toFixed(6)),
				parseFloat(v.y.toFixed(6)),
			]),
		})),
		null,
		2,
	);
}

// Build a COCO-format JSON object.
export function toCocoFormat(
	files: ImageFile[],
	classes: AnnotationClass[],
): object {
	const categories = classes.map((c, i) => ({
		id: i,
		name: c.name,
	}));

	const classIndex = new Map(classes.map((c, i) => [c.id, i]));
	let annotationId = 1;
	const images: object[] = [];
	const annotations: object[] = [];

	for (let imgIdx = 0; imgIdx < files.length; imgIdx++) {
		const file = files[imgIdx]!;
		images.push({
			id: imgIdx,
			file_name: file.name,
		});

		for (const ann of file.annotations) {
			const bbox = polygonBoundingBox(ann.vertices);
			const segmentation = ann.vertices.flatMap((v) => [v.x, v.y]);

			annotations.push({
				id: annotationId++,
				image_id: imgIdx,
				category_id: classIndex.get(ann.classId) ?? 0,
				segmentation: [segmentation],
				bbox: [
					bbox.minX,
					bbox.minY,
					bbox.maxX - bbox.minX,
					bbox.maxY - bbox.minY,
				],
				area: (bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY),
			});
		}
	}

	return { images, annotations, categories };
}

// --- Pascal VOC (XML per image) ---

function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export function toVocFormat(
	fileName: string,
	annotations: Annotation[],
	classes: AnnotationClass[],
): string {
	const classById = new Map(classes.map((c) => [c.id, c.name]));
	const lines: string[] = [
		"<annotation>",
		`  <filename>${escapeXml(fileName)}</filename>`,
		"  <size><width>1</width><height>1</height><depth>3</depth></size>",
	];

	for (const ann of annotations) {
		const name = classById.get(ann.classId) ?? "";
		const bbox = polygonBoundingBox(ann.vertices);
		lines.push("  <object>");
		lines.push(`    <name>${escapeXml(name)}</name>`);
		lines.push("    <bndbox>");
		lines.push(`      <xmin>${bbox.minX.toFixed(6)}</xmin>`);
		lines.push(`      <ymin>${bbox.minY.toFixed(6)}</ymin>`);
		lines.push(`      <xmax>${bbox.maxX.toFixed(6)}</xmax>`);
		lines.push(`      <ymax>${bbox.maxY.toFixed(6)}</ymax>`);
		lines.push("    </bndbox>");
		lines.push("    <polygon>");
		for (const v of ann.vertices) {
			lines.push(
				`      <pt><x>${v.x.toFixed(6)}</x><y>${v.y.toFixed(6)}</y></pt>`,
			);
		}
		lines.push("    </polygon>");
		lines.push("  </object>");
	}

	lines.push("</annotation>");
	return lines.join("\n");
}

// --- LabelMe (JSON per image) ---

export function toLabelMeFormat(
	fileName: string,
	annotations: Annotation[],
	classes: AnnotationClass[],
): string {
	const classById = new Map(classes.map((c) => [c.id, c.name]));
	return JSON.stringify(
		{
			version: "5.0.0",
			flags: {},
			shapes: annotations.map((ann) => ({
				label: classById.get(ann.classId) ?? "",
				points: ann.vertices.map((v) => [
					parseFloat(v.x.toFixed(6)),
					parseFloat(v.y.toFixed(6)),
				]),
				shape_type: "polygon",
				flags: {},
			})),
			imagePath: fileName,
			imageHeight: 1,
			imageWidth: 1,
		},
		null,
		2,
	);
}
