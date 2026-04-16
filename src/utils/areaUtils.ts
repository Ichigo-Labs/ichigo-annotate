import type { Point } from "../types/appState";

// Euclidean distance between two points in normalized coordinates.
export function distanceBetween(a: Point, b: Point): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
}

// True if the last point is within `threshold` of the first point.
export function isPolygonClosed(
	points: Point[],
	threshold: number,
): boolean {
	if (points.length < 3) return false;
	return distanceBetween(points[0]!, points[points.length - 1]!) < threshold;
}

// True if the gap between start and end is small relative to the total
// drawn path, meaning the user drew most of the shape but didn't quite
// close it.
export function isNearlyComplete(
	points: Point[],
	maxGapRatio: number,
): boolean {
	if (points.length < 3) return false;

	let pathLength = 0;
	for (let i = 1; i < points.length; i++) {
		pathLength += distanceBetween(points[i - 1]!, points[i]!);
	}
	if (pathLength === 0) return false;

	const gap = distanceBetween(points[0]!, points[points.length - 1]!);
	return gap / pathLength < maxGapRatio;
}

// Ray-casting algorithm for point-in-polygon test.
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const pi = polygon[i]!;
		const pj = polygon[j]!;

		if (
			pi.y > point.y !== pj.y > point.y &&
			point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x
		) {
			inside = !inside;
		}
	}
	return inside;
}

// Bounding box of a polygon.
export function polygonBoundingBox(polygon: Point[]): {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
} {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of polygon) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX, minY, maxX, maxY };
}

// Clamp a point's coordinates to [0, 1].
export function clampPoint(point: Point): Point {
	return {
		x: Math.max(0, Math.min(1, point.x)),
		y: Math.max(0, Math.min(1, point.y)),
	};
}

// Translate every vertex by delta, clamped to [0, 1].
export function translatePolygon(polygon: Point[], delta: Point): Point[] {
	return polygon.map((p) =>
		clampPoint({ x: p.x + delta.x, y: p.y + delta.y }),
	);
}

// Index of the nearest vertex within threshold, or null.
export function nearestVertexIndex(
	point: Point,
	polygon: Point[],
	threshold: number,
): number | null {
	let bestIdx: number | null = null;
	let bestDist = threshold;
	for (let i = 0; i < polygon.length; i++) {
		const d = distanceBetween(point, polygon[i]!);
		if (d < bestDist) {
			bestDist = d;
			bestIdx = i;
		}
	}
	return bestIdx;
}

// Simplify a polygon to N vertices by iteratively removing the vertex
// that causes the least area loss (Visvalingam-Whyatt approach).
export function polygonizeVertices(vertices: Point[], sides: number): Point[] {
	if (sides < 3) sides = 3;
	if (vertices.length <= sides) return vertices;

	// Start from the convex hull to maximize enclosed area.
	let pts = convexHull(vertices);
	if (pts.length <= sides) return pts;

	// Iteratively remove the vertex with the smallest triangle area.
	while (pts.length > sides) {
		let minArea = Infinity;
		let minIdx = 0;
		for (let i = 0; i < pts.length; i++) {
			const prev = pts[(i - 1 + pts.length) % pts.length]!;
			const curr = pts[i]!;
			const next = pts[(i + 1) % pts.length]!;
			const area = triangleArea(prev, curr, next);
			if (area < minArea) {
				minArea = area;
				minIdx = i;
			}
		}
		pts = pts.filter((_, i) => i !== minIdx);
	}
	return pts;
}

// Area of a triangle formed by three points (unsigned).
function triangleArea(a: Point, b: Point, c: Point): number {
	return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
}

// Convex hull via Andrew's monotone chain algorithm.
function convexHull(points: Point[]): Point[] {
	const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	if (sorted.length <= 2) return sorted;

	const cross = (o: Point, a: Point, b: Point) =>
		(a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

	// Lower hull.
	const lower: Point[] = [];
	for (const p of sorted) {
		while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
			lower.pop();
		}
		lower.push(p);
	}

	// Upper hull.
	const upper: Point[] = [];
	for (let i = sorted.length - 1; i >= 0; i--) {
		const p = sorted[i]!;
		while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
			upper.pop();
		}
		upper.push(p);
	}

	// Remove last point of each half because it's repeated.
	lower.pop();
	upper.pop();
	return [...lower, ...upper];
}

