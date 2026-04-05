import { render, screen } from "@testing-library/react";
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
	onLassoStart: noop,
	onLassoPoint: noop,
	onLassoComplete: noop,
	onLassoCancel: noop,
	onAnnotationMoveStart: noop,
	onAnnotationMove: noop,
	onAnnotationMoveEnd: noop,
	onVertexDragStart: noop,
	onVertexDrag: noop,
	onVertexDragEnd: noop,
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
});
