import type { Annotation, AnnotationClass, Point } from "../types/appState";
import { generateDistinctColor } from "./areaUtils";

// --- Class resolution ---

// Map imported class entries (index/id + name) to classIds, reusing existing
// classes by name where possible and creating new ones for the rest.
export function resolveClasses(
	entries: { key: number; name: string }[],
	existingClasses: AnnotationClass[],
): {
	classMap: Map<number, string>;
	newClasses: AnnotationClass[];
	allClasses: AnnotationClass[];
} {
	const existingByName = new Map<string, AnnotationClass>();
	for (const c of existingClasses) {
		if (!c.hidden) existingByName.set(c.name, c);
	}

	const classMap = new Map<number, string>();
	const newClasses: AnnotationClass[] = [];
	const allClasses: AnnotationClass[] = [];
	const usedColors = existingClasses.map((c) => c.color);
	const seen = new Set<string>();

	for (const { key, name } of entries) {
		const existing = existingByName.get(name);
		if (existing) {
			classMap.set(key, existing.id);
			if (!seen.has(existing.id)) {
				seen.add(existing.id);
				allClasses.push(existing);
			}
		} else {
			const color = generateDistinctColor(usedColors);
			usedColors.push(color);
			const cls: AnnotationClass = {
				id: `class-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				name,
				color,
			};
			classMap.set(key, cls.id);
			newClasses.push(cls);
			allClasses.push(cls);
			existingByName.set(name, cls);
		}
	}

	return { classMap, newClasses, allClasses };
}

// --- YOLO ---

export function parseYoloClasses(text: string): string[] {
	return text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
}

// Scan YOLO text files to find the highest class index used.
export function detectYoloMaxIndex(texts: Iterable<string>): number {
	let max = -1;
	for (const text of texts) {
		for (const line of text.split("\n")) {
			const idx = parseInt(line.trim().split(/\s+/)[0] ?? "", 10);
			if (!isNaN(idx) && idx > max) max = idx;
		}
	}
	return max;
}

export function parseYoloAnnotation(
	text: string,
	classMap: Map<number, string>,
): Annotation[] {
	return text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0)
		.map((line) => {
			const parts = line.split(/\s+/).map(Number);
			const classIdx = parts[0]!;
			const coords = parts.slice(1);
			const vertices: Point[] = [];
			for (let i = 0; i + 1 < coords.length; i += 2) {
				vertices.push({ x: coords[i]!, y: coords[i + 1]! });
			}
			return {
				id: crypto.randomUUID(),
				classId: classMap.get(classIdx) ?? "",
				vertices,
			};
		})
		.filter((a) => a.vertices.length >= 3);
}

// --- COCO ---

interface CocoImage {
	id: number;
	file_name: string;
	width?: number;
	height?: number;
}

interface CocoAnnotation {
	image_id: number;
	category_id: number;
	segmentation: number[][];
	// Either a list of names (["italic"]) or a { name: bool } map.
	attributes?: string[] | Record<string, boolean>;
}

interface CocoCategory {
	id: number;
	name: string;
}

export interface CocoData {
	images: CocoImage[];
	annotations: CocoAnnotation[];
	categories: CocoCategory[];
	// Top-level attribute vocabulary (our COCO export writes it).
	attributes?: ({ id?: number; name: string } | string)[];
}

// Recognize a COCO annotations file by name. Our own export writes
// "annotations.json"; Roboflow and other COCO exporters use the
// "<split>_annotations.coco.json" convention (more generally a ".coco.json"
// suffix). Accept all of these so a single dataset folder imports as COCO.
export function isCocoFileName(name: string): boolean {
	const lower = name.toLowerCase();
	return lower === "annotations.json" || lower.endsWith(".coco.json");
}

// Normalize an annotation's attribute field to a plain list of names.
function normalizeAttributes(
	raw: string[] | Record<string, boolean> | undefined,
): string[] {
	if (!raw) return [];
	if (Array.isArray(raw)) return raw.map(String);
	return Object.keys(raw).filter((k) => raw[k]);
}

// Attribute vocabulary declared by a COCO file's top-level "attributes" list.
export function cocoAttributeNames(data: CocoData): string[] {
	return (data.attributes ?? [])
		.map((a) => (typeof a === "string" ? a : a.name))
		.filter((n): n is string => Boolean(n));
}

export function parseCocoAnnotations(
	data: CocoData,
	classMap: Map<number, string>,
): Map<string, Annotation[]> {
	const imageDims = new Map<
		number,
		{ w: number; h: number; fileName: string }
	>();
	for (const img of data.images) {
		imageDims.set(img.id, {
			w: img.width ?? 1,
			h: img.height ?? 1,
			fileName: img.file_name,
		});
	}

	const result = new Map<string, Annotation[]>();

	for (const ann of data.annotations) {
		const info = imageDims.get(ann.image_id);
		if (!info) continue;

		const baseName = info.fileName.replace(/\.[^.]+$/, "");

		for (const seg of ann.segmentation) {
			const vertices: Point[] = [];
			for (let i = 0; i + 1 < seg.length; i += 2) {
				let x = seg[i]!;
				let y = seg[i + 1]!;
				// Normalize pixel coordinates when image dimensions are present.
				if (info.w > 1 || info.h > 1) {
					x /= info.w;
					y /= info.h;
				}
				vertices.push({ x, y });
			}
			if (vertices.length < 3) continue;

			const attributes = normalizeAttributes(ann.attributes);
			const existing = result.get(baseName) ?? [];
			existing.push({
				id: crypto.randomUUID(),
				classId: classMap.get(ann.category_id) ?? "",
				vertices,
				...(attributes.length > 0 ? { attributes } : {}),
			});
			result.set(baseName, existing);
		}
	}

	return result;
}

// --- Per-image JSON ---

interface JsonAnnotationEntry {
	class: string;
	vertices: [number, number][];
	attributes?: string[];
}

export function parseJsonAnnotation(
	text: string,
	classByName: Map<string, string>, // class name → classId
): Annotation[] {
	const entries: JsonAnnotationEntry[] = JSON.parse(text);
	return entries
		.filter((e) => Array.isArray(e.vertices) && e.vertices.length >= 3)
		.map((e) => {
			const attributes = normalizeAttributes(e.attributes);
			return {
				id: crypto.randomUUID(),
				classId: classByName.get(e.class) ?? "",
				vertices: e.vertices.map(([x, y]) => ({ x, y })),
				...(attributes.length > 0 ? { attributes } : {}),
			};
		});
}

// Collect unique class names from per-image JSON or LabelMe files.
export function collectJsonClassNames(texts: Iterable<string>): string[] {
	const names = new Set<string>();
	for (const text of texts) {
		try {
			const parsed = JSON.parse(text);
			if (parsed.shapes && Array.isArray(parsed.shapes)) {
				// LabelMe format
				for (const s of parsed.shapes) {
					if (s.label) names.add(s.label);
				}
			} else if (Array.isArray(parsed)) {
				// Our JSON format
				for (const e of parsed) {
					if (e.class) names.add(e.class);
				}
			}
		} catch {
			// skip malformed files
		}
	}
	return [...names];
}

// --- Pascal VOC (XML per image) ---

export function collectVocClassNames(texts: Iterable<string>): string[] {
	const names = new Set<string>();
	const parser = new DOMParser();
	for (const text of texts) {
		const doc = parser.parseFromString(text, "text/xml");
		for (const obj of doc.querySelectorAll("object")) {
			const name = obj.querySelector("name")?.textContent;
			if (name) names.add(name);
		}
	}
	return [...names];
}

export function parseVocAnnotation(
	xml: string,
	classByName: Map<string, string>,
): Annotation[] {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xml, "text/xml");

	const sizeEl = doc.querySelector("size");
	const w = parseFloat(sizeEl?.querySelector("width")?.textContent ?? "1");
	const h = parseFloat(sizeEl?.querySelector("height")?.textContent ?? "1");

	const annotations: Annotation[] = [];
	for (const obj of doc.querySelectorAll("object")) {
		const name = obj.querySelector("name")?.textContent ?? "";
		const classId = classByName.get(name) ?? "";

		// Prefer polygon over bndbox.
		const polygonEl = obj.querySelector("polygon");
		if (polygonEl) {
			const pts = polygonEl.querySelectorAll("pt");
			const vertices: Point[] = [];
			for (const pt of pts) {
				let x = parseFloat(pt.querySelector("x")?.textContent ?? "0");
				let y = parseFloat(pt.querySelector("y")?.textContent ?? "0");
				if (w > 1 || h > 1) {
					x /= w;
					y /= h;
				}
				vertices.push({ x, y });
			}
			if (vertices.length >= 3) {
				annotations.push({ id: crypto.randomUUID(), classId, vertices });
			}
		} else {
			// Fall back to bndbox → rectangle polygon.
			const bndbox = obj.querySelector("bndbox");
			if (bndbox) {
				let xmin = parseFloat(
					bndbox.querySelector("xmin")?.textContent ?? "0",
				);
				let ymin = parseFloat(
					bndbox.querySelector("ymin")?.textContent ?? "0",
				);
				let xmax = parseFloat(
					bndbox.querySelector("xmax")?.textContent ?? "0",
				);
				let ymax = parseFloat(
					bndbox.querySelector("ymax")?.textContent ?? "0",
				);
				if (w > 1 || h > 1) {
					xmin /= w;
					ymin /= h;
					xmax /= w;
					ymax /= h;
				}
				annotations.push({
					id: crypto.randomUUID(),
					classId,
					vertices: [
						{ x: xmin, y: ymin },
						{ x: xmax, y: ymin },
						{ x: xmax, y: ymax },
						{ x: xmin, y: ymax },
					],
				});
			}
		}
	}

	return annotations;
}

// --- LabelMe (JSON per image) ---

interface LabelMeShape {
	label: string;
	points: [number, number][];
	shape_type: string;
	flags?: Record<string, boolean>;
}

interface LabelMeData {
	shapes: LabelMeShape[];
	imageWidth?: number;
	imageHeight?: number;
}

export function parseLabelMeAnnotation(
	text: string,
	classByName: Map<string, string>,
): Annotation[] {
	const data: LabelMeData = JSON.parse(text);
	const w = data.imageWidth ?? 1;
	const h = data.imageHeight ?? 1;

	return data.shapes
		.filter((s) => s.shape_type === "polygon" && s.points.length >= 3)
		.map((s) => {
			// Truthy per-shape flags become attribute tags.
			const attributes = normalizeAttributes(s.flags);
			return {
				id: crypto.randomUUID(),
				classId: classByName.get(s.label) ?? "",
				vertices: s.points.map(([x, y]) => ({
					x: w > 1 ? x / w : x,
					y: h > 1 ? y / h : y,
				})),
				...(attributes.length > 0 ? { attributes } : {}),
			};
		});
}

// Detect whether a parsed JSON object is LabelMe format.
export function isLabelMeFormat(parsed: unknown): boolean {
	return (
		typeof parsed === "object" &&
		parsed !== null &&
		"shapes" in parsed &&
		Array.isArray((parsed as { shapes: unknown }).shapes)
	);
}
