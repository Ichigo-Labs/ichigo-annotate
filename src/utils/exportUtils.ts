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
