import { describe, expect, it } from "vitest";
import {
	clampPoint,
	distanceBetween,
	generateDistinctColor,
	isPolygonClosed,
	nearestVertexIndex,
	pointInPolygon,
	polygonBoundingBox,
	translatePolygon,
} from "../../src/utils/areaUtils";

describe("distanceBetween", () => {
	it("returns 0 for identical points", () => {
		expect(distanceBetween({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toBe(0);
	});

	it("calculates correct distance", () => {
		expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
	});
});

describe("isPolygonClosed", () => {
	it("returns false for fewer than 3 points", () => {
		expect(isPolygonClosed([{ x: 0, y: 0 }, { x: 0, y: 0 }], 0.05)).toBe(
			false,
		);
	});

	it("returns true when last point is near first", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
			{ x: 0.01, y: 0.01 },
		];
		expect(isPolygonClosed(pts, 0.02)).toBe(true);
	});

	it("returns false when last point is far from first", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
			{ x: 0.5, y: 0.5 },
		];
		expect(isPolygonClosed(pts, 0.02)).toBe(false);
	});
});

describe("pointInPolygon", () => {
	const triangle = [
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: 0.5, y: 1 },
	];

	it("returns true for a point inside", () => {
		expect(pointInPolygon({ x: 0.5, y: 0.3 }, triangle)).toBe(true);
	});

	it("returns false for a point outside", () => {
		expect(pointInPolygon({ x: 0, y: 1 }, triangle)).toBe(false);
	});
});

describe("polygonBoundingBox", () => {
	it("computes the correct bounding box", () => {
		const poly = [
			{ x: 0.2, y: 0.3 },
			{ x: 0.8, y: 0.1 },
			{ x: 0.5, y: 0.9 },
		];
		const bb = polygonBoundingBox(poly);
		expect(bb.minX).toBeCloseTo(0.2);
		expect(bb.minY).toBeCloseTo(0.1);
		expect(bb.maxX).toBeCloseTo(0.8);
		expect(bb.maxY).toBeCloseTo(0.9);
	});
});

describe("clampPoint", () => {
	it("leaves values in range unchanged", () => {
		expect(clampPoint({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
	});

	it("clamps values outside [0,1]", () => {
		expect(clampPoint({ x: -0.1, y: 1.5 })).toEqual({ x: 0, y: 1 });
	});
});

describe("translatePolygon", () => {
	it("shifts all vertices by delta", () => {
		const poly = [
			{ x: 0.2, y: 0.3 },
			{ x: 0.4, y: 0.5 },
		];
		const result = translatePolygon(poly, { x: 0.1, y: 0.1 });
		expect(result[0]!.x).toBeCloseTo(0.3);
		expect(result[0]!.y).toBeCloseTo(0.4);
		expect(result[1]!.x).toBeCloseTo(0.5);
		expect(result[1]!.y).toBeCloseTo(0.6);
	});

	it("clamps vertices to [0,1]", () => {
		const poly = [{ x: 0.9, y: 0.9 }];
		const result = translatePolygon(poly, { x: 0.2, y: 0.2 });
		expect(result[0]).toEqual({ x: 1, y: 1 });
	});
});

describe("nearestVertexIndex", () => {
	const poly = [
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: 1, y: 1 },
	];

	it("returns index of nearest vertex within threshold", () => {
		expect(nearestVertexIndex({ x: 0.98, y: 0.02 }, poly, 0.05)).toBe(1);
	});

	it("returns null when no vertex is within threshold", () => {
		expect(nearestVertexIndex({ x: 0.5, y: 0.5 }, poly, 0.05)).toBeNull();
	});
});

describe("generateDistinctColor", () => {
	it("returns a valid hex color", () => {
		const color = generateDistinctColor([]);
		expect(color).toMatch(/^#[0-9a-f]{6}$/);
	});

	it("returns a color distinct from existing ones", () => {
		const existing = ["#ff0000", "#00ff00", "#0000ff"];
		const color = generateDistinctColor(existing);
		expect(color).toMatch(/^#[0-9a-f]{6}$/);
		expect(existing).not.toContain(color);
	});
});
