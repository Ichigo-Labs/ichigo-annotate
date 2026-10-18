import type { Point } from "../types/appState";
import { distanceBetween } from "./areaUtils";

// Normalized radius around the first vertex within which a tap closes the
// polygon. Kept tight so the vertex placed beside the start of a thin shape
// (e.g. a slanted line of scene text) isn't mistaken for a close.
export const POLYGON_CLOSE_RADIUS = 0.015;

// True when tapping `point` should close the polygon: it already has 3+
// vertices and the tap lands on the first one.
export function isClosingTap(point: Point, points: Point[]): boolean {
	return (
		points.length >= 3 &&
		distanceBetween(point, points[0]!) < POLYGON_CLOSE_RADIUS
	);
}
