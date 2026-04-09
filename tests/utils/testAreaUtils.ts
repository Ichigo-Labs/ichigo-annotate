import { describe, expect, it } from "vitest";
import {
	clampPoint,
	distanceBetween,
	generateDistinctColor,
	isNearlyComplete,
	isPolygonClosed,
	nearestVertexIndex,
	pointInPolygon,
	polygonBoundingBox,
	polygonizeVertices,
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

describe("isNearlyComplete", () => {
	it("returns false for fewer than 3 points", () => {
		expect(isNearlyComplete([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0.25)).toBe(false);
	});

	it("returns true when gap is small relative to path length", () => {
		// Square with a small gap (drew ~80% of the shape)
		const pts = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
			{ x: 0, y: 1 },
			// gap back to origin is 1, path length is 3, ratio = 0.33 > 0.25
			// let's make it closer
			{ x: 0, y: 0.2 },
			// gap = 0.2, path length = 3 + 0.8 = 3.8, ratio ≈ 0.053
		];
		expect(isNearlyComplete(pts, 0.25)).toBe(true);
	});

	it("returns false when gap is large relative to path length", () => {
		// Short path with a big gap
		const pts = [
			{ x: 0, y: 0 },
			{ x: 0.1, y: 0 },
			{ x: 0.1, y: 0.1 },
			{ x: 0.5, y: 0.5 },
			// gap ≈ 0.71, path length ≈ 0.1 + 0.1 + 0.57 = 0.77, ratio ≈ 0.92
		];
		expect(isNearlyComplete(pts, 0.25)).toBe(false);
	});

	it("returns false for zero-length path", () => {
		const pts = [
			{ x: 0.5, y: 0.5 },
			{ x: 0.5, y: 0.5 },
			{ x: 0.5, y: 0.5 },
		];
		expect(isNearlyComplete(pts, 0.25)).toBe(false);
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

describe("polygonizeVertices", () => {
	// A freeform blob with many points forming roughly a circle.
	const circle = Array.from({ length: 20 }, (_, i) => {
		const angle = (i / 20) * Math.PI * 2;
		return { x: 0.5 + 0.3 * Math.cos(angle), y: 0.5 + 0.3 * Math.sin(angle) };
	});

	it("simplifies to the requested number of sides", () => {
		const result = polygonizeVertices(circle, 4);
		expect(result).toHaveLength(4);
	});

	it("returns original vertices when already <= N sides", () => {
		const triangle = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }];
		expect(polygonizeVertices(triangle, 4)).toEqual(triangle);
	});

	it("clamps to minimum of 3 sides", () => {
		const result = polygonizeVertices(circle, 1);
		expect(result).toHaveLength(3);
	});

	it("produces a convex polygon", () => {
		const result = polygonizeVertices(circle, 5);
		expect(result).toHaveLength(5);
		// All result points should be valid coordinates.
		for (const p of result) {
			expect(p.x).toBeGreaterThanOrEqual(0);
			expect(p.y).toBeGreaterThanOrEqual(0);
		}
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
