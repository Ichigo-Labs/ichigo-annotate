import type { Point } from "../types/appState";

// Outlines a mark on the image (a heart, a sweat drop, a star, an anger mark)
// from a tap on it, or every mark inside a loop drawn around them. "Ink" is
// any pixel whose colour stands out from the paper around it, so coloured
// marks work as well as black ones. The outline is the convex hull of the
// mark's pixels plus a pixel of padding.

// RGBA pixels, row-major (the layout of ImageData).
export interface Pixels {
	data: Uint8ClampedArray | Uint8Array;
	width: number;
	height: number;
}

export type ObjectSelection =
	| { vertices: Point[] }
	| { error: "nothing" | "too-big" };

// A pixel is ink when its colour is at least this far (RGB distance) from
// the paper's. Pixels half as far still join a mark, so anti-aliased edges
// are included.
const INK_DISTANCE = 48;
// A pixel joins a mark when its colour is within this share of the mark's
// contrast with the paper (so a pink mark doesn't take touching black ink).
const MARK_TOLERANCE = 0.6;
// A tap on paper this close (px) to ink snaps to it.
const SNAP_RADIUS = 10;
// Paper fully enclosed by ink, up to this share of the image, is the inside
// of an outlined mark (a tap in the middle of an outlined heart).
const MAX_ENCLOSED_RATIO = 0.1;
// A tapped mark larger than this share of the image is the bubble outline or
// the art, not a mark.
const MAX_OBJECT_RATIO = 0.25;
// A tap counts as on a filled area when ink surrounds it this far (px).
const FILLED_RADIUS = 2;
// Cap on how thick (px either side) a connection to a filled mark can be and
// still be cut, so a solid heart touching the bubble outline or a glyph
// doesn't take them along.
const MAX_BRIDGE_RADIUS = 3;
// Clearance between the mark and its outline (px).
const PADDING = 1;
// Specks smaller than this (px) inside a loop are noise.
const MIN_SPECK = 3;

type Rgb = [number, number, number];

// --- Public API ---

// Outline the mark at pixel (x, y).
export function selectObjectAt(img: Pixels, x: number, y: number): ObjectSelection {
	const { width, height } = img;
	if (x < 0 || y < 0 || x >= width || y >= height) return { error: "nothing" };
	const paper = paperAround(img, x, y);
	const total = width * height;

	let mask: Uint8Array;
	if (colorDistance(colorAt(img, x, y), paper) > INK_DISTANCE) {
		mask = markFrom(img, [y * width + x], paper);
	} else {
		// On paper: inside an outlined mark, or just beside a mark.
		const inside = enclosedPaper(img, x, y, paper, total * MAX_ENCLOSED_RATIO);
		if (inside) {
			mask = outlinedMark(img, inside, paper);
		} else {
			const near = nearestInk(img, x, y, paper);
			if (near < 0) return { error: "nothing" };
			mask = markFrom(img, [near], paper);
		}
	}
	if (isTooBig(mask, width, height)) return { error: "too-big" };
	return hullOf(mask, width, height);
}

// Outline every mark inside a loop given in pixel coordinates.
export function selectObjectsInLoop(img: Pixels, loop: [number, number][]): ObjectSelection {
	const { width, height } = img;
	if (loop.length < 3) return { error: "nothing" };
	const inside = fillPolygon(loop, width, height);
	const paper = paperAlong(img, loop);
	const mask = new Uint8Array(width * height);
	for (let i = 0; i < mask.length; i++) {
		if (inside[i] && colorDistance(colorAtIndex(img, i), paper) > INK_DISTANCE) mask[i] = 1;
	}
	dropSpecks(mask, width, height, MIN_SPECK);
	return hullOf(mask, width, height);
}

// --- Image loading (browser) ---

let cached: { url: string; pixels: Pixels } | null = null;

async function pixelsOf(imageUrl: string): Promise<Pixels> {
	if (cached?.url === imageUrl) return cached.pixels;
	const img = await new Promise<HTMLImageElement>((resolve, reject) => {
		const el = new Image();
		el.onload = () => resolve(el);
		el.onerror = reject;
		el.src = imageUrl;
	});
	const canvas = document.createElement("canvas");
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(img, 0, 0);
	const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
	cached = { url: imageUrl, pixels };
	return pixels;
}

// The mark at a normalized point of the image.
export async function objectAtPoint(imageUrl: string, point: Point): Promise<ObjectSelection> {
	const px = await pixelsOf(imageUrl);
	const x = Math.min(px.width - 1, Math.floor(point.x * px.width));
	const y = Math.min(px.height - 1, Math.floor(point.y * px.height));
	return selectObjectAt(px, x, y);
}

