import { describe, expect, it } from "vitest";
import type { AnnotationClass } from "../../src/types/appState";
import {
	collectJsonClassNames,
	collectVocClassNames,
	detectYoloMaxIndex,
	isLabelMeFormat,
	parseCocoAnnotations,
	parseJsonAnnotation,
	parseLabelMeAnnotation,
	parseVocAnnotation,
	parseYoloAnnotation,
	parseYoloClasses,
	resolveClasses,
} from "../../src/utils/importUtils";
import type { CocoData } from "../../src/utils/importUtils";

// --- resolveClasses ---

describe("resolveClasses", () => {
	const existing: AnnotationClass[] = [
		{ id: "c1", name: "cat", color: "#ff0000" },
	];

	it("reuses existing class by name", () => {
		const { classMap, newClasses, allClasses } = resolveClasses(
			[{ key: 0, name: "cat" }],
			existing,
		);
		expect(classMap.get(0)).toBe("c1");
		expect(newClasses).toHaveLength(0);
		expect(allClasses).toHaveLength(1);
		expect(allClasses[0]!.id).toBe("c1");
	});

	it("creates new class for unknown name", () => {
		const { classMap, newClasses, allClasses } = resolveClasses(
			[{ key: 0, name: "dog" }],
			existing,
		);
		expect(classMap.get(0)).toBeDefined();
		expect(classMap.get(0)).not.toBe("c1");
		expect(newClasses).toHaveLength(1);
		expect(newClasses[0]!.name).toBe("dog");
		expect(allClasses).toHaveLength(1);
		expect(allClasses[0]!.name).toBe("dog");
	});

	it("handles mixed existing and new", () => {
		const { classMap, newClasses, allClasses } = resolveClasses(
			[
				{ key: 0, name: "cat" },
				{ key: 1, name: "dog" },
			],
			existing,
		);
		expect(classMap.get(0)).toBe("c1");
		expect(newClasses).toHaveLength(1);
		expect(newClasses[0]!.name).toBe("dog");
		expect(classMap.get(1)).toBe(newClasses[0]!.id);
		expect(allClasses).toHaveLength(2);
		expect(allClasses.map((c) => c.name)).toEqual(["cat", "dog"]);
	});

	it("skips hidden classes", () => {
		const withHidden: AnnotationClass[] = [
			{ id: "c1", name: "cat", color: "#ff0000", hidden: true },
		];
		const { newClasses } = resolveClasses(
			[{ key: 0, name: "cat" }],
			withHidden,
		);
		expect(newClasses).toHaveLength(1);
	});

	it("deduplicates within the same import", () => {
		const { newClasses } = resolveClasses(
			[
				{ key: 0, name: "dog" },
				{ key: 1, name: "dog" },
			],
			[],
		);
		expect(newClasses).toHaveLength(1);
	});
});

// --- YOLO ---

describe("parseYoloClasses", () => {
	it("parses class names from text", () => {
		expect(parseYoloClasses("cat\ndog\n")).toEqual(["cat", "dog"]);
	});

	it("trims whitespace and skips empty lines", () => {
		expect(parseYoloClasses("  cat \n\n  dog  \n")).toEqual(["cat", "dog"]);
	});
});

describe("detectYoloMaxIndex", () => {
	it("finds highest class index across texts", () => {
		const texts = [
			"0 0.1 0.2 0.3 0.4 0.5 0.6",
			"2 0.1 0.2 0.3 0.4 0.5 0.6",
		];
		expect(detectYoloMaxIndex(texts)).toBe(2);
	});

	it("returns -1 for empty input", () => {
		expect(detectYoloMaxIndex([])).toBe(-1);
	});
});

