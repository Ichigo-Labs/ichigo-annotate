import type { Point } from "../types/appState";

// Outlines a mark on the image (a heart, a sweat drop, a star, an anger mark)
// from a tap on it, or every mark inside a loop drawn around them. "Ink" is
// any pixel whose colour stands out from the paper around it, so coloured
// marks work as well as black ones. The outline follows the mark's own shape
// (a heart keeps its notch) a couple of pixels out from its edge.

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
// A piece the cut takes off a filled mark goes back (as the mark's own tip)
// when it is at most this share of the mark.
const MAX_TIP_SHARE = 0.15;
// Clearance between the mark and its outline (px).
const PADDING = 2;
// Outline corners closer than this (px) to a straight run are dropped, which
// smooths pixel steps without cutting into the clearance.
const SIMPLIFY_TOLERANCE = 1;
// Separate marks in one outline are joined by corridors this many pixels
// either side of their centre line.
const CORRIDOR_RADIUS = 1;
// Past this many separate pieces (or this much edge to compare), joining them
// one by one is too slow and the outline falls back to their convex hull.
const MAX_PIECES = 24;
const MAX_EDGE_PIXELS = 4000;
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
	return outlineOf(mask, width, height);
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
	return outlineOf(mask, width, height);
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
	restoreTips(back, mask, width, height, radius);
	return back;
}

// A mark's own thin parts are cut too: its sharp points (a heart's tip) and
// the thin side of a half-outlined heart. Cut-off pieces go back when they are
// small and lead nowhere, or when they join the mark at both ends (a stroke
// of the mark, not a bridge) and are no bigger than it. A glyph or a bubble
// outline beyond a bridge joins once.
function restoreTips(kept: Uint8Array, mask: Uint8Array, width: number, height: number, radius: number): void {
	let size = 0;
	for (let i = 0; i < kept.length; i++) size += kept[i]!;
	const cut = new Uint8Array(mask.length);
	for (let i = 0; i < mask.length; i++) cut[i] = mask[i] && !kept[i] ? 1 : 0;
	const seen = new Uint8Array(mask.length);
	for (let i = 0; i < cut.length; i++) {
		if (!cut[i] || seen[i]) continue;
		const piece = grow(width, height, [i], N8, (n) => cut[n] === 1)!;
		const members: number[] = [];
		let x0 = width;
		let x1 = -1;
		let y0 = height;
		let y1 = -1;
		for (let j = 0; j < piece.length; j++) {
			if (!piece[j]) continue;
			seen[j] = 1;
			members.push(j);
			const x = j % width;
			const y = (j - x) / width;
			x0 = Math.min(x0, x);
			x1 = Math.max(x1, x);
			y0 = Math.min(y0, y);
			y1 = Math.max(y1, y);
		}
		const extent = Math.max(x1 - x0, y1 - y0) + 1;
		const isTip = members.length <= MAX_TIP_SHARE * size && extent <= 3 * (radius + 1);
		const isStroke = members.length <= size && joins(members, kept, width, height) >= 2;
		if (isTip || isStroke) {
			for (const j of members) kept[j] = 1;
		}
	}
}

// Within 2 px, counting as one place where a cut piece joins the mark.
const NEAR: [number, number][] = [];
for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx || dy) NEAR.push([dx, dy]);

// How many separate places a piece's pixels touch the kept mark.
function joins(members: number[], kept: Uint8Array, width: number, height: number): number {
	const contact = new Uint8Array(kept.length);
	const touching: number[] = [];
	for (const j of members) {
		const x = j % width;
		const y = (j - x) / width;
		const touches = N8.some(([dx, dy]) => {
			const nx = x + dx;
			const ny = y + dy;
			return nx >= 0 && ny >= 0 && nx < width && ny < height && kept[ny * width + nx] === 1;
		});
		if (touches) {
			contact[j] = 1;
			touching.push(j);
		}
	}
	const seen = new Uint8Array(kept.length);
	let count = 0;
	for (const j of touching) {
		if (seen[j]) continue;
		count++;
		const place = grow(width, height, [j], NEAR, (n) => contact[n] === 1)!;
		for (const k of touching) if (place[k]) seen[k] = 1;
	}
	return count;
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

// The outline of the mask's pixels grown by PADDING, as normalized vertices.
// Separate pieces are joined by narrow corridors into one shape; holes (the
// inside of an outlined mark) are part of it.
function outlineOf(mask: Uint8Array, width: number, height: number): ObjectSelection {
	if (!mask.includes(1)) return { error: "nothing" };
	const shape = dilateRound(mask, width, height, PADDING);
	if (!joinPieces(shape, width, height)) return hullOf(mask, width, height);
	fillHoles(shape, width, height);
	closePinches(shape, width, height);
	const traced = traceOutline(shape, width, height);
	let ring = simplifyRing(traced, SIMPLIFY_TOLERANCE);
	if (!isSimpleRing(ring)) ring = simplifyRing(traced, SIMPLIFY_TOLERANCE / 2);
	if (!isSimpleRing(ring)) ring = traced;
	if (ring.length < 3) return { error: "nothing" };
	return { vertices: ring.map(([x, y]) => ({ x: x / width, y: y / height })) };
}

// Dilation by a round brush of radius `r` px.
function dilateRound(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
	const brush: [number, number][] = [];
	for (let dy = -r; dy <= r; dy++) {
		for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) brush.push([dx, dy]);
	}
	const out = new Uint8Array(mask.length);
	for (let i = 0; i < mask.length; i++) {
		if (!mask[i]) continue;
		const x = i % width;
		const y = (i - x) / width;
		for (const [dx, dy] of brush) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx >= 0 && ny >= 0 && nx < width && ny < height) out[ny * width + nx] = 1;
		}
	}
	return out;
}