// The marks inside a loop of normalized points.
export async function objectsInLoop(imageUrl: string, loop: Point[]): Promise<ObjectSelection> {
	const px = await pixelsOf(imageUrl);
	return selectObjectsInLoop(px, loop.map((p) => [p.x * px.width, p.y * px.height]));
}

// --- Colours ---

function colorAtIndex(img: Pixels, i: number): Rgb {
	const d = img.data;
	return [d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!];
}

function colorAt(img: Pixels, x: number, y: number): Rgb {
	return colorAtIndex(img, y * img.width + x);
}

function colorDistance(a: Rgb, b: Rgb): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// The most common colour among the given pixels (16 levels per channel),
// averaged over its bin: the paper, for pixels sampled around a mark.
function dominantColor(img: Pixels, indices: number[]): Rgb {
	const bins = new Map<number, number[]>();
	for (const i of indices) {
		const [r, g, b] = colorAtIndex(img, i);
		const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
		const bin = bins.get(key);
		if (bin) bin.push(i);
		else bins.set(key, [i]);
	}
	let best: number[] = [];
	for (const bin of bins.values()) if (bin.length > best.length) best = bin;
	const sum: Rgb = [0, 0, 0];
	for (const i of best) {
		const c = colorAtIndex(img, i);
		sum[0] += c[0];
		sum[1] += c[1];
		sum[2] += c[2];
	}
	return [sum[0] / best.length, sum[1] / best.length, sum[2] / best.length];
}

// The paper colour around (x, y): the dominant colour on the border of a
// window around it, sized to the image.
function paperAround(img: Pixels, x: number, y: number): Rgb {
	const { width, height } = img;
	const half = Math.max(8, Math.min(48, Math.round(Math.min(width, height) * 0.2)));
	const x0 = Math.max(0, x - half);
	const x1 = Math.min(width - 1, x + half);
	const y0 = Math.max(0, y - half);
	const y1 = Math.min(height - 1, y + half);
	const ring: number[] = [];
	for (let i = x0; i <= x1; i++) ring.push(y0 * width + i, y1 * width + i);
	for (let j = y0 + 1; j < y1; j++) ring.push(j * width + x0, j * width + x1);
	return dominantColor(img, ring);
}

// The paper colour under a loop drawn around marks.
function paperAlong(img: Pixels, loop: [number, number][]): Rgb {
	const { width, height } = img;
	const samples: number[] = [];
	for (let k = 0; k < loop.length; k++) {
		const [ax, ay] = loop[k]!;
		const [bx, by] = loop[(k + 1) % loop.length]!;
		const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
		for (let s = 0; s < steps; s++) {
			const px = Math.floor(ax + ((bx - ax) * s) / steps);
			const py = Math.floor(ay + ((by - ay) * s) / steps);
			if (px >= 0 && py >= 0 && px < width && py < height) samples.push(py * width + px);
		}
	}
	return samples.length > 0 ? dominantColor(img, samples) : [255, 255, 255];
}

// --- Regions ---

const N4: [number, number][] = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
];
const N8: [number, number][] = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Grow a region from the seeds over the pixels `accept` allows. Stops early
// (returning null) once it exceeds `limit` pixels or reaches the image edge
// when `enclosed` is asked for.
function grow(
	width: number,
	height: number,
	seeds: number[],
	neighbours: [number, number][],
	accept: (i: number) => boolean,
	limit = Infinity,
	enclosed = false,
): Uint8Array | null {
	const mask = new Uint8Array(width * height);
	const queue = new Int32Array(width * height);
	let head = 0;
	let tail = 0;
	for (const s of seeds) {
		if (!mask[s]) {
			mask[s] = 1;
			queue[tail++] = s;
		}
	}
	while (head < tail) {
		const i = queue[head++]!;
		const x = i % width;
		const y = (i - x) / width;
		if (enclosed && (x === 0 || y === 0 || x === width - 1 || y === height - 1)) return null;
		for (const [dx, dy] of neighbours) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
			const n = ny * width + nx;
			if (mask[n] || !accept(n)) continue;
			mask[n] = 1;
			queue[tail++] = n;
			if (tail > limit) return null;
		}
	}
	return mask;
}

