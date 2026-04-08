import type { Point } from "../types/appState";

const WALL_THRESHOLD = 200;
const BLUR_RADIUS = 1;
const OPENING_RADIUS = 8;
const INNER_PADDING = 3;
const DP_TOLERANCE = 0.003;
const MAX_FILL_RATIO = 0.5;
const MIN_FILL_PIXELS = 100;

// --- Public API ---

export async function floodFillToPolygon(
	imageDataUrl: string,
	clickPoint: Point,
): Promise<Point[] | null> {
	const img = await loadImage(imageDataUrl);
	const width = img.naturalWidth;
	const height = img.naturalHeight;

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(img, 0, 0);
	const { data } = ctx.getImageData(0, 0, width, height);

	const gray = new Uint8Array(width * height);
	for (let i = 0; i < width * height; i++) {
		gray[i] = Math.round(
			0.299 * data[i * 4]! +
				0.587 * data[i * 4 + 1]! +
				0.114 * data[i * 4 + 2]!,
		);
	}

	const clickX = Math.round(clickPoint.x * (width - 1));
	const clickY = Math.round(clickPoint.y * (height - 1));
	return floodFillCore(gray, width, height, clickX, clickY);
}

// --- Core algorithm (exported for testing) ---

export function floodFillCore(
	gray: Uint8Array,
	width: number,
	height: number,
	clickX: number,
	clickY: number,
): Point[] | null {
	if (clickX < 0 || clickX >= width || clickY < 0 || clickY >= height)
		return null;

	// Light blur to smooth out noise / JPEG artifacts.
	const blurred = boxBlur(gray, width, height, BLUR_RADIUS);

	// Wall mask: dark pixels are walls.
	const walls = new Uint8Array(width * height);
	for (let i = 0; i < width * height; i++) {
		walls[i] = blurred[i]! < WALL_THRESHOLD ? 1 : 0;
	}

	if (walls[clickY * width + clickX]) return null;

	// Flood fill from click point.
	let filled = floodFill(walls, width, height, clickX, clickY);
	let fillCount = countOnes(filled);

	if (fillCount < MIN_FILL_PIXELS) return null;

	// If too large (leaked through a gap in the outline), apply morphological
	// opening to disconnect the thin leak from the core bubble region.
	if (fillCount > width * height * MAX_FILL_RATIO) {
		const opened = morphOpen(
			filled,
			width,
			height,
			OPENING_RADIUS,
			clickX,
			clickY,
		);
		if (!opened) return null;
		filled = opened;
		fillCount = countOnes(filled);
		if (
			fillCount > width * height * MAX_FILL_RATIO ||
			fillCount < MIN_FILL_PIXELS
		) {
			return null;
		}
	}

	// Erode for inner padding.
	erode(filled, width, height, INNER_PADDING);

	const contour = traceContour(filled, width, height);
	if (!contour || contour.length < 3) return null;

	const normalized = contour.map(([x, y]) => ({
		x: x / width,
		y: y / height,
	}));
	const simplified = douglasPeucker(normalized, DP_TOLERANCE);
	return simplified.length >= 3 ? simplified : null;
}

// --- Image loading ---

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = dataUrl;
	});
}

// --- Box blur (two-pass separable) ---

function boxBlur(
	gray: Uint8Array,
	width: number,
	height: number,
	radius: number,
): Uint8Array {
	if (radius <= 0) return gray;
	const temp = new Uint8Array(width * height);
	const result = new Uint8Array(width * height);

	// Horizontal pass.
	for (let y = 0; y < height; y++) {
		let sum = 0;
		let count = 0;
		for (let x = 0; x <= Math.min(radius, width - 1); x++) {
			sum += gray[y * width + x]!;
			count++;
		}
		for (let x = 0; x < width; x++) {
			temp[y * width + x] = Math.round(sum / count);
			const addX = x + radius + 1;
			if (addX < width) {
				sum += gray[y * width + addX]!;
				count++;
			}
			const removeX = x - radius;
			if (removeX >= 0) {
				sum -= gray[y * width + removeX]!;
				count--;
			}
		}
	}

	// Vertical pass.
	for (let x = 0; x < width; x++) {
		let sum = 0;
		let count = 0;
		for (let y = 0; y <= Math.min(radius, height - 1); y++) {
			sum += temp[y * width + x]!;
			count++;
		}
		for (let y = 0; y < height; y++) {
			result[y * width + x] = Math.round(sum / count);
			const addY = y + radius + 1;
			if (addY < height) {
				sum += temp[addY * width + x]!;
				count++;
			}
			const removeY = y - radius;
			if (removeY >= 0) {
				sum -= temp[removeY * width + x]!;
				count--;
			}
		}
	}

	return result;
}

