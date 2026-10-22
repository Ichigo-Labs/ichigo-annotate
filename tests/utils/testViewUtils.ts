import { describe, expect, it } from "vitest";
import { MAX_ZOOM, clampView, pinchView, viewTransform } from "../../src/utils/viewUtils";

const fitted = { zoom: 1, x: 0, y: 0 };
const box = { width: 200, height: 100 };

describe("clampView", () => {
	it("keeps the zoom between fitted and the maximum", () => {
		expect(clampView({ zoom: 0.5, x: 0, y: 0 }).zoom).toBe(1);
		expect(clampView({ zoom: MAX_ZOOM * 2, x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
	});

	it("keeps the zoomed image covering its box", () => {
		expect(clampView({ zoom: 2, x: 0.3, y: -1.5 })).toEqual({ zoom: 2, x: 0, y: -1 });
	});

	it("allows no panning when fitted", () => {
		expect(clampView({ zoom: 1, x: -0.2, y: 0.2 })).toEqual(fitted);
	});
});

describe("pinchView", () => {
	it("zooms by the finger spread around the fingers' midpoint", () => {
		const view = pinchView(
			fitted,
			[{ x: 80, y: 50 }, { x: 120, y: 50 }],
			[{ x: 60, y: 50 }, { x: 140, y: 50 }],
			box,
		);

		// The image centre stays under the fingers: -0.5 + 2 * 0.5 = 0.5.
		expect(view).toEqual({ zoom: 2, x: -0.5, y: -0.5 });
	});

	it("pans with the fingers' midpoint", () => {
		const view = pinchView(
			{ zoom: 2, x: -0.5, y: -0.5 },
			[{ x: 80, y: 50 }, { x: 120, y: 50 }],
			[{ x: 100, y: 50 }, { x: 140, y: 50 }],
			box,
		);

		expect(view).toEqual({ zoom: 2, x: -0.4, y: -0.5 });
	});

	it("measures the spread in pixels, so turning the fingers keeps the zoom", () => {
		const view = pinchView(
			{ zoom: 2, x: -0.5, y: -0.5 },
			[{ x: 80, y: 50 }, { x: 120, y: 50 }],
			[{ x: 100, y: 30 }, { x: 100, y: 70 }],
			box,
		);

		expect(view.zoom).toBe(2);
	});

	it("stops at the maximum zoom with the fingers' point still under them", () => {
		const view = pinchView(
			fitted,
			[{ x: 90, y: 50 }, { x: 110, y: 50 }],
			[{ x: -100, y: 50 }, { x: 300, y: 50 }],
			box,
		);

		expect(view).toEqual({ zoom: MAX_ZOOM, x: 0.5 - 0.5 * MAX_ZOOM, y: 0.5 - 0.5 * MAX_ZOOM });
	});

	it("can't zoom out past fitted", () => {
		const view = pinchView(
			fitted,
			[{ x: 60, y: 50 }, { x: 140, y: 50 }],
			[{ x: 90, y: 50 }, { x: 110, y: 50 }],
			box,
		);

		expect(view).toEqual(fitted);
	});
});

describe("viewTransform", () => {
	it("translates by a fraction of the box, then scales", () => {
		expect(viewTransform({ zoom: 2, x: -0.5, y: -0.25 })).toBe("translate(-50%, -25%) scale(2)");
	});
});