describe("parseYoloAnnotation", () => {
	const classMap = new Map([
		[0, "cat-id"],
		[1, "dog-id"],
	]);

	it("parses a single annotation line", () => {
		const anns = parseYoloAnnotation(
			"0 0.1 0.2 0.3 0.2 0.3 0.4",
			classMap,
		);
		expect(anns).toHaveLength(1);
		expect(anns[0]!.classId).toBe("cat-id");
		expect(anns[0]!.vertices).toHaveLength(3);
		expect(anns[0]!.vertices[0]).toEqual({ x: 0.1, y: 0.2 });
	});

	it("parses multiple lines", () => {
		const text = "0 0.1 0.2 0.3 0.2 0.3 0.4\n1 0.5 0.6 0.7 0.6 0.7 0.8";
		const anns = parseYoloAnnotation(text, classMap);
		expect(anns).toHaveLength(2);
		expect(anns[1]!.classId).toBe("dog-id");
	});

	it("skips lines with fewer than 3 vertices", () => {
		const anns = parseYoloAnnotation("0 0.1 0.2 0.3 0.4", classMap);
		expect(anns).toHaveLength(0);
	});

	it("skips empty lines", () => {
		const anns = parseYoloAnnotation(
			"\n0 0.1 0.2 0.3 0.2 0.3 0.4\n\n",
			classMap,
		);
		expect(anns).toHaveLength(1);
	});

	it("generates unique ids", () => {
		const text = "0 0.1 0.2 0.3 0.2 0.3 0.4\n0 0.1 0.2 0.3 0.2 0.3 0.4";
		const anns = parseYoloAnnotation(text, classMap);
		expect(anns[0]!.id).not.toBe(anns[1]!.id);
	});
});

// --- COCO ---

describe("parseCocoAnnotations", () => {
	const classMap = new Map([[0, "cat-id"]]);

	it("parses annotations matched to image base names", () => {
		const data: CocoData = {
			images: [{ id: 0, file_name: "img.png" }],
			annotations: [
				{
					image_id: 0,
					category_id: 0,
					segmentation: [[0.1, 0.2, 0.3, 0.2, 0.3, 0.4]],
				},
			],
			categories: [{ id: 0, name: "cat" }],
		};
		const result = parseCocoAnnotations(data, classMap);
		expect(result.get("img")).toHaveLength(1);
		expect(result.get("img")![0]!.vertices).toHaveLength(3);
	});

	it("normalizes pixel coordinates using image dimensions", () => {
		const data: CocoData = {
			images: [{ id: 0, file_name: "img.png", width: 100, height: 200 }],
			annotations: [
				{
					image_id: 0,
					category_id: 0,
					segmentation: [[10, 40, 30, 40, 30, 80]],
				},
			],
			categories: [{ id: 0, name: "cat" }],
		};
		const result = parseCocoAnnotations(data, classMap);
		const v = result.get("img")![0]!.vertices;
		expect(v[0]!.x).toBeCloseTo(0.1);
		expect(v[0]!.y).toBeCloseTo(0.2);
	});

	it("skips annotations with unknown image_id", () => {
		const data: CocoData = {
			images: [{ id: 0, file_name: "img.png" }],
			annotations: [
				{
					image_id: 99,
					category_id: 0,
					segmentation: [[0.1, 0.2, 0.3, 0.2, 0.3, 0.4]],
				},
			],
			categories: [{ id: 0, name: "cat" }],
		};
		const result = parseCocoAnnotations(data, classMap);
		expect(result.size).toBe(0);
	});

	it("skips segmentations with fewer than 3 vertices", () => {
		const data: CocoData = {
			images: [{ id: 0, file_name: "img.png" }],
			annotations: [
				{
					image_id: 0,
					category_id: 0,
					segmentation: [[0.1, 0.2, 0.3, 0.4]],
				},
			],
			categories: [{ id: 0, name: "cat" }],
		};
		const result = parseCocoAnnotations(data, classMap);
		expect(result.size).toBe(0);
	});
});

// --- Per-image JSON ---

