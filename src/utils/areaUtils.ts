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

// Generate a hex color that is visually distinct from existing colors.
export function generateDistinctColor(existingColors: string[]): string {
	const existingHues = existingColors.map(hexToHue);
	const minGap = 30;

	// Try random hues, pick the one farthest from existing hues.
	let bestHue = Math.random() * 360;
	let bestMinDist = 0;

	for (let attempt = 0; attempt < 50; attempt++) {
		const candidateHue = (attempt * 137.508) % 360; // golden angle spacing
		const minDist = existingHues.reduce(
			(min, h) => Math.min(min, hueDifference(candidateHue, h)),
			360,
		);
		if (minDist > bestMinDist) {
			bestMinDist = minDist;
			bestHue = candidateHue;
			if (bestMinDist >= minGap) break;
		}
	}

	return hslToHex(bestHue, 65, 55);
}

// --- Helpers ---

function hueDifference(a: number, b: number): number {
	const d = Math.abs(a - b) % 360;
	return d > 180 ? 360 - d : d;
}

function hexToHue(hex: string): number {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	if (d === 0) return 0;
	let h = 0;
	if (max === r) h = ((g - b) / d + 6) % 6;
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	return h * 60;
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
