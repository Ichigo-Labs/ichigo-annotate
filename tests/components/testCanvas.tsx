import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Canvas } from "../../src/components/Canvas";
import type { Annotation, AnnotationClass } from "../../src/types/appState";

const classes: AnnotationClass[] = [
	{ id: "c1", name: "cat", color: "#ff0000" },
];

const annotations: Annotation[] = [
	{
		id: "a1",
		classId: "c1",
		vertices: [
			{ x: 0.1, y: 0.1 },
			{ x: 0.5, y: 0.1 },
			{ x: 0.3, y: 0.5 },
		],
	},
];

const noop = vi.fn();

const defaultProps = {
	imageUrl: "data:image/png;base64,abc",
	annotations: [] as Annotation[],
	classes,
	attributes: [] as string[],
	activeLassoPoints: null as null | { x: number; y: number }[],
	activeRectPoints: null as null | { x: number; y: number }[],
	activePolygonPoints: null as null | { x: number; y: number }[],
	activeClassId: "c1",
	selectedAnnotationId: null as string | null,
	stretchImage: true,
	trashRef: createRef<HTMLDivElement>(),
	onLassoStart: noop,
	onLassoPoint: noop,
	onLassoComplete: noop,
	onLassoCancel: noop,
	onBucketFill: noop,
	onObjectTap: noop,
	onObjectLoop: noop,
	onRectPoint: noop,
	onPolygonPoint: noop,
	canvasMode: "lasso" as const,
	onAnnotationMoveStart: noop,
	onAnnotationMove: noop,
	onAnnotationMoveEnd: noop,
	onSelectAnnotation: noop,
	onVertexMoveStart: noop,
	onVertexMove: noop,
	onVertexMoveEnd: noop,
	onNavigate: noop,
	view: { zoom: 1, x: 0, y: 0 },
	onViewChange: noop,
};

describe("Canvas", () => {
	it("renders placeholder when no image", () => {
		render(<Canvas {...defaultProps} imageUrl={null} />);
		expect(screen.getByText("Import images to get started")).toBeInTheDocument();
	});

	it("renders an image when imageUrl is provided", () => {
		render(<Canvas {...defaultProps} />);
		expect(screen.getByAltText("Annotation target")).toBeInTheDocument();
	});

	it("renders SVG overlay", () => {
		render(<Canvas {...defaultProps} />);
		expect(screen.getByTestId("canvas-svg")).toBeInTheDocument();
	});

	it("renders annotation polygons", () => {
		render(<Canvas {...defaultProps} annotations={annotations} />);
		expect(screen.getByTestId("annotation-polygon")).toBeInTheDocument();
	});

	it("renders lasso polyline when drawing", () => {
		const lassoPoints = [
			{ x: 0.1, y: 0.1 },
			{ x: 0.3, y: 0.1 },
		];
		render(<Canvas {...defaultProps} activeLassoPoints={lassoPoints} />);
		expect(screen.getByTestId("lasso-line")).toBeInTheDocument();
	});

	it("SVG uses 0-1 viewBox with no aspect ratio preservation", () => {
		render(<Canvas {...defaultProps} />);
		const svg = screen.getByTestId("canvas-svg");
		expect(svg.getAttribute("viewBox")).toBe("0 0 1 1");
		expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
	});

	it("renders annotation polygon vertices in normalized 0-1 coords", () => {
		render(<Canvas {...defaultProps} annotations={annotations} />);
		const polygon = screen
			.getByTestId("annotation-polygon")
			.querySelector("polygon:not([data-testid])");
		expect(polygon).not.toBeNull();
		const points = polygon!.getAttribute("points")!;
		// All coordinate values should be between 0 and 1.
		const values = points
			.split(/[\s,]+/)
			.map(Number)
			.filter((n) => !isNaN(n));
		for (const v of values) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}
	});

	it("does not navigate when a box is mid-draw in rect mode", () => {
		const onNavigate = vi.fn();
		render(
			<Canvas
				{...defaultProps}
				canvasMode="rect"
				activeRectPoints={[{ x: 0.2, y: 0.2 }]}
				onNavigate={onNavigate}
			/>,
		);

		fireEvent.click(screen.getByTestId("canvas"));
		expect(onNavigate).not.toHaveBeenCalled();
	});

	it("navigates in rect mode when no box anchors are placed yet", () => {
		const onNavigate = vi.fn();
		render(
			<Canvas
				{...defaultProps}
				canvasMode="rect"
				activeRectPoints={null}
				onNavigate={onNavigate}
			/>,
		);

		fireEvent.click(screen.getByTestId("canvas"));
		expect(onNavigate).toHaveBeenCalledTimes(1);
	});
});

