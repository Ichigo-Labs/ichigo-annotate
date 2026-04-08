import { describe, expect, it } from "vitest";
import { floodFillCore } from "../../src/utils/floodFillUtils";

// --- Test image helpers ---

function createGray(width: number, height: number, fill = 255): Uint8Array {
	const data = new Uint8Array(width * height);
	data.fill(fill);
	return data;
}

function drawRect(
	data: Uint8Array,
	width: number,
	x: number,
	y: number,
	w: number,
	h: number,
	color: number,
): void {
	for (let dy = 0; dy < h; dy++) {
		for (let dx = 0; dx < w; dx++) {
			const px = x + dx;
			const py = y + dy;
			if (px >= 0 && px < width && py >= 0 && py < (data.length / width)) {
				data[py * width + px] = color;
			}
		}
	}
}

function drawRectBorder(
	data: Uint8Array,
	width: number,
	x: number,
	y: number,
	w: number,
	h: number,
	thickness: number,
	color: number,
): void {
	// Top
	drawRect(data, width, x, y, w, thickness, color);
	// Bottom
	drawRect(data, width, x, y + h - thickness, w, thickness, color);
	// Left
	drawRect(data, width, x, y, thickness, h, color);
	// Right
	drawRect(data, width, x + w - thickness, y, thickness, h, color);
}

// --- Tests ---

