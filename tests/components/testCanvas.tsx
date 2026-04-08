import { render, screen } from "@testing-library/react";
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
	activeLassoPoints: null as null | { x: number; y: number }[],
	activeClassId: "c1",
	selectedAnnotationId: null as string | null,
	stretchImage: true,
	trashRef: createRef<HTMLDivElement>(),
	onLassoStart: noop,
	onLassoPoint: noop,
	onLassoComplete: noop,
	onLassoCancel: noop,
	onBucketFill: noop,
	canvasMode: "lasso" as const,
	onAnnotationMoveStart: noop,
	onAnnotationMove: noop,
	onAnnotationMoveEnd: noop,
	onSelectAnnotation: noop,
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
});