describe("parseJsonAnnotation", () => {
	const classByName = new Map([["cat", "cat-id"]]);

	it("parses annotation array", () => {
		const text = JSON.stringify([
			{
				class: "cat",
				vertices: [
					[0.1, 0.2],
					[0.3, 0.2],
					[0.3, 0.4],
				],
			},
		]);
		const anns = parseJsonAnnotation(text, classByName);
		expect(anns).toHaveLength(1);
		expect(anns[0]!.classId).toBe("cat-id");
		expect(anns[0]!.vertices).toHaveLength(3);
	});

	it("skips entries with fewer than 3 vertices", () => {
		const text = JSON.stringify([
			{
				class: "cat",
				vertices: [
					[0.1, 0.2],
					[0.3, 0.4],
				],
			},
		]);
		expect(parseJsonAnnotation(text, classByName)).toHaveLength(0);
	});
});

describe("collectJsonClassNames", () => {
	it("collects from our JSON format", () => {
		const texts = [JSON.stringify([{ class: "cat", vertices: [] }])];
		expect(collectJsonClassNames(texts)).toEqual(["cat"]);
	});

	it("collects from LabelMe format", () => {
		const texts = [
			JSON.stringify({ shapes: [{ label: "dog", points: [], shape_type: "polygon" }] }),
		];
		expect(collectJsonClassNames(texts)).toEqual(["dog"]);
	});

	it("deduplicates across files", () => {
		const texts = [
			JSON.stringify([{ class: "cat", vertices: [] }]),
			JSON.stringify([{ class: "cat", vertices: [] }]),
		];
		expect(collectJsonClassNames(texts)).toEqual(["cat"]);
	});

	it("skips malformed files", () => {
		expect(collectJsonClassNames(["not json"])).toEqual([]);
	});
});

// --- Pascal VOC ---

describe("collectVocClassNames", () => {
	it("collects class names from XML", () => {
		const xml = `<annotation>
			<object><name>cat</name></object>
			<object><name>dog</name></object>
		</annotation>`;
		expect(collectVocClassNames([xml]).sort()).toEqual(["cat", "dog"]);
	});

	it("deduplicates names", () => {
		const xml = `<annotation>
			<object><name>cat</name></object>
			<object><name>cat</name></object>
		</annotation>`;
		expect(collectVocClassNames([xml])).toEqual(["cat"]);
	});
});

describe("parseVocAnnotation", () => {
	const classByName = new Map([["cat", "cat-id"]]);

	it("parses polygon elements", () => {
		const xml = `<annotation>
			<size><width>1</width><height>1</height></size>
			<object>
				<name>cat</name>
				<polygon>
					<pt><x>0.1</x><y>0.2</y></pt>
					<pt><x>0.3</x><y>0.2</y></pt>
					<pt><x>0.3</x><y>0.4</y></pt>
				</polygon>
			</object>
		</annotation>`;
		const anns = parseVocAnnotation(xml, classByName);
		expect(anns).toHaveLength(1);
		expect(anns[0]!.classId).toBe("cat-id");
		expect(anns[0]!.vertices).toHaveLength(3);
		expect(anns[0]!.vertices[0]).toEqual({ x: 0.1, y: 0.2 });
	});

	it("falls back to bndbox as rectangle polygon", () => {
		const xml = `<annotation>
			<size><width>1</width><height>1</height></size>
			<object>
				<name>cat</name>
				<bndbox>
					<xmin>0.1</xmin><ymin>0.2</ymin>
					<xmax>0.3</xmax><ymax>0.4</ymax>
				</bndbox>
			</object>
		</annotation>`;
		const anns = parseVocAnnotation(xml, classByName);
		expect(anns).toHaveLength(1);
		expect(anns[0]!.vertices).toHaveLength(4);
		expect(anns[0]!.vertices[0]).toEqual({ x: 0.1, y: 0.2 });
		expect(anns[0]!.vertices[2]).toEqual({ x: 0.3, y: 0.4 });
	});

	it("normalizes pixel coordinates using size", () => {
		const xml = `<annotation>
			<size><width>100</width><height>200</height></size>
			<object>
				<name>cat</name>
				<polygon>
					<pt><x>10</x><y>40</y></pt>
					<pt><x>30</x><y>40</y></pt>
					<pt><x>30</x><y>80</y></pt>
				</polygon>
			</object>
		</annotation>`;
		const anns = parseVocAnnotation(xml, classByName);
		expect(anns[0]!.vertices[0]!.x).toBeCloseTo(0.1);
		expect(anns[0]!.vertices[0]!.y).toBeCloseTo(0.2);
	});

	it("prefers polygon over bndbox when both present", () => {
		const xml = `<annotation>
			<size><width>1</width><height>1</height></size>
			<object>
				<name>cat</name>
				<bndbox>
					<xmin>0</xmin><ymin>0</ymin>
					<xmax>1</xmax><ymax>1</ymax>
				</bndbox>
				<polygon>
					<pt><x>0.1</x><y>0.2</y></pt>
					<pt><x>0.3</x><y>0.2</y></pt>
					<pt><x>0.3</x><y>0.4</y></pt>
				</polygon>
			</object>
		</annotation>`;
		const anns = parseVocAnnotation(xml, classByName);
		expect(anns).toHaveLength(1);
		// Should use the polygon (3 vertices), not the bndbox (4 vertices).
		expect(anns[0]!.vertices).toHaveLength(3);
	});

	it("skips polygons with fewer than 3 points", () => {
		const xml = `<annotation>
			<size><width>1</width><height>1</height></size>
			<object>
				<name>cat</name>
				<polygon>
					<pt><x>0.1</x><y>0.2</y></pt>
					<pt><x>0.3</x><y>0.2</y></pt>
				</polygon>
			</object>
		</annotation>`;
		const anns = parseVocAnnotation(xml, classByName);
		expect(anns).toHaveLength(0);
	});
});