// Hand-picked palette of maximally distinct colors (inspired by Kelly's 22 colors
// of maximum contrast, filtered for accessibility on light backgrounds).
const DISTINCT_PALETTE: string[] = [
	"#e6194b", // red
	"#3cb44b", // green
	"#4363d8", // blue
	"#f58231", // orange
	"#911eb4", // purple
	"#42d4f4", // cyan
	"#f032e6", // magenta
	"#bfef45", // lime
	"#fabed4", // pink
	"#469990", // teal
	"#dcbeff", // lavender
	"#9a6324", // brown
	"#800000", // maroon
	"#aaffc3", // mint
	"#808000", // olive
	"#000075", // navy
];

// Generate a hex color that is visually distinct from existing colors.
export function generateDistinctColor(existingColors: string[]): string {
	// Phase 1: Pick from curated palette — choose the entry with maximum
	// minimum-distance to all existing colors so order stays optimal even
	// when colors are deleted and re-added.
	const unused = DISTINCT_PALETTE.filter((c) => !existingColors.includes(c));
	if (unused.length > 0) {
		if (existingColors.length === 0) return unused[0]!;
		const existingHSL = existingColors.map(hexToHSL);
		return pickFarthest(unused, existingHSL);
	}

	// Phase 2: Algorithmic fallback — sweep hue × saturation/lightness grid and
	// pick the combination with the greatest minimum perceptual distance.
	const existingHSL = existingColors.map(hexToHSL);
	const SL_TIERS: [number, number][] = [
		[75, 50],
		[55, 38],
		[85, 65],
		[65, 28],
		[50, 58],
		[90, 45],
	];

	let bestColor = "";
	let bestMinDist = -1;
	for (const [sat, lit] of SL_TIERS) {
		for (let i = 0; i < 72; i++) {
			const hue = (i * 137.508) % 360; // golden angle
			const dist = minPerceptualDist(hue, sat, lit, existingHSL);
			if (dist > bestMinDist) {
				bestMinDist = dist;
				bestColor = hslToHex(hue, sat, lit);
			}
		}
	}
	return bestColor;
}

function pickFarthest(
	candidates: string[],
	existingHSL: [number, number, number][],
): string {
	let best = candidates[0]!;
	let bestDist = -1;
	for (const c of candidates) {
		const [h, s, l] = hexToHSL(c);
		const dist = minPerceptualDist(h, s, l, existingHSL);
		if (dist > bestDist) {
			bestDist = dist;
			best = c;
		}
	}
	return best;
}

function minPerceptualDist(
	h: number,
	s: number,
	l: number,
	existing: [number, number, number][],
): number {
	return existing.reduce((min, [eh, es, el]) => {
		const dh = hueDifference(h, eh);
		const ds = Math.abs(s - es);
		const dl = Math.abs(l - el);
		// Hue weighted heavily; sat & lightness provide extra separation
		const dist = dh * 1.2 + ds * 0.5 + dl * 0.7;
		return Math.min(min, dist);
	}, Infinity);
}

// --- Helpers ---

function hueDifference(a: number, b: number): number {
	const d = Math.abs(a - b) % 360;
	return d > 180 ? 360 - d : d;
}

function hexToHSL(hex: string): [number, number, number] {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	const l = ((max + min) / 2) * 100;
	const s = d === 0 ? 0 : (d / (1 - Math.abs(2 * (l / 100) - 1))) * 100;
	let h = 0;
	if (d !== 0) {
		if (max === r) h = ((g - b) / d + 6) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
	}
	return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
	const sN = s / 100;
	const lN = l / 100;
	const c = (1 - Math.abs(2 * lN - 1)) * sN;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = lN - c / 2;
	let r = 0,
		g = 0,
		b = 0;

	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}

	const toHex = (v: number) =>
		Math.round((v + m) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
