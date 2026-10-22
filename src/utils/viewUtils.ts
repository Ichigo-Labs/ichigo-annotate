import type { CanvasView, Point } from "../types/appState";
import { distanceBetween } from "./areaUtils";

// Deepest zoom: several screen pixels per image pixel on a full-page scan.
export const MAX_ZOOM = 10;

interface Size {
	width: number;
	height: number;
}

// Keep the zoom within [1, MAX_ZOOM] and the zoomed image covering its
// unzoomed box, so it can't be panned out of sight.
export function clampView(view: CanvasView): CanvasView {
	const zoom = clampZoom(view.zoom);
	return {
		zoom,
		x: Math.min(Math.max(view.x, 1 - zoom), 0),
		y: Math.min(Math.max(view.y, 1 - zoom), 0),
	};
}

// View after a two-finger pinch moves the fingers from `from` to `to`: the
// zoom scales with the finger spread, and the image point that was under the
// fingers' midpoint stays under it. Finger positions are pixels relative to
// the unzoomed image box.
export function pinchView(
	start: CanvasView,
	from: [Point, Point],
	to: [Point, Point],
	box: Size,
): CanvasView {
	const startSpread = distanceBetween(from[0], from[1]);
	const spread = startSpread > 0 ? distanceBetween(to[0], to[1]) / startSpread : 1;
	const zoom = clampZoom(start.zoom * spread);

	const fromMid = boxMidpoint(from, box);
	const toMid = boxMidpoint(to, box);
	// Image point (0–1) under the fingers when the pinch started.
	const anchorX = (fromMid.x - start.x) / start.zoom;
	const anchorY = (fromMid.y - start.y) / start.zoom;

	return clampView({ zoom, x: toMid.x - anchorX * zoom, y: toMid.y - anchorY * zoom });
}

// CSS transform that draws a layer of the image box at this view; pair it
// with a top-left transform origin.
export function viewTransform(view: CanvasView): string {
	return `translate(${view.x * 100}%, ${view.y * 100}%) scale(${view.zoom})`;
}

function clampZoom(zoom: number): number {
	return Math.min(Math.max(zoom, 1), MAX_ZOOM);
}

// Midpoint of two pixel positions, as a fraction of the box.
function boxMidpoint([a, b]: [Point, Point], box: Size): Point {
	return { x: (a.x + b.x) / 2 / box.width, y: (a.y + b.y) / 2 / box.height };
}
