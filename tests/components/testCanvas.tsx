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
	imageDataUrl: "data:image/png;base64,abc",
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
};

describe("Canvas", () => {
	it("renders placeholder when no image", () => {
		render(<Canvas {...defaultProps} imageDataUrl={null} />);
		expect(screen.getByText("Import images to get started")).toBeInTheDocument();
	});

	it("renders an image when imageDataUrl is provided", () => {
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