// -- Paint order --

describe("Canvas paint order", () => {
	const sceneClasses: AnnotationClass[] = [
		{ id: "c-dialog", name: "Dialog", color: "#ff0000" },
		{ id: "c-subtext", name: "Subtext-box", color: "#00ff00" },
	];

	// The Subtext-box is listed first, as after re-drawing its parent.
	const parentAndSubtext: Annotation[] = [
		{
			id: "sub",
			classId: "c-subtext",
			vertices: [
				{ x: 0.3, y: 0.3 },
				{ x: 0.5, y: 0.3 },
				{ x: 0.4, y: 0.5 },
			],
		},
		{
			id: "dialog",
			classId: "c-dialog",
			vertices: [
				{ x: 0.1, y: 0.1 },
				{ x: 0.9, y: 0.1 },
				{ x: 0.5, y: 0.9 },
			],
		},
	];

	// Annotation ids in DOM (= paint) order; later ones draw on top.
	const paintedIds = (root: Element) =>
		Array.from(root.querySelectorAll("[data-annotation-id]")).map((el) =>
			el.getAttribute("data-annotation-id"),
		);

	it("paints a Subtext-box above its containing parent", () => {
		render(
			<Canvas
				{...defaultProps}
				classes={sceneClasses}
				annotations={parentAndSubtext}
				activeClassId="c-dialog"
			/>,
		);

		expect(paintedIds(document.body)).toEqual(["dialog", "sub"]);
	});

	it("keeps a selected parent in paint order in tap modes", () => {
		render(
			<Canvas
				{...defaultProps}
				classes={sceneClasses}
				annotations={parentAndSubtext}
				activeClassId="c-dialog"
				canvasMode="paint"
				selectedAnnotationId="dialog"
			/>,
		);

		const svg = screen.getByTestId("canvas-svg");
		expect(paintedIds(document.body)).toEqual(["dialog", "sub"]);
		expect(svg.querySelector("[data-testid='selection-indicator']")).not.toBeNull();
	});

	it("raises the selected annotation above the palette outside tap modes", () => {
		render(
			<Canvas
				{...defaultProps}
				classes={sceneClasses}
				annotations={parentAndSubtext}
				activeClassId="c-dialog"
				selectedAnnotationId="dialog"
			/>,
		);

		expect(paintedIds(screen.getByTestId("canvas-svg"))).toEqual(["sub"]);
		expect(paintedIds(document.body)).toEqual(["sub", "dialog"]);
	});
});

// -- Polygon mode --

