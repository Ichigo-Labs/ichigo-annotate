import { describe, expect, it } from "vitest";
import { POLYGON_CLOSE_RADIUS, isClosingTap } from "../../src/utils/polygonUtils";

const triangle = [
	{ x: 0.2, y: 0.2 },
	{ x: 0.6, y: 0.2 },
	{ x: 0.4, y: 0.6 },
];

describe("isClosingTap", () => {
	it("closes when the tap lands on the first of 3+ vertices", () => {
		const tap = { x: 0.2 + POLYGON_CLOSE_RADIUS / 2, y: 0.2 };
		expect(isClosingTap(tap, triangle)).toBe(true);
	});

	it("does not close with fewer than 3 vertices", () => {
		expect(isClosingTap({ x: 0.2, y: 0.2 }, triangle.slice(0, 2))).toBe(false);
	});

	it("does not close when the tap is outside the close radius", () => {
		const tap = { x: 0.2 + POLYGON_CLOSE_RADIUS * 1.5, y: 0.2 };
		expect(isClosingTap(tap, triangle)).toBe(false);
	});

	it("does not close on a vertex other than the first", () => {
		expect(isClosingTap({ x: 0.4, y: 0.6 }, triangle)).toBe(false);
	});
});
