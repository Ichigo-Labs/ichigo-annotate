import { describe, expect, it } from "vitest";
import { toCocoFormat, toYoloFormat } from "../../src/utils/exportUtils";
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
