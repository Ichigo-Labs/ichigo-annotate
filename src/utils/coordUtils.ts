import type { Point } from "../types/appState";

// Convert screen pixel coordinates to normalized [0,1] image coordinates.
// Returns null if the point is outside the image bounds.
export function screenToNormalized(
	screenX: number,
	screenY: number,
	imageRect: { left: number; top: number; width: number; height: number },
): Point | null {
	const x = (screenX - imageRect.left) / imageRect.width;
	const y = (screenY - imageRect.top) / imageRect.height;
	if (x < 0 || x > 1 || y < 0 || y > 1) return null;
	return { x, y };
}

// Convert normalized [0,1] coordinates back to screen pixel coordinates.
export function normalizedToScreen(
	point: Point,
	imageRect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
	return {
		x: point.x * imageRect.width + imageRect.left,
		y: point.y * imageRect.height + imageRect.top,
	};
}
