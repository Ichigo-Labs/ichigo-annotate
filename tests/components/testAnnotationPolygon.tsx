import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnnotationPolygon } from "../../src/components/AnnotationPolygon";
import { useRef } from "react";

const annotation = {
	id: "a1",
	classId: "c1",
	vertices: [
		{ x: 0.1, y: 0.1 },
		{ x: 0.5, y: 0.1 },
		{ x: 0.3, y: 0.5 },
	],
};

const noop = vi.fn();

// Wrapper to provide an SVG container and ref.
function Wrapper(props: { isDrawing?: boolean }) {
	const svgRef = useRef<SVGSVGElement>(null);
	return (
		<svg ref={svgRef} data-testid="test-svg">
			<AnnotationPolygon
				annotation={annotation}
				classColor="#ff0000"
				isDrawing={props.isDrawing ?? false}
				onMoveStart={noop}
				onMove={noop}
				onMoveEnd={noop}
				onVertexDragStart={noop}
				onVertexDrag={noop}
				onVertexDragEnd={noop}
				svgRef={svgRef}
			/>
		</svg>
	);
}

describe("AnnotationPolygon", () => {
	it("renders a polygon with correct points", () => {
		render(<Wrapper />);
		const polygon = screen.getByTestId("annotation-polygon").querySelector("polygon");
		expect(polygon).toBeTruthy();
		expect(polygon!.getAttribute("points")).toBe("0.1,0.1 0.5,0.1 0.3,0.5");
	});

	it("renders vertex circles for each vertex", () => {
		render(<Wrapper />);
		expect(screen.getAllByTestId("annotation-vertex")).toHaveLength(3);
	});

	it("has pointer-events none when drawing", () => {
		render(<Wrapper isDrawing={true} />);
		const g = screen.getByTestId("annotation-polygon");
		expect(g.style.pointerEvents).toBe("none");
	});
});
