import type { Point } from "../types/appState";

const WALL_THRESHOLDS = [200, 220, 240];
const BLUR_RADIUS = 1;
const OPENING_RADIUS = 8;
const INNER_PADDING = 2;
const DP_TOLERANCE = 0.003;
const MAX_FILL_RATIO = 0.5;
const MIN_FILL_PIXELS = 100;
const NUM_RAYS = 72;
const RAY_SMOOTH_WINDOW = 4; // neighbors on each side (total window = 9)
const MIN_RAY_MEDIAN = 5; // minimum bubble radius in pixels
const DARK_BUBBLE_THRESHOLD = 128;

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

	const blurred = boxBlur(gray, width, height, BLUR_RADIUS);
	const totalPixels = width * height;
	const maxFill = totalPixels * MAX_FILL_RATIO;

	// Invert for dark bubbles: if the clicked pixel is dark, flip the
	// grayscale so the wall detection (dark = wall) works for inverted
	// bubbles (black fill with white/bright outlines).
	if (blurred[clickY * width + clickX]! < DARK_BUBBLE_THRESHOLD) {
		for (let i = 0; i < totalPixels; i++) {
			blurred[i] = 255 - blurred[i]!;
		}
	}

	// --- Phase 1: Flood fill with cascading thresholds ---
	// Higher thresholds turn more gray background into walls, closing wide
	// openings where manga art or panel borders partially seal the gap.
	let floodResult: Point[] | null = null;

	for (const threshold of WALL_THRESHOLDS) {
		const walls = new Uint8Array(totalPixels);
		for (let i = 0; i < totalPixels; i++) {
			walls[i] = blurred[i]! < threshold ? 1 : 0;
		}

		if (walls[clickY * width + clickX]) continue;

		let filled = floodFill(walls, width, height, clickX, clickY);
		let fillCount = countOnes(filled);

		if (fillCount < MIN_FILL_PIXELS) continue;

		if (fillCount <= maxFill) {
			floodResult = finalizeFill(filled, width, height);
			break;
		}

		const opened = morphOpen(
			filled,
			width,
			height,
			OPENING_RADIUS,
			clickX,
			clickY,
		);
		if (!opened) continue;
		filled = opened;
		fillCount = countOnes(filled);

		if (fillCount >= MIN_FILL_PIXELS && fillCount <= maxFill) {
			floodResult = finalizeFill(filled, width, height);
			break;
		}
	}

	// Good flood-fill result — use it.
	if (floodResult && floodResult.length >= 5) return floodResult;

	// --- Phase 2: Ray-based fallback ---
	// Casts rays from click point to find bubble outline directly. Handles
	// open bubbles and small bubbles where flood fill fragments on text.
	const walls = new Uint8Array(totalPixels);
	for (let i = 0; i < totalPixels; i++) {
		walls[i] = blurred[i]! < WALL_THRESHOLDS[0]! ? 1 : 0;
	}

	if (!walls[clickY * width + clickX]) {
		const rayResult = rayBasedPolygon(
			walls,
			width,
			height,
			clickX,
			clickY,
		);
		if (rayResult && rayResult.length >= 3) return rayResult;
	}

	return floodResult;
}

function finalizeFill(
	filled: Uint8Array,
	width: number,
	height: number,
): Point[] | null {
	const contour = traceContour(filled, width, height);
	if (!contour || contour.length < 3) return null;

	const normalized = contour.map(([x, y]) => ({
		x: x / width,
		y: y / height,
	}));
	const simplified = douglasPeucker(normalized, DP_TOLERANCE);
	if (simplified.length < 3) return null;
	return insetPolygon(simplified, INNER_PADDING, width, height);
}

// --- Polygon inset ---
// Shrinks a normalized polygon inward by the given pixel padding.
// Works in pixel space to handle non-square images correctly.

function insetPolygon(
	points: Point[],
	paddingPx: number,
	width: number,
	height: number,
): Point[] {
	const n = points.length;
	if (n < 3) return points;

	const px = points.map((p) => p.x * width);
	const py = points.map((p) => p.y * height);

	// Signed area determines winding direction.
	let area = 0;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		area += px[i]! * py[j]! - px[j]! * py[i]!;
	}
	const sign = area > 0 ? 1 : -1;

	// Inward unit normal per edge.
	const normals: { nx: number; ny: number }[] = [];
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		const edx = px[j]! - px[i]!;
		const edy = py[j]! - py[i]!;
		const len = Math.sqrt(edx * edx + edy * edy);
		if (len < 1e-10) {
			normals.push({ nx: 0, ny: 0 });
		} else {
			normals.push({ nx: -sign * edy / len, ny: sign * edx / len });
		}
	}

	// Intersect consecutive offset edges to find inset vertices.
	const result: Point[] = [];
	for (let i = 0; i < n; i++) {
		const prev = (i - 1 + n) % n;

		const p1x = px[prev]! + normals[prev]!.nx * paddingPx;
		const p1y = py[prev]! + normals[prev]!.ny * paddingPx;
		const d1x = px[i]! - px[prev]!;
		const d1y = py[i]! - py[prev]!;

		const p2x = px[i]! + normals[i]!.nx * paddingPx;
		const p2y = py[i]! + normals[i]!.ny * paddingPx;
		const next = (i + 1) % n;
		const d2x = px[next]! - px[i]!;
		const d2y = py[next]! - py[i]!;

		const cross = d1x * d2y - d1y * d2x;
		let newX: number;
		let newY: number;

		if (Math.abs(cross) < 1e-10) {
			newX = px[i]! + normals[i]!.nx * paddingPx;
			newY = py[i]! + normals[i]!.ny * paddingPx;
		} else {
			const t = ((p2x - p1x) * d2y - (p2y - p1y) * d2x) / cross;
			newX = p1x + t * d1x;
			newY = p1y + t * d1y;
		}

		result.push({
			x: Math.max(0, Math.min(1, newX / width)),
			y: Math.max(0, Math.min(1, newY / height)),
		});
	}

	return result;
}

