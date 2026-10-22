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
function Wrapper(props: { annotation?: typeof annotation & { attributes?: string[] }; attributeAbbreviations?: Map<string, string>; isDrawing?: boolean; isSelected?: boolean; isActiveClass?: boolean; isDeleteMode?: boolean; isPaintMode?: boolean; isTagMode?: boolean; isRectMode?: boolean; isPolygonMode?: boolean; zoom?: number; onSelect?: (id: string) => void; onMoveEnd?: (id: string, x: number, y: number) => void; onVertexMove?: (id: string, index: number, position: { x: number; y: number }) => void; onVertexMoveEnd?: (id: string) => void }) {
	const svgRef = useRef<SVGSVGElement>(null);
	return (
		<svg ref={svgRef} data-testid="test-svg">
			<AnnotationPolygon
				annotation={props.annotation ?? annotation}
				classColor="#ff0000"
				attributeAbbreviations={props.attributeAbbreviations ?? new Map()}
				isDrawing={props.isDrawing ?? false}
				isActiveClass={props.isActiveClass ?? true}
				isSelected={props.isSelected ?? false}
				isDeleteMode={props.isDeleteMode ?? false}
				isPaintMode={props.isPaintMode ?? false}
				isTagMode={props.isTagMode ?? false}
				isRectMode={props.isRectMode ?? false}
				isPolygonMode={props.isPolygonMode ?? false}
				zoom={props.zoom ?? 1}
				onMoveStart={noop}
				onMove={noop}
				onMoveEnd={props.onMoveEnd ?? noop}
				onSelect={props.onSelect ?? noop}
				onVertexMoveStart={noop}
				onVertexMove={props.onVertexMove ?? noop}
				onVertexMoveEnd={props.onVertexMoveEnd ?? noop}
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

	it("lets taps through in polygon mode so vertices can land on top of it", () => {
		render(<Wrapper isPolygonMode={true} />);
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

	it("renders vocabulary abbreviations in the attribute badge", () => {
		const abbrev = new Map([
			["handwritten", "H"],
			["has-border", "HB"],
		]);
		renderWith({
			annotation: { ...annotation, attributes: ["handwritten", "has-border"] },
			attributeAbbreviations: abbrev,
		});
		expect(screen.getByTestId("annotation-attr-badge").textContent).toBe("H/HB");
	});

	it("falls back to word initials for attributes missing from the map", () => {
		renderWith({
			annotation: { ...annotation, attributes: ["has-border"] },
		});
		expect(screen.getByTestId("annotation-attr-badge").textContent).toBe("HB");
	});
});

describe("AnnotationPolygon touch and zoom", () => {
	const touch = { pointerType: "touch", pointerId: 1, isPrimary: true };

	it("acts on a finger tap in delete mode only once the finger lifts", () => {
		const onSelect = vi.fn();
		renderWith({ isDeleteMode: true, onSelect });
		const polygon = screen.getByTestId("annotation-polygon").querySelector("polygon")!;

		fireEvent.pointerDown(polygon, touch);
		const actedOnPress = onSelect.mock.calls.length;
		fireEvent.pointerUp(polygon, touch);

		expect(actedOnPress).toBe(0);
		expect(onSelect).toHaveBeenCalledWith("a1");
	});

	it("drops a finger tap that gets cancelled", () => {
		const onSelect = vi.fn();
		renderWith({ isDeleteMode: true, onSelect });
		const polygon = screen.getByTestId("annotation-polygon").querySelector("polygon")!;

		fireEvent.pointerDown(polygon, touch);
		fireEvent.pointerCancel(polygon, touch);
		fireEvent.pointerUp(polygon, touch);

		expect(onSelect).not.toHaveBeenCalled();
	});

	it("puts a vertex back when its drag is cancelled", () => {
		const onVertexMove = vi.fn();
		const onVertexMoveEnd = vi.fn();
		renderWith({ isSelected: true, onVertexMove, onVertexMoveEnd });
		vi.spyOn(screen.getByTestId("test-svg"), "getBoundingClientRect").mockReturnValue({
			left: 0,
			top: 0,
			width: 100,
			height: 100,
		} as DOMRect);
		const handle = screen.getByTestId("annotation-polygon").querySelector("circle")!;

		fireEvent.pointerDown(handle, touch);
		fireEvent.pointerMove(handle, { ...touch, clientX: 30, clientY: 40 });
		fireEvent.pointerCancel(handle, touch);

		expect(onVertexMove).toHaveBeenNthCalledWith(1, "a1", 0, { x: 0.3, y: 0.4 });
		expect(onVertexMove).toHaveBeenLastCalledWith("a1", 0, { x: 0.1, y: 0.1 });
		expect(onVertexMoveEnd).toHaveBeenCalledWith("a1");
	});

	it("ends a cancelled move where it is, never on the trash", () => {
		vi.useFakeTimers();
		try {
			const onMoveEnd = vi.fn();
			renderWith({ onMoveEnd });
			const polygon = screen.getByTestId("annotation-polygon").querySelector("polygon")!;

			fireEvent.pointerDown(polygon, touch);
			vi.advanceTimersByTime(250);
			fireEvent.pointerCancel(polygon, touch);

			expect(onMoveEnd).toHaveBeenCalledWith("a1", Number.NaN, Number.NaN);
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps outlines and vertex handles the same size on screen when zoomed", () => {
		renderWith({ isSelected: true, zoom: 2 });
		const g = screen.getByTestId("annotation-polygon");

		expect(g.querySelector("[data-annotation-id]")!.getAttribute("stroke-width")).toBe("0.002");
		expect(g.querySelector("circle")!.getAttribute("r")).toBe("0.0025");
	});
});
