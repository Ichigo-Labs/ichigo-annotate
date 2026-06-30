import type { Point } from "../types/appState";
import { distanceBetween, polygonBoundingBox } from "./areaUtils";

// Minimum normalized distance between two box anchors. Taps closer than this
// to an existing anchor are ignored so a fast double-tap can't stack two
// anchors in (nearly) the same spot.
export const RECT_MIN_POINT_DISTANCE = 0.01;

// True if `point` is on top of (or too near) any of the existing anchors.
export function isTooNearExistingPoint(
	point: Point,
	existing: Point[],
	threshold: number = RECT_MIN_POINT_DISTANCE,
): boolean {
	return existing.some((p) => distanceBetween(p, point) < threshold);
}

// Build an axis-aligned rectangle (4 vertices, clockwise from top-left) from
// two diagonal corners. Used by the "two tap box" flow.
export function rectFromDiagonal(a: Point, b: Point): Point[] {
	const minX = Math.min(a.x, b.x);
	const maxX = Math.max(a.x, b.x);
	const minY = Math.min(a.y, b.y);
	const maxY = Math.max(a.y, b.y);
	return [
		{ x: minX, y: minY },
		{ x: maxX, y: minY },
		{ x: maxX, y: maxY },
		{ x: minX, y: maxY },
	];
}

export function hasMinimumRectSize(
	points: Point[],
	threshold: number = RECT_MIN_POINT_DISTANCE,
): boolean {
	const { minX, minY, maxX, maxY } = polygonBoundingBox(points);
	return maxX - minX >= threshold && maxY - minY >= threshold;
}

// Order vertices so the resulting polygon does not self-intersect (which shows
// up as a "criss cross"/bowtie box). Sorting the points by their angle around
// the centroid yields a proper, non-self-intersecting quadrilateral regardless
// of the order the corners were tapped in.
export function orderRectVertices(points: Point[]): Point[] {
	if (points.length < 3) return points;

	const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
	const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

	return [...points].sort(
		(a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
	);
}

// Re-export for callers that only need the bounding box helper.
export { polygonBoundingBox };
