import { describe, expect, it } from "vitest";
import {
	toCocoFormat,
	toJsonFormat,
	toLabelMeFormat,
	toVocFormat,
	toYoloFormat,
} from "../../src/utils/exportUtils";
import type {
	Annotation,
	AnnotationClass,
	ImageFile,
} from "../../src/types/appState";

const classes: AnnotationClass[] = [
	{ id: "c1", name: "cat", color: "#ff0000" },
	{ id: "c2", name: "dog", color: "#00ff00" },
];

const annotation: Annotation = {
	id: "a1",
	classId: "c1",
	vertices: [
		{ x: 0.1, y: 0.2 },
		{ x: 0.3, y: 0.2 },
		{ x: 0.3, y: 0.4 },
	],
};

describe("toYoloFormat", () => {
	it("formats a single annotation", () => {
		const result = toYoloFormat([annotation], classes);
		expect(result).toBe("0 0.100000 0.200000 0.300000 0.200000 0.300000 0.400000");
	});

	it("uses correct class index for second class", () => {
		const ann2: Annotation = { ...annotation, classId: "c2" };
		const result = toYoloFormat([ann2], classes);
		expect(result.startsWith("1 ")).toBe(true);
	});

	it("joins multiple annotations with newlines", () => {
		const result = toYoloFormat([annotation, annotation], classes);
		expect(result.split("\n")).toHaveLength(2);
	});
});

describe("toCocoFormat", () => {
	it("builds valid COCO structure", () => {
		const files: ImageFile[] = [
			{
				id: "f1",
				name: "img1.png",
				dataUrl: "",
				thumbnailDataUrl: "",
				annotations: [annotation],
			},
			{
				id: "f2",
				name: "img2.png",
				dataUrl: "",
				thumbnailDataUrl: "",
				annotations: [],
			},
		];

		const result = toCocoFormat(files, classes) as {
			images: object[];
			annotations: object[];
			categories: object[];
		};

		expect(result.images).toHaveLength(2);
		expect(result.annotations).toHaveLength(1);
		expect(result.categories).toHaveLength(2);
	});
});

describe("toJsonFormat", () => {
	it("produces a JSON array of annotations", () => {
		const result = JSON.parse(toJsonFormat([annotation], classes));
		expect(result).toHaveLength(1);
		expect(result[0].class).toBe("cat");
		expect(result[0].vertices).toHaveLength(3);
		expect(result[0].vertices[0]).toEqual([0.1, 0.2]);
	});

	it("returns empty array for no annotations", () => {
		expect(JSON.parse(toJsonFormat([], classes))).toEqual([]);
	});
});

describe("toVocFormat", () => {
	it("produces valid XML with polygon and bndbox", () => {
		const xml = toVocFormat("img.png", [annotation], classes);
		expect(xml).toContain("<filename>img.png</filename>");
		expect(xml).toContain("<name>cat</name>");
		expect(xml).toContain("<polygon>");
		expect(xml).toContain("<bndbox>");
		expect(xml).toContain("<xmin>0.100000</xmin>");
		// 3 polygon points
		expect((xml.match(/<pt>/g) ?? []).length).toBe(3);
	});

	it("escapes special characters in filename", () => {
		const xml = toVocFormat("img<1>.png", [annotation], classes);
		expect(xml).toContain("img&lt;1&gt;.png");
	});

	it("returns annotation wrapper with no objects when empty", () => {
		const xml = toVocFormat("img.png", [], classes);
		expect(xml).toContain("<annotation>");
		expect(xml).not.toContain("<object>");
	});
});

describe("toLabelMeFormat", () => {
	it("produces valid LabelMe JSON", () => {
		const result = JSON.parse(toLabelMeFormat("img.png", [annotation], classes));
		expect(result.version).toBe("5.0.0");
		expect(result.imagePath).toBe("img.png");
		expect(result.shapes).toHaveLength(1);
		expect(result.shapes[0].label).toBe("cat");
		expect(result.shapes[0].shape_type).toBe("polygon");
		expect(result.shapes[0].points).toHaveLength(3);
		expect(result.shapes[0].points[0]).toEqual([0.1, 0.2]);
	});

	it("sets imageWidth and imageHeight to 1 (normalized)", () => {
		const result = JSON.parse(toLabelMeFormat("img.png", [], classes));
		expect(result.imageWidth).toBe(1);
		expect(result.imageHeight).toBe(1);
	});
});

// --- Attributes ---

describe("attribute export", () => {
	const attrAnnotation: Annotation = {
		id: "a2",
		classId: "c1",
		vertices: [
			{ x: 0.1, y: 0.2 },
			{ x: 0.3, y: 0.2 },
			{ x: 0.3, y: 0.4 },
		],
		attributes: ["italic", "handwritten"],
	};
	const files: ImageFile[] = [
		{
			id: "f1",
			name: "img1.png",
			dataUrl: "",
			thumbnailDataUrl: "",
			annotations: [attrAnnotation, annotation],
		},
	];

	it("JSON format includes attributes per annotation", () => {
		const parsed = JSON.parse(toJsonFormat([attrAnnotation, annotation], classes));
		expect(parsed[0].attributes).toEqual(["italic", "handwritten"]);
		expect(parsed[1].attributes).toEqual([]);
	});

	it("COCO format declares the vocabulary and per-annotation attributes", () => {
		const coco = toCocoFormat(files, classes, ["italic", "bold", "handwritten"]) as {
			attributes: { id: number; name: string }[];
			annotations: { attributes: string[] }[];
		};
		expect(coco.attributes).toEqual([
			{ id: 1, name: "italic" },
			{ id: 2, name: "bold" },
			{ id: 3, name: "handwritten" },
		]);
		expect(coco.annotations[0]!.attributes).toEqual(["italic", "handwritten"]);
		expect(coco.annotations[1]!.attributes).toEqual([]);
	});

	it("COCO format scales to pixels when image dims are known", () => {
		const dims = new Map([["f1", { w: 200, h: 100 }]]);
		const coco = toCocoFormat(files, classes, [], dims) as {
			images: { width?: number; height?: number }[];
			annotations: { bbox: number[]; segmentation: number[][]; area: number }[];
		};
		expect(coco.images[0]).toMatchObject({ width: 200, height: 100 });
		expect(coco.annotations[0]!.bbox).toEqual([
			0.1 * 200,
			0.2 * 100,
			0.2 * 200,
			0.2 * 100,
		]);
		expect(coco.annotations[0]!.segmentation[0]).toEqual([
			0.1 * 200, 0.2 * 100,
			0.3 * 200, 0.2 * 100,
			0.3 * 200, 0.4 * 100,
		]);
		expect(coco.annotations[0]!.area).toBeCloseTo(0.2 * 200 * 0.2 * 100);
	});

	it("COCO format stays normalized without dims", () => {
		const coco = toCocoFormat(files, classes) as {
			images: { width?: number }[];
			annotations: { bbox: number[] }[];
		};
		expect(coco.images[0]!.width).toBeUndefined();
		expect(coco.annotations[0]!.bbox[0]).toBeCloseTo(0.1);
	});

	it("LabelMe format writes vocabulary flags with per-shape state", () => {
		const parsed = JSON.parse(
			toLabelMeFormat("img1.png", [attrAnnotation, annotation], classes, [
				"italic",
				"bold",
			]),
		);
		expect(parsed.shapes[0].flags).toEqual({
			italic: true,
			bold: false,
			handwritten: true, // on the annotation even though not in the vocab
		});
		expect(parsed.shapes[1].flags).toEqual({ italic: false, bold: false });
	});
});
