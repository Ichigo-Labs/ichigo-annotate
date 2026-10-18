import { describe, expect, it } from "vitest";
import { sortByPaintOrder } from "../../src/utils/paintOrder";
import type { Annotation, AnnotationClass } from "../../src/types/appState";

const classes: AnnotationClass[] = [
	{ id: "c-dialog", name: "Dialog", color: "#ff0000" },
	{ id: "c-subtext", name: "Subtext-box", color: "#00ff00" },
];

const ann = (id: string, classId: string): Annotation => ({
	id,
	classId,
	vertices: [
		{ x: 0.1, y: 0.1 },
		{ x: 0.5, y: 0.1 },
		{ x: 0.3, y: 0.5 },
	],
});

describe("sortByPaintOrder", () => {
	it("moves Subtext-box annotations after the rest, keeping relative order", () => {
		const annotations = [
			ann("sub1", "c-subtext"),
			ann("dialog1", "c-dialog"),
			ann("sub2", "c-subtext"),
			ann("dialog2", "c-dialog"),
		];

		const ordered = sortByPaintOrder(annotations, classes);

		expect(ordered.map((a) => a.id)).toEqual(["dialog1", "dialog2", "sub1", "sub2"]);
	});

	it("matches the Subtext-box class name case-insensitively", () => {
		const typedClasses: AnnotationClass[] = [
			{ id: "c-dialog", name: "Dialog", color: "#ff0000" },
			{ id: "c-typed", name: "subtext-Box", color: "#00ff00" },
		];
		const annotations = [ann("sub", "c-typed"), ann("dialog", "c-dialog")];

		const ordered = sortByPaintOrder(annotations, typedClasses);

		expect(ordered.map((a) => a.id)).toEqual(["dialog", "sub"]);
	});

	it("covers every class carrying the Subtext-box name, including hidden ones", () => {
		const withHidden: AnnotationClass[] = [
			...classes,
			{ id: "c-subtext-old", name: "Subtext-box", color: "#0000ff", hidden: true },
		];
		const annotations = [ann("old-sub", "c-subtext-old"), ann("dialog", "c-dialog")];

		const ordered = sortByPaintOrder(annotations, withHidden);

		expect(ordered.map((a) => a.id)).toEqual(["dialog", "old-sub"]);
	});

	it("returns the input untouched when there is no Subtext-box class", () => {
		const annotations = [ann("a", "c-dialog"), ann("b", "c-dialog")];

		const ordered = sortByPaintOrder(annotations, [classes[0]!]);

		expect(ordered).toBe(annotations);
	});
});
