import { describe, expect, it } from "vitest";
import {
	selectObjectAt,
	selectObjectsInLoop,
	type ObjectSelection,
	type Pixels,
} from "../../src/utils/objectSelectUtils";

type Rgb = [number, number, number];
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const PINK: Rgb = [240, 90, 160];

function canvas(width: number, height: number, paper: Rgb = WHITE): Pixels {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		data.set([...paper, 255], i * 4);
	}
	return { data, width, height };
}

function paint(img: Pixels, inside: (x: number, y: number) => boolean, color: Rgb) {
	for (let y = 0; y < img.height; y++) {
		for (let x = 0; x < img.width; x++) {
			if (inside(x + 0.5, y + 0.5)) img.data.set([...color, 255], (y * img.width + x) * 4);
		}
	}
}

const disk = (cx: number, cy: number, r: number) => (x: number, y: number) =>
	(x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const ring = (cx: number, cy: number, r: number, w: number) => (x: number, y: number) => {
	const d = Math.hypot(x - cx, y - cy);
	return d <= r && d >= r - w;
};
const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) =>
	x >= x0 && x <= x1 && y >= y0 && y <= y1;

// Pixel bounding box of a selection's outline.
function box(sel: ObjectSelection, img: Pixels) {
	if (!("vertices" in sel)) throw new Error(`no selection: ${sel.error}`);
	const xs = sel.vertices.map((v) => v.x * img.width);
	const ys = sel.vertices.map((v) => v.y * img.height);
	return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

// Whether a pixel-space point is inside a selection's outline (even-odd rule).
function contains(sel: ObjectSelection, img: Pixels, x: number, y: number): boolean {
	if (!("vertices" in sel)) throw new Error(`no selection: ${sel.error}`);
	const pts = sel.vertices.map((v) => [v.x * img.width, v.y * img.height] as const);
	let inside = false;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const [xi, yi] = pts[i]!;
		const [xj, yj] = pts[j]!;
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

// A filled heart: two round lobes over a point, notched between the lobes.
const heart = (x: number, y: number) =>
	disk(42, 36, 8)(x, y) || disk(58, 36, 8)(x, y) || (y >= 38 && y <= 60 && Math.abs(x - 50) <= (60 - y) * 0.72);

describe("selectObjectAt", () => {
	it("outlines a filled mark that is tapped", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, disk(30, 40, 8), BLACK);

		// Act
		const b = box(selectObjectAt(img, 30, 40), img);

		// Assert: the disk spans 22..38, plus two pixels of padding.
		expect(b.x0).toBeCloseTo(20, 0);
		expect(b.x1).toBeCloseTo(40, 0);
		expect(b.y0).toBeCloseTo(30, 0);
		expect(b.y1).toBeCloseTo(50, 0);
	});

	it("outlines an outlined mark tapped in its middle", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, ring(50, 40, 12, 2), BLACK);

		// Act
		const b = box(selectObjectAt(img, 50, 40), img);

		// Assert
		expect(b.x0).toBeLessThanOrEqual(38);
		expect(b.x1).toBeGreaterThanOrEqual(62);
		expect(b.y0).toBeLessThanOrEqual(28);
		expect(b.y1).toBeGreaterThanOrEqual(52);
	});

	it("snaps a tap just beside a mark onto it", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, disk(30, 40, 6), BLACK);

		// Act
		const b = box(selectObjectAt(img, 42, 40), img);

		// Assert
		expect(b.x0).toBeCloseTo(22, 0);
		expect(b.x1).toBeCloseTo(38, 0);
	});

	it("finds nothing on open paper away from any mark", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, disk(15, 15, 5), BLACK);

		// Act
		const sel = selectObjectAt(img, 70, 60);

		// Assert
		expect(sel).toEqual({ error: "nothing" });
	});

	it("leaves out a glyph the mark touches through a thin bridge", () => {
		// Arrange
		const img = canvas(120, 80);
		paint(img, disk(30, 40, 8), BLACK);
		paint(img, rect(60, 25, 80, 55), BLACK);
		paint(img, rect(38, 40, 60, 40.9), BLACK);

		// Act
		const b = box(selectObjectAt(img, 30, 40), img);

		// Assert
		expect(b.x1).toBeLessThan(45);
	});

	it("leaves out the bubble outline a solid mark touches", () => {
		// Arrange: a filled heart-sized disk pressed against a 3 px outline.
		const img = canvas(120, 100);
		paint(img, ring(60, 50, 45, 3), BLACK);
		paint(img, disk(60, 13, 7), BLACK);

		// Act
		const b = box(selectObjectAt(img, 60, 13), img);

		// Assert: the disk (53..67, 6..20), not the outline around the crop.
		expect(b.x0).toBeGreaterThan(48);
		expect(b.x1).toBeLessThan(72);
		expect(b.y1).toBeLessThan(25);
	});

	it("keeps every stroke of a line drawing tapped on an inner stroke", () => {
		// Arrange: an outlined heart's notch is a thin stroke joined to the outline.
		const img = canvas(100, 80);
		paint(img, ring(50, 40, 14, 2), BLACK);
		paint(img, rect(49, 26, 50.9, 40), BLACK);

		// Act
		const b = box(selectObjectAt(img, 50, 36), img);

		// Assert: the whole outline, not just the notch.
		expect(b.x0).toBeLessThanOrEqual(36);
		expect(b.x1).toBeGreaterThanOrEqual(64);
		expect(b.y1).toBeGreaterThanOrEqual(54);
	});

	it("keeps a coloured mark apart from black ink it touches", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, disk(40, 40, 8), PINK);
		paint(img, disk(54, 40, 8), BLACK);

		// Act
		const b = box(selectObjectAt(img, 40, 40), img);

		// Assert
		expect(b.x0).toBeCloseTo(30, 0);
		expect(b.x1).toBeLessThanOrEqual(50);
	});

	it("works on coloured paper", () => {
		// Arrange
		const img = canvas(100, 80, [250, 220, 230]);
		paint(img, disk(50, 40, 7), BLACK);

		// Act
		const b = box(selectObjectAt(img, 50, 40), img);

		// Assert
		expect(b.x0).toBeCloseTo(41, 0);
		expect(b.x1).toBeCloseTo(59, 0);
	});

	it("refuses dark art covering much of the crop", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, rect(45, 0, 100, 80), BLACK);

		// Act
		const sel = selectObjectAt(img, 55, 40);

		// Assert: no outline (it reads as paper here, so "nothing").
		expect("error" in sel).toBe(true);
	});

	it("outlines a mark from a tap on its anti-aliased edge", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, disk(50, 40, 8), BLACK);
		paint(img, ring(50, 40, 9, 1), [128, 128, 128]);

		// Act
		const b = box(selectObjectAt(img, 50, 31), img);

		// Assert: the whole disk, edge included.
		expect(b.y0).toBeCloseTo(29, 0);
		expect(b.y1).toBeCloseTo(51, 0);
	});

	it("refuses the bubble outline around the whole crop", () => {
		// Arrange
		const img = canvas(100, 100);
		paint(img, ring(50, 50, 49, 2), BLACK);

		// Act
		const sel = selectObjectAt(img, 50, 2);

		// Assert
		expect(sel).toEqual({ error: "too-big" });
	});

	it("follows a heart's notch instead of bridging it", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, heart, BLACK);

		// Act
		const sel = selectObjectAt(img, 50, 45);

		// Assert: the paper in the notch stays outside; the heart is inside.
		expect(contains(sel, img, 50, 27)).toBe(false);
		expect(contains(sel, img, 50, 40)).toBe(true);
		expect(contains(sel, img, 42, 36)).toBe(true);
	});

	it("keeps a few pixels of clearance all round the mark", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, heart, BLACK);
		const ink: [number, number][] = [];
		for (let y = 0; y < img.height; y++) {
			for (let x = 0; x < img.width; x++) if (heart(x + 0.5, y + 0.5)) ink.push([x + 0.5, y + 0.5]);
		}

		// Act
		const sel = selectObjectAt(img, 50, 45);

		// Assert: every ink pixel is inside; every corner is close to the ink.
		expect(ink.every(([x, y]) => contains(sel, img, x, y))).toBe(true);
		if (!("vertices" in sel)) throw new Error("no selection");
		const gaps = sel.vertices.map((v) =>
			Math.min(...ink.map(([x, y]) => Math.hypot(v.x * img.width - x, v.y * img.height - y))),
		);
		expect(Math.max(...gaps)).toBeLessThan(4);
	});

	it("keeps the thin outlined side of a half-filled heart", () => {
		// Arrange: a filled right lobe and point, a thin outline for the left lobe.
		const img = canvas(100, 80);
		paint(img, ring(42, 36, 8, 2), BLACK);
		paint(img, (x, y) => disk(58, 36, 8)(x, y) || (y >= 40 && y <= 60 && Math.abs(x - 50) <= (60 - y) * 0.72), BLACK);

		// Act
		const sel = selectObjectAt(img, 58, 40);

		// Assert: the left lobe's stroke and the paper inside it are covered.
		expect(contains(sel, img, 35, 33)).toBe(true);
		expect(contains(sel, img, 42, 32)).toBe(true);
	});

	it("returns normalized vertices", () => {
		// Arrange
		const img = canvas(60, 40);
		paint(img, disk(5, 5, 4), BLACK);

		// Act
		const sel = selectObjectAt(img, 5, 5);

		// Assert
		expect("vertices" in sel && sel.vertices.every((v) => v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1)).toBe(true);
	});
});