// --- Helpers ---

function countOnes(mask: Uint8Array): number {
	let count = 0;
	for (let i = 0; i < mask.length; i++) count += mask[i]!;
	return count;
}

// --- Morphological open on fill result ---
// Erode to disconnect thin leak fingers, then find the connected component
// at the click point. Returns the core bubble without the leak.

function morphOpen(
	filled: Uint8Array,
	width: number,
	height: number,
	radius: number,
	clickX: number,
	clickY: number,
): Uint8Array | null {
	const eroded = new Uint8Array(filled);
	erode(eroded, width, height, radius);

	let sx = clickX;
	let sy = clickY;
	if (!eroded[sy * width + sx]) {
		const nearest = findNearestSet(eroded, width, height, clickX, clickY);
		if (!nearest) return null;
		[sx, sy] = nearest;
	}

	return floodFillMask(eroded, width, height, sx, sy);
}

// BFS to find the nearest set pixel.
function findNearestSet(
	mask: Uint8Array,
	width: number,
	height: number,
	startX: number,
	startY: number,
): [number, number] | null {
	const visited = new Uint8Array(width * height);
	const startIdx = startY * width + startX;
	visited[startIdx] = 1;
	const queue = [startIdx];
	let head = 0;

	while (head < queue.length) {
		const idx = queue[head++]!;
		if (mask[idx]) {
			const x = idx % width;
			return [x, (idx - x) / width];
		}
		const x = idx % width;
		const y = (idx - x) / width;
		if (x > 0 && !visited[idx - 1]) {
			visited[idx - 1] = 1;
			queue.push(idx - 1);
		}
		if (x < width - 1 && !visited[idx + 1]) {
			visited[idx + 1] = 1;
			queue.push(idx + 1);
		}
		if (y > 0 && !visited[idx - width]) {
			visited[idx - width] = 1;
			queue.push(idx - width);
		}
		if (y < height - 1 && !visited[idx + width]) {
			visited[idx + width] = 1;
			queue.push(idx + width);
		}
	}

	return null;
}

// Flood fill on a binary mask: find connected component of 1-pixels.
function floodFillMask(
	mask: Uint8Array,
	width: number,
	height: number,
	startX: number,
	startY: number,
): Uint8Array {
	const result = new Uint8Array(width * height);
	const startIdx = startY * width + startX;
	if (!mask[startIdx]) return result;

	result[startIdx] = 1;
	const queue = [startIdx];
	let head = 0;

	while (head < queue.length) {
		const idx = queue[head++]!;
		const x = idx % width;
		const y = (idx - x) / width;

		if (x > 0 && mask[idx - 1] && !result[idx - 1]) {
			result[idx - 1] = 1;
			queue.push(idx - 1);
		}
		if (x < width - 1 && mask[idx + 1] && !result[idx + 1]) {
			result[idx + 1] = 1;
			queue.push(idx + 1);
		}
		if (y > 0 && mask[idx - width] && !result[idx - width]) {
			result[idx - width] = 1;
			queue.push(idx - width);
		}
		if (y < height - 1 && mask[idx + width] && !result[idx + width]) {
			result[idx + width] = 1;
			queue.push(idx + width);
		}
	}

	return result;
}

// --- Flood fill (on wall mask) ---

function floodFill(
	walls: Uint8Array,
	width: number,
	height: number,
	startX: number,
	startY: number,
): Uint8Array {
	const filled = new Uint8Array(width * height);
	const startIdx = startY * width + startX;
	filled[startIdx] = 1;
	const queue = [startIdx];
	let head = 0;

	while (head < queue.length) {
		const idx = queue[head++]!;
		const x = idx % width;
		const y = (idx - x) / width;

		if (x > 0 && !filled[idx - 1] && !walls[idx - 1]) {
			filled[idx - 1] = 1;
			queue.push(idx - 1);
		}
		if (x < width - 1 && !filled[idx + 1] && !walls[idx + 1]) {
			filled[idx + 1] = 1;
			queue.push(idx + 1);
		}
		if (y > 0 && !filled[idx - width] && !walls[idx - width]) {
			filled[idx - width] = 1;
			queue.push(idx - width);
		}
		if (y < height - 1 && !filled[idx + width] && !walls[idx + width]) {
			filled[idx + width] = 1;
			queue.push(idx + width);
		}
	}

	return filled;
}

// --- Morphological erode (dilate complement, then mask) ---

function erode(
	mask: Uint8Array,
	width: number,
	height: number,
	radius: number,
): void {
	if (radius <= 0) return;
	const complement = new Uint8Array(width * height);
	for (let i = 0; i < mask.length; i++) complement[i] = mask[i] ? 0 : 1;
	dilateBox(complement, width, height, radius);
	for (let i = 0; i < mask.length; i++) {
		if (complement[i]) mask[i] = 0;
	}
}