// --- Ray-based bubble detection ---
// Casts rays outward from the click point, finds the distance to the first
// wall in each direction, then smooths the distances to ignore text hits
// and interpolate across openings.

function rayBasedPolygon(
	walls: Uint8Array,
	width: number,
	height: number,
	clickX: number,
	clickY: number,
): Point[] | null {
	const maxDist = Math.max(width, height);

	// Cast rays and measure distance to first wall.
	const distances: number[] = [];
	for (let i = 0; i < NUM_RAYS; i++) {
		const angle = (i / NUM_RAYS) * 2 * Math.PI;
		const dx = Math.cos(angle);
		const dy = Math.sin(angle);
		let dist = 1;
		while (dist < maxDist) {
			const px = Math.round(clickX + dx * dist);
			const py = Math.round(clickY + dy * dist);
			if (px < 0 || px >= width || py < 0 || py >= height) break;
			if (walls[py * width + px]) break;
			dist++;
		}
		distances.push(dist);
	}

	// Compute global median — represents the typical bubble radius.
	const sorted = [...distances].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)]!;
	if (median < MIN_RAY_MEDIAN) return null;
	if (median > Math.max(width, height) * 0.4) return null;

	// --- Step 1: Interpolate across openings ---
	// Rays that travel much further than the median went through an opening
	// in the bubble outline. Instead of capping them (which creates a round
	// bump), linearly interpolate between the nearest wall-hitting rays on
	// each side so the polygon smoothly bridges the gap.
	const openingThreshold = median * 1.5;
	const isOpening = distances.map((d) => d > openingThreshold);

	// Two-pass sweep to find nearest non-opening ray on each side.
	const leftAnchor = new Int32Array(NUM_RAYS).fill(-1);
	const rightAnchor = new Int32Array(NUM_RAYS).fill(-1);
	let last = -1;
	for (let pass = 0; pass < 2; pass++) {
		for (let i = 0; i < NUM_RAYS; i++) {
			if (!isOpening[i]) last = i;
			leftAnchor[i] = last;
		}
	}
	last = -1;
	for (let pass = 0; pass < 2; pass++) {
		for (let i = NUM_RAYS - 1; i >= 0; i--) {
			if (!isOpening[i]) last = i;
			rightAnchor[i] = last;
		}
	}

	const interpolated = distances.map((d, i) => {
		if (!isOpening[i]) return d;
		const li = leftAnchor[i]!;
		const ri = rightAnchor[i]!;
		if (li === -1 || ri === -1 || li === ri) return median;
		const leftDist = (i - li + NUM_RAYS) % NUM_RAYS;
		const rightDist = (ri - i + NUM_RAYS) % NUM_RAYS;
		const total = leftDist + rightDist;
		if (total === 0) return median;
		const t = leftDist / total;
		return Math.round(distances[li]! * (1 - t) + distances[ri]! * t);
	});

	// --- Step 2: Smooth out text hits ---
	// Short outliers (rays stopped by text characters) are replaced with
	// the local angular median so the polygon follows the bubble outline.
	const smoothed: number[] = [];
	for (let i = 0; i < NUM_RAYS; i++) {
		const win: number[] = [];
		for (let j = -RAY_SMOOTH_WINDOW; j <= RAY_SMOOTH_WINDOW; j++) {
			win.push(interpolated[(i + j + NUM_RAYS) % NUM_RAYS]!);
		}
		win.sort((a, b) => a - b);
		const localMedian = win[RAY_SMOOTH_WINDOW]!;

		const d = interpolated[i]!;
		if (d < localMedian * 0.5) {
			smoothed.push(localMedian);
		} else {
			smoothed.push(d);
		}
	}

	// Convert to normalized polygon at full ray distance (edge-accurate).
	const points: Point[] = [];
	for (let i = 0; i < NUM_RAYS; i++) {
		const angle = (i / NUM_RAYS) * 2 * Math.PI;
		points.push({
			x: Math.max(0, Math.min(1, (clickX + Math.cos(angle) * smoothed[i]!) / width)),
			y: Math.max(0, Math.min(1, (clickY + Math.sin(angle) * smoothed[i]!) / height)),
		});
	}

	const simplified = douglasPeucker(points, DP_TOLERANCE);
	if (simplified.length < 3) return null;
	return insetPolygon(simplified, INNER_PADDING, width, height);
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
