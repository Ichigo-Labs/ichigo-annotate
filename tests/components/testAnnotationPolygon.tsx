import { fireEvent, render, screen } from "@testing-library/react";
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

function renderWith(props: Partial<React.ComponentProps<typeof Wrapper>> & { onSelect?: (id: string) => void } = {}) {
	return render(<Wrapper {...props} />);
}

// Wrapper to provide an SVG container and ref.
function Wrapper(props: { isDrawing?: boolean; isSelected?: boolean; isActiveClass?: boolean; isDeleteMode?: boolean; isPaintMode?: boolean; onSelect?: (id: string) => void }) {
	const svgRef = useRef<SVGSVGElement>(null);
	return (
		<svg ref={svgRef} data-testid="test-svg">
			<AnnotationPolygon
				annotation={annotation}
				classColor="#ff0000"
				isDrawing={props.isDrawing ?? false}
				isActiveClass={props.isActiveClass ?? true}
				isSelected={props.isSelected ?? false}
				isDeleteMode={props.isDeleteMode ?? false}
				isPaintMode={props.isPaintMode ?? false}
				onMoveStart={noop}
				onMove={noop}
				onMoveEnd={noop}
				onSelect={props.onSelect ?? noop}
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

	it("does not render vertex circles", () => {
		render(<Wrapper />);
		expect(screen.queryAllByTestId("annotation-vertex")).toHaveLength(0);
	});

	it("has pointer-events none when drawing", () => {
		render(<Wrapper isDrawing={true} />);
		const g = screen.getByTestId("annotation-polygon");
		expect(g.style.pointerEvents).toBe("none");
	});

	it("shows selection indicator when selected", () => {
		render(<Wrapper isSelected={true} />);
		expect(screen.getByTestId("selection-indicator")).toBeInTheDocument();
	});

	it("does not show selection indicator when not selected", () => {
		render(<Wrapper isSelected={false} />);
		expect(screen.queryByTestId("selection-indicator")).not.toBeInTheDocument();
	});
	it("paint mode taps fire onSelect even for non-active classes", () => {
		const onSelect = vi.fn();
		renderWith({ isPaintMode: true, isActiveClass: false, onSelect });
		const polygon = screen.getByTestId("annotation-polygon").querySelector("polygon")!;
		fireEvent.pointerDown(polygon);
		expect(onSelect).toHaveBeenCalledWith("a1");
	});

	it("paint mode does not show vertex handles when selected", () => {
		renderWith({ isPaintMode: true, isSelected: true });
		expect(screen.getByTestId("annotation-polygon").querySelectorAll("circle")).toHaveLength(0);
	});

});