// Join the mask's separate (4-connected) pieces with corridors between their
// closest pixels, nearest piece first. False when there are too many pieces.
function joinPieces(mask: Uint8Array, width: number, height: number): boolean {
	const pieces: number[][] = [];
	const seen = new Uint8Array(mask.length);
	for (let i = 0; i < mask.length; i++) {
		if (!mask[i] || seen[i]) continue;
		const comp = grow(width, height, [i], N4, (n) => mask[n] === 1)!;
		const edge: number[] = [];
		for (let j = 0; j < comp.length; j++) {
			if (!comp[j]) continue;
			seen[j] = 1;
			if (isEdgePixel(comp, width, height, j)) edge.push(j);
		}
		pieces.push(edge);
	}
	if (pieces.length === 1) return true;
	if (pieces.length > MAX_PIECES || pieces.reduce((n, p) => n + p.length, 0) > MAX_EDGE_PIXELS) return false;
	// Prim's algorithm over the pieces, by closest edge-pixel pair; among
	// equally close pairs, the one nearest the middle of the two pieces, so
	// the corridor runs through the middle rather than along an edge.
	const centre = (piece: number[]) => {
		let sx = 0;
		let sy = 0;
		for (const i of piece) {
			const x = i % width;
			sx += x;
			sy += (i - x) / width;
		}
		return [sx / piece.length, sy / piece.length] as const;
	};
	const joined = [pieces[0]!];
	const rest = pieces.slice(1);
	while (rest.length > 0) {
		const [jx, jy] = centre(joined.flat());
		let best = { d: Infinity, off: Infinity, k: -1, a: 0, b: 0 };
		for (let k = 0; k < rest.length; k++) {
			const [kx, ky] = centre(rest[k]!);
			const mx = (jx + kx) / 2;
			const my = (jy + ky) / 2;
			for (const a of joined.flat()) {
				for (const b of rest[k]!) {
					const d = squaredDistance(a, b, width);
					if (d > best.d) continue;
					const ax = a % width;
					const bx = b % width;
					const off = ((ax + bx) / 2 - mx) ** 2 + (((a - ax) / width + (b - bx) / width) / 2 - my) ** 2;
					if (d < best.d || off < best.off) best = { d, off, k, a, b };
				}
			}
		}
		paintCorridor(mask, width, height, best.a, best.b);
		joined.push(rest[best.k]!);
		rest.splice(best.k, 1);
	}
	return true;
}

function isEdgePixel(mask: Uint8Array, width: number, height: number, i: number): boolean {
	const x = i % width;
	const y = (i - x) / width;
	return N4.some(([dx, dy]) => {
		const nx = x + dx;
		const ny = y + dy;
		return nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx];
	});
}

function squaredDistance(a: number, b: number, width: number): number {
	const ax = a % width;
	const bx = b % width;
	const dy = (a - ax) / width - (b - bx) / width;
	return (ax - bx) ** 2 + dy ** 2;
}

// Fill every pixel within CORRIDOR_RADIUS of the segment between two pixels.
function paintCorridor(mask: Uint8Array, width: number, height: number, a: number, b: number): void {
	const ax = a % width;
	const ay = (a - ax) / width;
	const bx = b % width;
	const by = (b - bx) / width;
	const r = CORRIDOR_RADIUS + 0.5;
	const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
	for (let y = Math.max(0, Math.floor(Math.min(ay, by) - r)); y <= Math.min(height - 1, Math.ceil(Math.max(ay, by) + r)); y++) {
		for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - r)); x <= Math.min(width - 1, Math.ceil(Math.max(ax, bx) + r)); x++) {
			const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
			if (Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) <= r) mask[y * width + x] = 1;
		}
	}
}

// Fill background enclosed by the mask (not reachable from the image edge).
function fillHoles(mask: Uint8Array, width: number, height: number): void {
	const border: number[] = [];
	for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
	for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
	const outside = grow(width, height, border.filter((i) => !mask[i]), N4, (n) => !mask[n])!;
	for (let i = 0; i < mask.length; i++) if (!outside[i]) mask[i] = 1;
}