// --- LabelMe ---

describe("parseLabelMeAnnotation", () => {
	const classByName = new Map([["cat", "cat-id"]]);

	it("parses polygon shapes", () => {
		const text = JSON.stringify({
			shapes: [
				{
					label: "cat",
					points: [
						[0.1, 0.2],
						[0.3, 0.2],
						[0.3, 0.4],
					],
					shape_type: "polygon",
				},
			],
			imageWidth: 1,
			imageHeight: 1,
		});
		const anns = parseLabelMeAnnotation(text, classByName);
		expect(anns).toHaveLength(1);
		expect(anns[0]!.classId).toBe("cat-id");
		expect(anns[0]!.vertices).toEqual([
			{ x: 0.1, y: 0.2 },
			{ x: 0.3, y: 0.2 },
			{ x: 0.3, y: 0.4 },
		]);
	});

	it("normalizes pixel coordinates", () => {
		const text = JSON.stringify({
			shapes: [
				{
					label: "cat",
					points: [
						[10, 40],
						[30, 40],
						[30, 80],
					],
					shape_type: "polygon",
				},
			],
			imageWidth: 100,
			imageHeight: 200,
		});
		const anns = parseLabelMeAnnotation(text, classByName);
		expect(anns[0]!.vertices[0]!.x).toBeCloseTo(0.1);
		expect(anns[0]!.vertices[0]!.y).toBeCloseTo(0.2);
	});

	it("skips non-polygon shapes", () => {
		const text = JSON.stringify({
			shapes: [
				{
					label: "cat",
					points: [
						[0.1, 0.2],
						[0.3, 0.4],
					],
					shape_type: "rectangle",
				},
			],
		});
		const anns = parseLabelMeAnnotation(text, classByName);
		expect(anns).toHaveLength(0);
	});

	it("skips shapes with fewer than 3 points", () => {
		const text = JSON.stringify({
			shapes: [
				{
					label: "cat",
					points: [
						[0.1, 0.2],
						[0.3, 0.4],
					],
					shape_type: "polygon",
				},
			],
		});
		const anns = parseLabelMeAnnotation(text, classByName);
		expect(anns).toHaveLength(0);
	});
});

describe("isLabelMeFormat", () => {
	it("returns true for LabelMe objects", () => {
		expect(isLabelMeFormat({ shapes: [] })).toBe(true);
	});

	it("returns false for arrays (our JSON format)", () => {
		expect(isLabelMeFormat([{ class: "cat" }])).toBe(false);
	});

	it("returns false for null", () => {
		expect(isLabelMeFormat(null)).toBe(false);
	});
});
