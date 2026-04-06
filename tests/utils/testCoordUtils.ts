import { describe, expect, it } from "vitest";
import {
	normalizedToScreen,
	screenToNormalized,
} from "../../src/utils/coordUtils";

const rect = { left: 50, top: 50, width: 200, height: 100 };

describe("screenToNormalized", () => {
	it("converts center of image to (0.5, 0.5)", () => {
		const result = screenToNormalized(150, 100, rect);
		expect(result).toEqual({ x: 0.5, y: 0.5 });
	});

	it("converts top-left to (0, 0)", () => {
		const result = screenToNormalized(50, 50, rect);
		expect(result).toEqual({ x: 0, y: 0 });
	});

	it("returns null for point outside image", () => {
		expect(screenToNormalized(10, 10, rect)).toBeNull();
		expect(screenToNormalized(300, 200, rect)).toBeNull();
	});
});

describe("normalizedToScreen", () => {
	it("converts (0.5, 0.5) to center of rect", () => {
		const result = normalizedToScreen({ x: 0.5, y: 0.5 }, rect);
		expect(result).toEqual({ x: 150, y: 100 });
	});

	it("converts (0, 0) to top-left of rect", () => {
		const result = normalizedToScreen({ x: 0, y: 0 }, rect);
		expect(result).toEqual({ x: 50, y: 50 });
	});
});

describe("round-trip", () => {
	it("screenToNormalized then normalizedToScreen returns original", () => {
		const screenX = 130;
		const screenY = 80;
		const normalized = screenToNormalized(screenX, screenY, rect)!;
		const back = normalizedToScreen(normalized, rect);
		expect(back.x).toBeCloseTo(screenX);
		expect(back.y).toBeCloseTo(screenY);
	});
});

// These tests verify that normalization works correctly when the
// canvas fills the full available space (image stretched to fit).

describe("wide container (landscape stretch)", () => {
	const wide = { left: 0, top: 0, width: 1000, height: 200 };

	it("normalizes corners to 0 and 1", () => {
		expect(screenToNormalized(0, 0, wide)).toEqual({ x: 0, y: 0 });
		expect(screenToNormalized(1000, 200, wide)).toEqual({ x: 1, y: 1 });
	});

	it("normalizes center correctly", () => {
		expect(screenToNormalized(500, 100, wide)).toEqual({ x: 0.5, y: 0.5 });
	});

	it("round-trips through non-square rect", () => {
		const p = screenToNormalized(750, 50, wide)!;
		const back = normalizedToScreen(p, wide);
		expect(back.x).toBeCloseTo(750);
		expect(back.y).toBeCloseTo(50);
	});
});

describe("tall container (portrait stretch)", () => {
	const tall = { left: 0, top: 0, width: 200, height: 1000 };

	it("normalizes corners to 0 and 1", () => {
		expect(screenToNormalized(0, 0, tall)).toEqual({ x: 0, y: 0 });
		expect(screenToNormalized(200, 1000, tall)).toEqual({ x: 1, y: 1 });
	});

	it("normalizes center correctly", () => {
		expect(screenToNormalized(100, 500, tall)).toEqual({ x: 0.5, y: 0.5 });
	});

	it("round-trips through non-square rect", () => {
		const p = screenToNormalized(40, 800, tall)!;
		const back = normalizedToScreen(p, tall);
		expect(back.x).toBeCloseTo(40);
		expect(back.y).toBeCloseTo(800);
	});
});

describe("offset container", () => {
	const offset = { left: 300, top: 100, width: 400, height: 300 };

	it("accounts for left/top offset", () => {
		expect(screenToNormalized(300, 100, offset)).toEqual({ x: 0, y: 0 });
		expect(screenToNormalized(500, 250, offset)).toEqual({ x: 0.5, y: 0.5 });
	});

	it("rejects points outside the offset rect", () => {
		expect(screenToNormalized(200, 100, offset)).toBeNull();
		expect(screenToNormalized(300, 50, offset)).toBeNull();
	});
});