// Fill one pixel of every 2 x 2 block whose pixels touch only diagonally, so
// the traced outline never touches itself at a corner.
function closePinches(mask: Uint8Array, width: number, height: number): void {
	let changed = true;
	while (changed) {
		changed = false;
		for (let y = 0; y + 1 < height; y++) {
			for (let x = 0; x + 1 < width; x++) {
				const i = y * width + x;
				const tl = mask[i];
				const tr = mask[i + 1];
				const bl = mask[i + width];
				const br = mask[i + width + 1];
				if (tl && br && !tr && !bl) {
					mask[i + 1] = 1;
					changed = true;
				} else if (tr && bl && !tl && !br) {
					mask[i] = 1;
					changed = true;
				}
			}
		}
	}
}

// The outer boundary of a single 4-connected shape along pixel edges, as
// pixel-corner coordinates (one vertex per turn).
function traceOutline(mask: Uint8Array, width: number, height: number): [number, number][] {
	const start = mask.indexOf(1);
	const sx = start % width;
	const sy = (start - sx) / width;
	const on = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
	// Walk with the shape on the right-hand side, starting along the top edge
	// of its first pixel.
	let x = sx;
	let y = sy;
	let dx = 1;
	let dy = 0;
	const ring: [number, number][] = [[sx, sy]];
	for (let steps = 0; steps < 4 * (width + 1) * (height + 1); steps++) {
		// The pixels ahead on the right and on the left of this corner.
		const rx = -dy;
		const ry = dx;
		const aheadRight = on(Math.floor(x + (dx + rx) / 2), Math.floor(y + (dy + ry) / 2));
		const aheadLeft = on(Math.floor(x + (dx - rx) / 2), Math.floor(y + (dy - ry) / 2));
		let nx = dx;
		let ny = dy;
		if (!aheadRight) {
			nx = rx;
			ny = ry;
		} else if (aheadLeft) {
			nx = -rx;
			ny = -ry;
		}
		if ((nx !== dx || ny !== dy) && !(x === sx && y === sy)) ring.push([x, y]);
		dx = nx;
		dy = ny;
		x += dx;
		y += dy;
		if (x === sx && y === sy) break;
	}
	return ring;
}

// Douglas-Peucker simplification of a closed ring.
function simplifyRing(ring: [number, number][], tolerance: number): [number, number][] {
	if (ring.length <= 4) return ring;
	// Split at the vertex farthest from the first, simplify both halves.
	let far = 0;
	let farD = -1;
	for (let k = 1; k < ring.length; k++) {
		const d = Math.hypot(ring[k]![0] - ring[0]![0], ring[k]![1] - ring[0]![1]);
		if (d > farD) {
			farD = d;
			far = k;
		}
	}
	const first = simplifyChain(ring.slice(0, far + 1), tolerance);
	const second = simplifyChain([...ring.slice(far), ring[0]!], tolerance);
	return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function simplifyChain(chain: [number, number][], tolerance: number): [number, number][] {
	if (chain.length <= 2) return chain;
	const [ax, ay] = chain[0]!;
	const [bx, by] = chain[chain.length - 1]!;
	const len = Math.hypot(bx - ax, by - ay);
	let worst = 0;
	let worstD = -1;
	for (let k = 1; k < chain.length - 1; k++) {
		const [px, py] = chain[k]!;
		const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
		if (d > worstD) {
			worstD = d;
			worst = k;
		}
	}
	if (worstD <= tolerance) return [chain[0]!, chain[chain.length - 1]!];
	const left = simplifyChain(chain.slice(0, worst + 1), tolerance);
	const right = simplifyChain(chain.slice(worst), tolerance);
	return [...left.slice(0, -1), ...right];
}

// True when no two non-adjacent edges of the ring cross or touch.
function isSimpleRing(ring: [number, number][]): boolean {
	const n = ring.length;
	if (n < 3) return false;
	const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
		(a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const onSegment = (p: [number, number], a: [number, number], b: [number, number]) =>
		Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
	for (let i = 0; i < n; i++) {
		const a = ring[i]!;
		const b = ring[(i + 1) % n]!;
		for (let j = i + 2; j < n; j++) {
			if (i === 0 && j === n - 1) continue;
			const c = ring[j]!;
			const d = ring[(j + 1) % n]!;
			const d1 = cross(c, d, a);
			const d2 = cross(c, d, b);
			const d3 = cross(a, b, c);
			const d4 = cross(a, b, d);
			if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return false;
			if ((d1 === 0 && onSegment(a, c, d)) || (d2 === 0 && onSegment(b, c, d))) return false;
			if ((d3 === 0 && onSegment(c, a, b)) || (d4 === 0 && onSegment(d, a, b))) return false;
		}
	}
	return true;
}

// Convex hull of the mask's pixels grown by PADDING, as normalized vertices
// (for a loop around too many separate pieces to join).
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