describe("floodFillCore", () => {
	it("fills a closed rectangle and returns a polygon", () => {
		const W = 100;
		const H = 100;
		const gray = createGray(W, H, 255);

		// Draw a 3px thick black border rectangle from (15,15) to (84,84).
		drawRectBorder(gray, W, 15, 15, 70, 70, 3, 0);

		// Click in the center of the rectangle interior.
		const result = floodFillCore(gray, W, H, 50, 50);

		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(4);

		// All vertices should be within the rectangle bounds (normalized).
		for (const p of result!) {
			expect(p.x).toBeGreaterThan(15 / W);
			expect(p.x).toBeLessThan(85 / W);
			expect(p.y).toBeGreaterThan(15 / H);
			expect(p.y).toBeLessThan(85 / H);
		}
	});

	it("returns null when clicking on a wall pixel", () => {
		const W = 100;
		const H = 100;
		const gray = createGray(W, H, 255);
		drawRectBorder(gray, W, 15, 15, 70, 70, 3, 0);

		// Click on the border itself.
		const result = floodFillCore(gray, W, H, 15, 15);
		expect(result).toBeNull();
	});

	it("fills a rectangle that has text-like obstacles inside", () => {
		const W = 200;
		const H = 200;
		const gray = createGray(W, H, 255);

		// Outer border.
		drawRectBorder(gray, W, 20, 20, 160, 160, 3, 0);

		// Simulate text: several small dark rectangles inside the bubble.
		// These should NOT block the flood fill since we don't dilate.
		drawRect(gray, W, 60, 50, 15, 20, 0);
		drawRect(gray, W, 90, 50, 15, 20, 0);
		drawRect(gray, W, 120, 50, 15, 20, 0);
		drawRect(gray, W, 60, 90, 15, 20, 0);
		drawRect(gray, W, 90, 90, 15, 20, 0);
		drawRect(gray, W, 120, 90, 15, 20, 0);
		drawRect(gray, W, 60, 130, 15, 20, 0);
		drawRect(gray, W, 90, 130, 15, 20, 0);
		drawRect(gray, W, 120, 130, 15, 20, 0);

		// Click in white space between text blocks.
		const result = floodFillCore(gray, W, H, 40, 100);

		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(4);

		// Polygon should roughly cover the full rectangle interior.
		const xs = result!.map((p) => p.x);
		const ys = result!.map((p) => p.y);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);

		// Should span most of the rectangle (allowing for inner padding erosion).
		expect(maxX - minX).toBeGreaterThan(0.5);
		expect(maxY - minY).toBeGreaterThan(0.5);
	});

	it("handles a partially-open bubble via morphological opening", () => {
		const W = 200;
		const H = 200;
		const gray = createGray(W, H, 0); // Dark background

		// White bubble interior.
		drawRect(gray, W, 23, 23, 154, 154, 255);

		// Draw black border OVER the white interior.
		drawRectBorder(gray, W, 20, 20, 160, 160, 3, 0);

		// Create a gap in the top border: 6px wide gap.
		drawRect(gray, W, 90, 20, 6, 3, 255);

		// Click inside the bubble.
		const result = floodFillCore(gray, W, H, 100, 100);

		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(4);

		// The polygon should represent the bubble, not the leaked area.
		// After opening, the core should be roughly the bubble size.
		const xs = result!.map((p) => p.x);
		const ys = result!.map((p) => p.y);
		const polyWidth = Math.max(...xs) - Math.min(...xs);
		const polyHeight = Math.max(...ys) - Math.min(...ys);

		// Should be roughly the bubble size (± opening erosion of 8px + padding of 3px = 11px per side).
		// Bubble interior is 154px = 0.77 normalized. After erosion: ~132px = 0.66 normalized.
		expect(polyWidth).toBeGreaterThan(0.4);
		expect(polyWidth).toBeLessThan(0.85);
		expect(polyHeight).toBeGreaterThan(0.4);
		expect(polyHeight).toBeLessThan(0.85);
	});

	it("returns null when clicking outside on a large open area", () => {
		const W = 100;
		const H = 100;
		// Entirely white — no boundaries. Fill covers 100% → rejected.
		const gray = createGray(W, H, 255);

		const result = floodFillCore(gray, W, H, 50, 50);
		expect(result).toBeNull();
	});

	it("returns null for a region that is too small", () => {
		const W = 100;
		const H = 100;
		const gray = createGray(W, H, 0); // All dark

		// Tiny 5x5 white spot.
		drawRect(gray, W, 48, 48, 5, 5, 255);

		const result = floodFillCore(gray, W, H, 50, 50);
		// 5x5 = 25 pixels, below MIN_FILL_PIXELS (100).
		expect(result).toBeNull();
	});

	it("returns null for out-of-bounds click", () => {
		const W = 50;
		const H = 50;
		const gray = createGray(W, H, 255);

		expect(floodFillCore(gray, W, H, -1, 25)).toBeNull();
		expect(floodFillCore(gray, W, H, 50, 25)).toBeNull();
		expect(floodFillCore(gray, W, H, 25, -1)).toBeNull();
		expect(floodFillCore(gray, W, H, 25, 50)).toBeNull();
	});

	it("handles anti-aliased edges (gray values near threshold)", () => {
		const W = 100;
		const H = 100;
		const gray = createGray(W, H, 255);

		// Hard black border.
		drawRectBorder(gray, W, 20, 20, 60, 60, 2, 0);

		// Add anti-aliased fringe around the border (gray 120 — below threshold).
		// Outer fringe.
		drawRectBorder(gray, W, 18, 18, 64, 64, 1, 120);
		// Inner fringe.
		drawRectBorder(gray, W, 22, 22, 56, 56, 1, 120);

		const result = floodFillCore(gray, W, H, 50, 50);
		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(4);
	});

	it("handles minor color variation in bubble interior", () => {
		const W = 100;
		const H = 100;
		const gray = createGray(W, H, 255);

		drawRectBorder(gray, W, 15, 15, 70, 70, 3, 0);

		// Add some noise / JPEG-like variation inside the bubble.
		// Scattered pixels with gray 210-240 (all above threshold 200).
		for (let y = 20; y < 80; y += 5) {
			for (let x = 20; x < 80; x += 5) {
				gray[y * W + x] = 210;
			}
		}

		const result = floodFillCore(gray, W, H, 50, 50);
		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(4);
	});

	it("handles partially-open bubble WITH text inside (manga scenario)", () => {
		const W = 200;
		const H = 200;
		const gray = createGray(W, H, 80); // Gray manga-art background

		// White bubble interior.
		drawRect(gray, W, 23, 23, 154, 154, 255);

		// Black border.
		drawRectBorder(gray, W, 20, 20, 160, 160, 3, 0);

		// Gap in top border (6px wide).
		drawRect(gray, W, 90, 20, 6, 3, 255);

		// Dense text inside the bubble: 3 columns of characters.
		for (let col = 0; col < 3; col++) {
			const baseX = 50 + col * 40;
			for (let row = 0; row < 5; row++) {
				drawRect(gray, W, baseX, 40 + row * 25, 12, 18, 0);
			}
		}

		// Click in white space inside the bubble (not on text).
		const result = floodFillCore(gray, W, H, 35, 100);

		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(4);

		// Should represent the bubble, not the full image.
		const xs = result!.map((p) => p.x);
		const ys = result!.map((p) => p.y);
		const polyWidth = Math.max(...xs) - Math.min(...xs);
		const polyHeight = Math.max(...ys) - Math.min(...ys);

		// Bubble is 154/200 = 0.77 normalized. After opening + padding, ~0.5-0.7.
		expect(polyWidth).toBeGreaterThan(0.3);
		expect(polyWidth).toBeLessThan(0.85);
		expect(polyHeight).toBeGreaterThan(0.3);
		expect(polyHeight).toBeLessThan(0.85);
	});

	it("handles wide opening closed by higher threshold (fill-example-1 scenario)", () => {
		const W = 200;
		const H = 200;
		// Light gray background (210) — below threshold 220, so it becomes a wall
		// at the second cascade level but NOT at the first (200).
		const gray = createGray(W, H, 210);

		// White bubble interior.
		drawRect(gray, W, 23, 23, 80, 154, 255);

		// Black border on 3 sides (left, top, bottom). Right side is OPEN.
		// Top border.
		drawRect(gray, W, 20, 20, 86, 3, 0);
		// Bottom border.
		drawRect(gray, W, 20, 174, 86, 3, 0);
		// Left border.
		drawRect(gray, W, 20, 20, 3, 157, 0);
		// Right side: NO border — open to the gray background.

		// At threshold 200: interior (255) is open, background (210) is also open → fill leaks.
		// At threshold 220: background (210) becomes a wall → fill is contained.
		const result = floodFillCore(gray, W, H, 60, 100);

		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(4);

		const xs = result!.map((p) => p.x);
		const polyWidth = Math.max(...xs) - Math.min(...xs);
		// Should be contained to the bubble (~80px/200 = 0.4), not the full image.
		expect(polyWidth).toBeGreaterThan(0.2);
		expect(polyWidth).toBeLessThan(0.6);
	});

	it("handles sketchy thin outline (fill-example-2 scenario)", () => {
		const W = 100;
		const H = 100;
		const gray = createGray(W, H, 0); // Dark background

		// White bubble interior.
		drawRect(gray, W, 22, 22, 56, 56, 255);

		// Sketchy border — mix of dark and medium-gray strokes.
		drawRectBorder(gray, W, 20, 20, 60, 60, 2, 30);

		// Add some lighter strokes to simulate sketchy hand-drawn line.
		// These are gray 150 — wall at threshold 200.
		drawRectBorder(gray, W, 19, 19, 62, 62, 1, 150);

		const result = floodFillCore(gray, W, H, 50, 50);
		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(4);
	});

	it("ray fallback: bubble open on one side with white background", () => {
		const W = 200;
		const H = 150;
		// White background everywhere — no threshold will close the opening.
		const gray = createGray(W, H, 255);

		// Black border on 3 sides only. Right side is wide open to white.
		drawRect(gray, W, 20, 20, 3, 110, 0); // Left
		drawRect(gray, W, 20, 20, 100, 3, 0); // Top
		drawRect(gray, W, 20, 127, 100, 3, 0); // Bottom
		// Right side: open to white

		// Flood fill leaks → ray-based. Global cap at 2*median keeps the polygon
		// from spanning the full image.
		const result = floodFillCore(gray, W, H, 60, 75);

		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(5);

		const xs = result!.map((p) => p.x);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		expect(minX).toBeGreaterThan(0.05);
		expect(minX).toBeLessThan(0.25);
		// Right side is capped at ~2*median. Should not reach the far right.
		expect(maxX).toBeLessThan(0.95);
	});

	it("ray fallback: small bubble with text inside", () => {
		const W = 120;
		const H = 100;
		const gray = createGray(W, H, 0); // Dark background

		// White bubble interior.
		drawRect(gray, W, 18, 15, 84, 70, 255);

		// Black border.
		drawRectBorder(gray, W, 16, 13, 88, 74, 2, 0);

		// Some text inside — sparser than before but still fragments.
		drawRect(gray, W, 30, 25, 14, 12, 0);
		drawRect(gray, W, 55, 25, 14, 12, 0);
		drawRect(gray, W, 78, 25, 14, 12, 0);
		drawRect(gray, W, 30, 50, 14, 12, 0);
		drawRect(gray, W, 55, 50, 14, 12, 0);
		drawRect(gray, W, 78, 50, 14, 12, 0);

		// Click in white space between text blocks (center of bubble).
		const result = floodFillCore(gray, W, H, 50, 45);

		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(4);

		const xs = result!.map((p) => p.x);
		const ys = result!.map((p) => p.y);
		const polyWidth = Math.max(...xs) - Math.min(...xs);
		const polyHeight = Math.max(...ys) - Math.min(...ys);
		expect(polyWidth).toBeGreaterThan(0.3);
		expect(polyHeight).toBeGreaterThan(0.3);
	});

	it("works with an elliptical bubble shape", () => {
		const W = 200;
		const H = 200;
		const gray = createGray(W, H, 0); // Dark background

		// Draw a filled white ellipse, then a dark border.
		const cx = 100;
		const cy = 100;
		const rx = 60;
		const ry = 40;

		// Fill ellipse interior with white.
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const dx = (x - cx) / rx;
				const dy = (y - cy) / ry;
				if (dx * dx + dy * dy < 1) {
					gray[y * W + x] = 255;
				}
			}
		}

		// Draw dark border on the ellipse edge.
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const dx = (x - cx) / rx;
				const dy = (y - cy) / ry;
				const r = dx * dx + dy * dy;
				if (r >= 0.85 && r <= 1.15) {
					gray[y * W + x] = 0;
				}
			}
		}

		const result = floodFillCore(gray, W, H, 100, 100);
		expect(result).not.toBeNull();
		expect(result!.length).toBeGreaterThanOrEqual(6);
	});
});