describe("Canvas polygon mode", () => {
	it("places a vertex at the tapped normalized position", () => {
		const onPolygonPoint = vi.fn();
		const onLassoStart = vi.fn();
		render(
			<Canvas
				{...defaultProps}
				canvasMode="polygon"
				onPolygonPoint={onPolygonPoint}
				onLassoStart={onLassoStart}
			/>,
		);
		const svg = screen.getByTestId("canvas-svg");
		vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
			left: 0,
			top: 0,
			width: 200,
			height: 100,
		} as DOMRect);

		fireEvent.pointerDown(svg, { clientX: 50, clientY: 25 });

		expect(onPolygonPoint).toHaveBeenCalledWith({ x: 0.25, y: 0.25 });
		expect(onLassoStart).not.toHaveBeenCalled();
	});

	it("shows the close target on the first vertex once three are placed", () => {
		const twoPoints = [
			{ x: 0.2, y: 0.2 },
			{ x: 0.6, y: 0.2 },
		];
		const { rerender } = render(
			<Canvas {...defaultProps} canvasMode="polygon" activePolygonPoints={twoPoints} />,
		);
		expect(screen.getAllByTestId("polygon-preview-dot")).toHaveLength(2);
		expect(screen.getByTestId("polygon-preview-lines")).toBeInTheDocument();
		expect(screen.queryByTestId("polygon-close-target")).not.toBeInTheDocument();

		rerender(
			<Canvas
				{...defaultProps}
				canvasMode="polygon"
				activePolygonPoints={[...twoPoints, { x: 0.4, y: 0.6 }]}
			/>,
		);

		const target = screen.getByTestId("polygon-close-target");
		expect(target.getAttribute("cx")).toBe("0.2");
		expect(target.getAttribute("cy")).toBe("0.2");
	});

	it("does not navigate when a polygon is mid-draw", () => {
		const onNavigate = vi.fn();
		render(
			<Canvas
				{...defaultProps}
				canvasMode="polygon"
				activePolygonPoints={[{ x: 0.2, y: 0.2 }]}
				onNavigate={onNavigate}
			/>,
		);

		fireEvent.click(screen.getByTestId("canvas"));
		expect(onNavigate).not.toHaveBeenCalled();
	});
});

describe("Canvas object mode", () => {
	// Gives the overlay a 200×100 size.
	const mockImageBox = () => {
		const svg = screen.getByTestId("canvas-svg");
		vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
			left: 0,
			top: 0,
			width: 200,
			height: 100,
		} as DOMRect);
		return svg;
	};

	it("outlines the mark under a tap", () => {
		const onObjectTap = vi.fn();
		const onObjectLoop = vi.fn();
		render(
			<Canvas {...defaultProps} canvasMode="object" onObjectTap={onObjectTap} onObjectLoop={onObjectLoop} />,
		);
		const svg = mockImageBox();

		fireEvent.pointerDown(svg, { pointerId: 1, clientX: 50, clientY: 25 });
		fireEvent.pointerUp(svg, { pointerId: 1, clientX: 50, clientY: 25 });

		expect(onObjectTap).toHaveBeenCalledWith({ x: 0.25, y: 0.25 });
		expect(onObjectLoop).not.toHaveBeenCalled();
	});

	it("draws a loop from the press", () => {
		const onLassoStart = vi.fn();
		render(<Canvas {...defaultProps} canvasMode="object" onLassoStart={onLassoStart} />);
		const svg = mockImageBox();

		fireEvent.pointerDown(svg, { pointerId: 1, clientX: 50, clientY: 25 });

		expect(onLassoStart).toHaveBeenCalledWith({ x: 0.25, y: 0.25 });
	});

	it("outlines the marks inside a drawn loop instead of making the loop an annotation", () => {
		const onObjectTap = vi.fn();
		const onObjectLoop = vi.fn();
		const onLassoComplete = vi.fn();
		const onLassoCancel = vi.fn();
		const props = {
			...defaultProps,
			canvasMode: "object" as const,
			onObjectTap,
			onObjectLoop,
			onLassoComplete,
			onLassoCancel,
		};
		const loop = [
			{ x: 0.2, y: 0.2 },
			{ x: 0.4, y: 0.2 },
			{ x: 0.4, y: 0.4 },
			{ x: 0.2, y: 0.4 },
		];
		const { rerender } = render(<Canvas {...props} />);
		const svg = mockImageBox();

		fireEvent.pointerDown(svg, { pointerId: 1, clientX: 40, clientY: 20 });
		rerender(<Canvas {...props} activeLassoPoints={loop} />);
		fireEvent.pointerUp(svg, { pointerId: 1, clientX: 40, clientY: 40 });

		expect(onObjectLoop).toHaveBeenCalledWith(loop);
		expect(onObjectTap).not.toHaveBeenCalled();
		expect(onLassoComplete).not.toHaveBeenCalled();
		expect(onLassoCancel).toHaveBeenCalled();
	});

	it("does nothing when a pinch takes the press over", () => {
		const onObjectTap = vi.fn();
		render(<Canvas {...defaultProps} canvasMode="object" onObjectTap={onObjectTap} />);
		const svg = mockImageBox();

		fireEvent.pointerDown(svg, { pointerId: 1, clientX: 50, clientY: 25 });
		fireEvent.pointerCancel(svg, { pointerId: 1, clientX: 50, clientY: 25 });
		fireEvent.pointerUp(svg, { pointerId: 1, clientX: 50, clientY: 25 });

		expect(onObjectTap).not.toHaveBeenCalled();
	});
});