describe("selectObjectsInLoop", () => {
	const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
		[x0, y0],
		[x1, y0],
		[x1, y1],
		[x0, y1],
	];

	it("wraps every mark inside the loop", () => {
		// Arrange
		const img = canvas(120, 80);
		paint(img, disk(30, 30, 5), BLACK);
		paint(img, disk(60, 50, 5), PINK);
		paint(img, disk(100, 40, 5), BLACK);

		// Act
		const b = box(selectObjectsInLoop(img, square(15, 15, 75, 65)), img);

		// Assert: both marks inside the loop, not the one outside.
		expect(b.x0).toBeCloseTo(23, 0);
		expect(b.y0).toBeCloseTo(23, 0);
		expect(b.x1).toBeCloseTo(67, 0);
		expect(b.y1).toBeCloseTo(57, 0);
	});

	it("joins separate marks without filling the paper between them", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, disk(30, 40, 5), BLACK);
		paint(img, disk(60, 40, 5), BLACK);

		// Act
		const sel = selectObjectsInLoop(img, square(15, 25, 75, 55));

		// Assert: one outline around both, linked by a narrow corridor.
		expect(contains(sel, img, 30, 40)).toBe(true);
		expect(contains(sel, img, 60, 40)).toBe(true);
		expect(contains(sel, img, 45, 40.5)).toBe(true);
		expect(contains(sel, img, 45, 45)).toBe(false);
	});

	it("ignores specks of noise", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, disk(50, 40, 5), BLACK);
		paint(img, rect(20, 20, 20.9, 20.9), BLACK);

		// Act
		const b = box(selectObjectsInLoop(img, square(10, 10, 70, 70)), img);

		// Assert
		expect(b.x0).toBeGreaterThan(40);
	});

	it("finds nothing in a loop of empty paper", () => {
		// Arrange
		const img = canvas(100, 80);
		paint(img, disk(85, 60, 5), BLACK);

		// Act
		const sel = selectObjectsInLoop(img, square(10, 10, 40, 40));

		// Assert
		expect(sel).toEqual({ error: "nothing" });
	});
});