// The connected mark around the seed pixels: pixels that stand out from the
// paper and are close to the mark's colour. When the tap is on a filled area
// (a solid heart), strokes thinner than the mark (a bubble outline, a glyph)
// are cut off; a line drawing (an outlined heart) keeps all its strokes.
function markFrom(img: Pixels, seeds: number[], paper: Rgb): Uint8Array {
	const { width, height } = img;
	const ink = markColor(img, seeds, paper);
	const tolerance = MARK_TOLERANCE * colorDistance(ink, paper);
	const mask = grow(width, height, seeds, N8, (n) => {
		const c = colorAtIndex(img, n);
		return colorDistance(c, paper) > INK_DISTANCE / 2 && colorDistance(c, ink) <= tolerance;
	})!;
	// The mark's half-thickness at the tap decides how thick a stroke is cut.
	let depth = 0;
	while (
		depth < MAX_BRIDGE_RADIUS + 1 &&
		seeds.some((s) => isFilledAround(mask, width, height, s, depth + 1))
	) {
		depth++;
	}
	return depth >= FILLED_RADIUS ? cutBridges(mask, width, height, seeds, depth - 1) : mask;
}

// True when every pixel within `r` of pixel `i` is in the mask.
function isFilledAround(mask: Uint8Array, width: number, height: number, i: number, r: number): boolean {
	const x = i % width;
	const y = (i - x) / width;
	for (let dy = -r; dy <= r; dy++) {
		for (let dx = -r; dx <= r; dx++) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) return false;
		}
	}
	return true;
}

// The mark's own colour: the pixel near the seeds that stands out most from
// the paper (a tap may land on an anti-aliased edge pixel).
function markColor(img: Pixels, seeds: number[], paper: Rgb): Rgb {
	const { width, height } = img;
	let best = colorAtIndex(img, seeds[0]!);
	let bestD = -1;
	for (const s of seeds.slice(0, 200)) {
		const sx = s % width;
		const sy = (s - sx) / width;
		for (let dy = -2; dy <= 2; dy++) {
			for (let dx = -2; dx <= 2; dx++) {
				const nx = sx + dx;
				const ny = sy + dy;
				if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
				const c = colorAt(img, nx, ny);
				const d = colorDistance(c, paper);
				if (d > bestD) {
					best = c;
					bestD = d;
				}
			}
		}
	}
	return best;
}

// A tap on paper fully enclosed by ink (the middle of an outlined heart):
// that paper, or null when the paper reaches the edge or is too large.
function enclosedPaper(
	img: Pixels,
	x: number,
	y: number,
	paper: Rgb,
	limit: number,
): Uint8Array | null {
	return grow(
		img.width,
		img.height,
		[y * img.width + x],
		N4,
		(n) => colorDistance(colorAtIndex(img, n), paper) <= INK_DISTANCE,
		limit,
		true,
	);
}

// An outlined mark: the enclosed paper plus the ink ring around it.
function outlinedMark(img: Pixels, inside: Uint8Array, paper: Rgb): Uint8Array {
	const { width, height } = img;
	const rim: number[] = [];
	for (let i = 0; i < inside.length; i++) {
		if (!inside[i]) continue;
		const x = i % width;
		const y = (i - x) / width;
		for (const [dx, dy] of N8) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
			const n = ny * width + nx;
			if (!inside[n] && colorDistance(colorAtIndex(img, n), paper) > INK_DISTANCE / 2) rim.push(n);
		}
	}
	const ring = rim.length > 0 ? markFrom(img, rim, paper) : new Uint8Array(inside.length);
	for (let i = 0; i < ring.length; i++) if (inside[i]) ring[i] = 1;
	return ring;
}

// The nearest ink pixel within SNAP_RADIUS of (x, y), or -1.
function nearestInk(img: Pixels, x: number, y: number, paper: Rgb): number {
	const { width, height } = img;
	let best = -1;
	let bestD = Infinity;
	for (let dy = -SNAP_RADIUS; dy <= SNAP_RADIUS; dy++) {
		for (let dx = -SNAP_RADIUS; dx <= SNAP_RADIUS; dx++) {
			const d = dx * dx + dy * dy;
			if (d > SNAP_RADIUS * SNAP_RADIUS || d >= bestD) continue;
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
			if (colorDistance(colorAt(img, nx, ny), paper) > INK_DISTANCE) {
				best = ny * width + nx;
				bestD = d;
			}
		}
	}
	return best;
}

// --- Morphology ---

// Square erosion or dilation by `r` px.
function morph(mask: Uint8Array, width: number, height: number, r: number, erode: boolean): Uint8Array {
	const out = new Uint8Array(mask.length);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let hit = erode;
			for (let dy = -r; dy <= r && hit === erode; dy++) {
				for (let dx = -r; dx <= r; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					const on = nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx] === 1;
					if (erode ? !on : on) {
						hit = !erode;
						break;
					}
				}
			}
			out[y * width + x] = hit ? 1 : 0;
		}
	}
	return out;
}