describe("Canvas pinch zoom", () => {
	// Gives the image box, and the overlay drawn over it, a 200×100 size.
	const mockImageBox = () => {
		const svg = screen.getByTestId("canvas-svg");
		const rect = { left: 0, top: 0, width: 200, height: 100 } as DOMRect;
		vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(rect);
		vi.spyOn(svg.parentElement!, "getBoundingClientRect").mockReturnValue(rect);
		return svg;
	};

	const finger = (id: number, x: number, y: number, isPrimary = id === 1) => ({
		pointerType: "touch",
		pointerId: id,
		isPrimary,
		clientX: x,
		clientY: y,
	});

	it("zooms around the fingers as two fingers spread", () => {
		const onViewChange = vi.fn();
		render(<Canvas {...defaultProps} canvasMode="polygon" onViewChange={onViewChange} />);
		const svg = mockImageBox();

		fireEvent.pointerDown(svg, finger(1, 80, 50));
		fireEvent.pointerDown(svg, finger(2, 120, 50));
		fireEvent.pointerMove(svg, finger(1, 60, 50));
		fireEvent.pointerMove(svg, finger(2, 140, 50));

		expect(onViewChange).toHaveBeenLastCalledWith({ zoom: 2, x: -0.5, y: -0.5 });
	});

	it("places a finger's polygon point when it lifts, not when it lands", () => {
		const onPolygonPoint = vi.fn();
		render(<Canvas {...defaultProps} canvasMode="polygon" onPolygonPoint={onPolygonPoint} />);
		const svg = mockImageBox();

		fireEvent.pointerDown(svg, finger(1, 50, 25));
		const placedOnPress = onPolygonPoint.mock.calls.length;
		fireEvent.pointerUp(svg, finger(1, 50, 25));

		expect(placedOnPress).toBe(0);
		expect(onPolygonPoint).toHaveBeenCalledWith({ x: 0.25, y: 0.25 });
	});

	it("places nothing when a second finger turns the touch into a pinch", () => {
		const onPolygonPoint = vi.fn();
		render(<Canvas {...defaultProps} canvasMode="polygon" onPolygonPoint={onPolygonPoint} />);
		const svg = mockImageBox();

		fireEvent.pointerDown(svg, finger(1, 50, 25));
		fireEvent.pointerDown(svg, finger(2, 100, 50));
		fireEvent.pointerUp(svg, finger(2, 100, 50));
		fireEvent.pointerUp(svg, finger(1, 50, 25));

		expect(onPolygonPoint).not.toHaveBeenCalled();
	});

	it("still places a pen's polygon point on press", () => {
		const onPolygonPoint = vi.fn();
		render(<Canvas {...defaultProps} canvasMode="polygon" onPolygonPoint={onPolygonPoint} />);
		const svg = mockImageBox();

		fireEvent.pointerDown(svg, { pointerType: "pen", pointerId: 5, clientX: 50, clientY: 25 });

		expect(onPolygonPoint).toHaveBeenCalledWith({ x: 0.25, y: 0.25 });
	});

	it("keeps the selection when a pinch starts on the background", () => {
		const onSelectAnnotation = vi.fn();
		render(
			<Canvas
				{...defaultProps}
				annotations={annotations}
				selectedAnnotationId="a1"
				onSelectAnnotation={onSelectAnnotation}
			/>,
		);
		const svg = mockImageBox();

		fireEvent.pointerDown(svg, finger(1, 180, 80));
		fireEvent.pointerDown(svg, finger(2, 190, 90));
		fireEvent.pointerUp(svg, finger(1, 180, 80));
		fireEvent.pointerUp(svg, finger(2, 190, 90));

		expect(onSelectAnnotation).not.toHaveBeenCalled();
	});

	it("cancels the lasso the first finger started", () => {
		const onLassoCancel = vi.fn();
		render(
			<Canvas
				{...defaultProps}
				activeLassoPoints={[{ x: 0.4, y: 0.5 }]}
				onLassoCancel={onLassoCancel}
			/>,
		);
		const svg = mockImageBox();

		fireEvent.pointerDown(svg, finger(1, 80, 50));
		fireEvent.pointerDown(svg, finger(2, 120, 50));

		expect(onLassoCancel).toHaveBeenCalled();
	});

	it("does not delete a shape a pinch starts on in delete mode", () => {
		const onSelectAnnotation = vi.fn();
		render(
			<Canvas
				{...defaultProps}
				canvasMode="delete"
				annotations={annotations}
				onSelectAnnotation={onSelectAnnotation}
			/>,
		);
		const svg = mockImageBox();
		const shape = screen.getByTestId("annotation-polygon").querySelector("polygon")!;

		fireEvent.pointerDown(shape, finger(1, 60, 20));
		fireEvent.pointerDown(svg, finger(2, 150, 80));
		fireEvent.pointerUp(shape, finger(1, 60, 20));
		fireEvent.pointerUp(svg, finger(2, 150, 80));

		expect(onSelectAnnotation).not.toHaveBeenCalled();
	});

	it("ignores taps beside the image while zoomed in", () => {
		const onNavigate = vi.fn();
		render(
			<Canvas {...defaultProps} view={{ zoom: 2, x: -0.5, y: -0.5 }} onNavigate={onNavigate} />,
		);

		fireEvent.click(screen.getByTestId("canvas"));

		expect(onNavigate).not.toHaveBeenCalled();
	});

	it("ignores the click a pinch leaves behind, but not the next tap", () => {
		const onNavigate = vi.fn();
		render(<Canvas {...defaultProps} onNavigate={onNavigate} />);
		const container = screen.getByTestId("canvas");

		fireEvent.pointerDown(container, finger(1, 10, 10));
		fireEvent.pointerDown(container, finger(2, 30, 10));
		fireEvent.pointerUp(container, finger(2, 30, 10));
		fireEvent.pointerUp(container, finger(1, 10, 10));
		fireEvent.click(container);
		const navigatedAfterPinch = onNavigate.mock.calls.length;
		fireEvent.pointerDown(container, finger(3, 10, 10, true));
		fireEvent.pointerUp(container, finger(3, 10, 10, true));
		fireEvent.click(container);

		expect(navigatedAfterPinch).toBe(0);
		expect(onNavigate).toHaveBeenCalledOnce();
	});

	it("draws the image and both overlays at the zoomed view", () => {
		render(
			<Canvas
				{...defaultProps}
				annotations={annotations}
				selectedAnnotationId="a1"
				view={{ zoom: 2, x: -0.5, y: -0.25 }}
			/>,
		);
		const layers = [
			screen.getByAltText("Annotation target"),
			...document.querySelectorAll("svg[viewBox='0 0 1 1']"),
		] as (HTMLElement | SVGElement)[];

		expect(layers).toHaveLength(3);
		for (const layer of layers) {
			expect(layer.style.transform).toBe("translate(-50%, -25%) scale(2)");
		}
	});

	it("leaves the layers untransformed when fitted", () => {
		render(<Canvas {...defaultProps} />);

		expect(screen.getByTestId("canvas-svg").style.transform).toBe("");
	});

	it("keeps preview dots and the close target the same size on screen", () => {
		render(
			<Canvas
				{...defaultProps}
				canvasMode="polygon"
				view={{ zoom: 2, x: 0, y: 0 }}
				activePolygonPoints={[
					{ x: 0.2, y: 0.2 },
					{ x: 0.6, y: 0.2 },
					{ x: 0.4, y: 0.6 },
				]}
			/>,
		);

		expect(screen.getByTestId("polygon-close-target").getAttribute("r")).toBe("0.0075");
		expect(screen.getAllByTestId("polygon-preview-dot")[0]!.getAttribute("r")).toBe("0.004");
	});
});