function dilateBox(
	mask: Uint8Array,
	width: number,
	height: number,
	radius: number,
): void {
	if (radius <= 0) return;

	const hResult = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		let count = 0;
		for (let x = 0; x <= Math.min(radius, width - 1); x++) {
			if (mask[y * width + x]) count++;
		}
		for (let x = 0; x < width; x++) {
			if (count > 0) hResult[y * width + x] = 1;
			const addX = x + radius + 1;
			if (addX < width && mask[y * width + addX]) count++;
			const removeX = x - radius;
			if (removeX >= 0 && mask[y * width + removeX]) count--;
		}
	}

	for (let x = 0; x < width; x++) {
		let count = 0;
		for (let y = 0; y <= Math.min(radius, height - 1); y++) {
			if (hResult[y * width + x]) count++;
		}
		for (let y = 0; y < height; y++) {
			mask[y * width + x] = count > 0 ? 1 : 0;
			const addY = y + radius + 1;
			if (addY < height && hResult[addY * width + x]) count++;
			const removeY = y - radius;
			if (removeY >= 0 && hResult[removeY * width + x]) count--;
		}
	}
}

// --- Contour tracing (Moore neighbor tracing) ---

function traceContour(
	mask: Uint8Array,
	width: number,
	height: number,
): [number, number][] | null {
	const dx = [1, 1, 0, -1, -1, -1, 0, 1];
	const dy = [0, 1, 1, 1, 0, -1, -1, -1];

	let startX = -1;
	let startY = -1;
	for (let y = 0; y < height && startX === -1; y++) {
		for (let x = 0; x < width; x++) {
			if (mask[y * width + x]) {
				startX = x;
				startY = y;
				break;
			}
		}
	}
	if (startX === -1) return null;

	const isFg = (x: number, y: number) =>
		x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] === 1;

	const dirFrom = (
		x1: number,
		y1: number,
		x2: number,
		y2: number,
	): number => {
		const ddx = x2 - x1;
		const ddy = y2 - y1;
		for (let i = 0; i < 8; i++) {
			if (dx[i] === ddx && dy[i] === ddy) return i;
		}
		return 0;
	};

	const contour: [number, number][] = [[startX, startY]];

	let cx = startX;
	let cy = startY;
	let bx = startX - 1;
	let by = startY;
	const maxIter = width * height;

	for (let iter = 0; iter < maxIter; iter++) {
		const startDir = dirFrom(cx, cy, bx, by);
		let found = false;
		let lastBgX = bx;
		let lastBgY = by;

		for (let i = 0; i < 8; i++) {
			const d = (startDir + i) % 8;
			const nx = cx + dx[d]!;
			const ny = cy + dy[d]!;

			if (isFg(nx, ny)) {
				if (nx === startX && ny === startY && contour.length > 2) {
					return contour;
				}
				cx = nx;
				cy = ny;
				bx = lastBgX;
				by = lastBgY;
				contour.push([cx, cy]);
				found = true;
				break;
			} else {
				lastBgX = nx;
				lastBgY = ny;
			}
		}

		if (!found) break;
	}

	return contour.length >= 3 ? contour : null;
}

// --- Douglas-Peucker simplification ---

function douglasPeucker(points: Point[], tolerance: number): Point[] {
	if (points.length <= 2) return points;

	const first = points[0]!;
	const last = points[points.length - 1]!;

	let maxDist = 0;
	let maxIdx = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const dist = pointLineDistance(points[i]!, first, last);
		if (dist > maxDist) {
			maxDist = dist;
			maxIdx = i;
		}
	}

	if (maxDist > tolerance) {
		const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance);
		const right = douglasPeucker(points.slice(maxIdx), tolerance);
		return [...left.slice(0, -1), ...right];
	}
	return [first, last];
}

function pointLineDistance(
	point: Point,
	lineStart: Point,
	lineEnd: Point,
): number {
	const ddx = lineEnd.x - lineStart.x;
	const ddy = lineEnd.y - lineStart.y;
	const lenSq = ddx * ddx + ddy * ddy;
	if (lenSq === 0) {
		const ex = point.x - lineStart.x;
		const ey = point.y - lineStart.y;
		return Math.sqrt(ex * ex + ey * ey);
	}
	const t = Math.max(
		0,
		Math.min(
			1,
			((point.x - lineStart.x) * ddx + (point.y - lineStart.y) * ddy) /
				lenSq,
		),
	);
	const projX = lineStart.x + t * ddx;
	const projY = lineStart.y + t * ddy;
	const ex = point.x - projX;
	const ey = point.y - projY;
	return Math.sqrt(ex * ex + ey * ey);
}