// Cut connections thinner than 2 * radius + 1 px: erode, keep what still
// connects to the seeds, grow it back within the mask (one pixel further, so
// a round mark's rim isn't shaved off). Thin marks that erosion removes
// entirely are kept as they are.
function cutBridges(
	mask: Uint8Array,
	width: number,
	height: number,
	seeds: number[],
	radius: number,
): Uint8Array {
	const core = morph(mask, width, height, radius, true);
	// Seeds near the eroded core anchor it (a seed on a thin edge pixel).
	const anchors: number[] = [];
	for (const s of seeds) {
		const sx = s % width;
		const sy = (s - sx) / width;
		for (let dy = -radius - 1; dy <= radius + 1; dy++) {
			for (let dx = -radius - 1; dx <= radius + 1; dx++) {
				const nx = sx + dx;
				const ny = sy + dy;
				if (nx >= 0 && ny >= 0 && nx < width && ny < height && core[ny * width + nx]) anchors.push(ny * width + nx);
			}
		}
	}
	if (anchors.length === 0) return mask;
	const kept = grow(width, height, anchors, N8, (n) => core[n] === 1)!;
	const back = morph(kept, width, height, radius + 1, false);
	for (let i = 0; i < back.length; i++) back[i] = back[i] && mask[i] ? 1 : 0;
	return back;
}

// Remove connected specks smaller than `min` pixels.
function dropSpecks(mask: Uint8Array, width: number, height: number, min: number): void {
	const seen = new Uint8Array(mask.length);
	for (let i = 0; i < mask.length; i++) {
		if (!mask[i] || seen[i]) continue;
		const comp = grow(width, height, [i], N8, (n) => mask[n] === 1)!;
		const members: number[] = [];
		for (let j = 0; j < comp.length; j++) if (comp[j]) members.push(j);
		for (const j of members) seen[j] = 1;
		if (members.length < min) for (const j of members) mask[j] = 0;
	}
}

// --- Geometry ---

function isTooBig(mask: Uint8Array, width: number, height: number): boolean {
	let count = 0;
	let x0 = width;
	let x1 = -1;
	let y0 = height;
	let y1 = -1;
	for (let i = 0; i < mask.length; i++) {
		if (!mask[i]) continue;
		count++;
		const x = i % width;
		const y = (i - x) / width;
		x0 = Math.min(x0, x);
		x1 = Math.max(x1, x);
		y0 = Math.min(y0, y);
		y1 = Math.max(y1, y);
	}
	if (count > MAX_OBJECT_RATIO * width * height) return true;
	// Spanning nearly the whole image both ways: the bubble outline.
	return x1 - x0 + 1 >= 0.9 * width && y1 - y0 + 1 >= 0.9 * height;
}

// Pixels inside a polygon (pixel centres, even-odd rule), by scanline.
function fillPolygon(poly: [number, number][], width: number, height: number): Uint8Array {
	const mask = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		const cy = y + 0.5;
		const xs: number[] = [];
		for (let k = 0; k < poly.length; k++) {
			const [ax, ay] = poly[k]!;
			const [bx, by] = poly[(k + 1) % poly.length]!;
			if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
				xs.push(ax + ((cy - ay) * (bx - ax)) / (by - ay));
			}
		}
		xs.sort((a, b) => a - b);
		for (let k = 0; k + 1 < xs.length; k += 2) {
			const from = Math.max(0, Math.ceil(xs[k]! - 0.5));
			const to = Math.min(width - 1, Math.floor(xs[k + 1]! - 0.5));
			for (let x = from; x <= to; x++) mask[y * width + x] = 1;
		}
	}
	return mask;
}

// Convex hull of the mask's pixels grown by PADDING, as normalized vertices.
function hullOf(mask: Uint8Array, width: number, height: number): ObjectSelection {
	const pts: [number, number][] = [];
	for (let y = 0; y < height; y++) {
		let first = -1;
		let last = -1;
		for (let x = 0; x < width; x++) {
			if (!mask[y * width + x]) continue;
			if (first < 0) first = x;
			last = x;
		}
		if (first < 0) continue;
		const top = Math.max(0, y - PADDING);
		const bottom = Math.min(height, y + 1 + PADDING);
		const left = Math.max(0, first - PADDING);
		const right = Math.min(width, last + 1 + PADDING);
		pts.push([left, top], [left, bottom], [right, top], [right, bottom]);
	}
	if (pts.length === 0) return { error: "nothing" };
	const hull = convexHull(pts);
	if (hull.length < 3) return { error: "nothing" };
	return { vertices: hull.map(([x, y]) => ({ x: x / width, y: y / height })) };
}

// Andrew's monotone chain; drops collinear points.
function convexHull(points: [number, number][]): [number, number][] {
	const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
		(a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: [number, number][] = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper: [number, number][] = [];
	for (let i = pts.length - 1; i >= 0; i--) {
		const p = pts[i]!;
		while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
		upper.push(p);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
