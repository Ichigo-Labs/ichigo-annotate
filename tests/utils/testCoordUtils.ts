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
