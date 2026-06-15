import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { CanvasPalette } from "../../src/components/CanvasPalette";
import type { AnnotationClass } from "../../src/types/appState";

const classes: AnnotationClass[] = [
	{ id: "c1", name: "default-class", color: "#d4856a" },
	{ id: "c2", name: "tiger", color: "#ff0000" },
];

const defaultProps = {
	classes,
	activeClassId: "c1",
	attributes: ["italic", "bold", "handwritten"],
	enabledAttributes: [] as string[],
	attributeTarget: "default" as const,
	canvasMode: "lasso" as const,
	position: { x: 10, y: 10 },
	isDraggingAnnotation: false,
	trashRef: createRef<HTMLDivElement>(),
	onSelectClass: vi.fn(),
	onDeleteClass: vi.fn(),
	onAddClass: vi.fn(),
	onToggleAttribute: vi.fn(),
	onAddAttribute: vi.fn(),
	onDeleteAttribute: vi.fn(),
	onModeChange: vi.fn(),
	onUndo: vi.fn(),
	onRedo: vi.fn(),
	canUndo: false,
	canRedo: false,
	onNavigate: vi.fn(),
	onDragEnd: vi.fn(),
};

describe("CanvasPalette", () => {
	it("renders all class pills", () => {
		render(<CanvasPalette {...defaultProps} />);
		expect(screen.getAllByTestId("class-pill")).toHaveLength(2);
		expect(screen.getByText("default-class")).toBeInTheDocument();
		expect(screen.getByText("tiger")).toBeInTheDocument();
	});

	it("active pill has distinct styling", () => {
		render(<CanvasPalette {...defaultProps} />);
		const pills = screen.getAllByTestId("class-pill");
		expect(pills[0]!.className).toContain("pillActive");
		expect(pills[1]!.className).not.toContain("pillActive");
	});

	it("clicking a pill calls onSelectClass", () => {
		const onSelectClass = vi.fn();
		render(
			<CanvasPalette {...defaultProps} onSelectClass={onSelectClass} />,
		);
		fireEvent.click(screen.getAllByTestId("class-pill")[1]!);
		expect(onSelectClass).toHaveBeenCalledWith("c2");
	});

	it("clicking delete on pill calls onDeleteClass", () => {
		const onDeleteClass = vi.fn();
		render(
			<CanvasPalette {...defaultProps} onDeleteClass={onDeleteClass} />,
		);
		fireEvent.click(screen.getByLabelText("Delete class tiger"));
		expect(onDeleteClass).toHaveBeenCalledWith("c2");
	});

	it("plus button reveals input, enter calls onAddClass", () => {
		const onAddClass = vi.fn();
		render(<CanvasPalette {...defaultProps} onAddClass={onAddClass} />);
		fireEvent.click(screen.getByTestId("add-class-btn"));
		const input = screen.getByTestId("new-class-input");
		fireEvent.change(input, { target: { value: "bunny" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onAddClass).toHaveBeenCalledOnce();
		expect(onAddClass.mock.calls[0]![0]).toBe("bunny");
	});

	it("forward and backward buttons call onNavigate", () => {
		const onNavigate = vi.fn();
		render(<CanvasPalette {...defaultProps} onNavigate={onNavigate} />);
		fireEvent.click(screen.getByTestId("nav-forward"));
		expect(onNavigate).toHaveBeenCalledWith("forward");
		fireEvent.click(screen.getByTestId("nav-backward"));
		expect(onNavigate).toHaveBeenCalledWith("backward");
	});

	it("shows trash target when dragging annotation", () => {
		render(<CanvasPalette {...defaultProps} isDraggingAnnotation={true} />);
		expect(screen.getByTestId("trash-target")).toBeInTheDocument();
	});

	it("hides trash target when not dragging", () => {
		render(<CanvasPalette {...defaultProps} isDraggingAnnotation={false} />);
		expect(screen.queryByTestId("trash-target")).not.toBeInTheDocument();
	});
	it("clicking the paint button calls onModeChange with paint", () => {
		const onModeChange = vi.fn();
		render(<CanvasPalette {...defaultProps} onModeChange={onModeChange} />);
		fireEvent.click(screen.getByTestId("mode-paint"));
		expect(onModeChange).toHaveBeenCalledWith("paint");
	});

	it("paint button is highlighted when paint mode is active", () => {
		render(<CanvasPalette {...defaultProps} canvasMode="paint" />);
		expect(screen.getByTestId("mode-paint").className).toContain("iconBtnActive");
		expect(screen.getByTestId("mode-lasso").className).not.toContain("iconBtnActive");
	});

});

// -- Attribute pills --

describe("CanvasPalette attributes", () => {
	it("renders a pill per attribute with enabled state", () => {
		render(
			<CanvasPalette
				{...defaultProps}
				enabledAttributes={["bold"]}
			/>,
		);
		const pills = screen.getAllByTestId("attr-pill");
		expect(pills).toHaveLength(3);
		expect(pills[1]!.getAttribute("data-attr-on")).toBe("true");
		expect(pills[0]!.getAttribute("data-attr-on")).toBe("false");
	});

	it("clicking a pill calls onToggleAttribute", () => {
		const onToggleAttribute = vi.fn();
		render(
			<CanvasPalette {...defaultProps} onToggleAttribute={onToggleAttribute} />,
		);
		fireEvent.click(screen.getAllByTestId("attr-pill")[0]!);
		expect(onToggleAttribute).toHaveBeenCalledWith("italic");
	});

	it("delete button calls onDeleteAttribute without toggling", () => {
		const onToggleAttribute = vi.fn();
		const onDeleteAttribute = vi.fn();
		render(
			<CanvasPalette
				{...defaultProps}
				onToggleAttribute={onToggleAttribute}
				onDeleteAttribute={onDeleteAttribute}
			/>,
		);
		fireEvent.click(screen.getByLabelText("Delete attribute bold"));
		expect(onDeleteAttribute).toHaveBeenCalledWith("bold");
		expect(onToggleAttribute).not.toHaveBeenCalled();
	});

	it("adds an attribute via the inline input", () => {
		const onAddAttribute = vi.fn();
		render(
			<CanvasPalette {...defaultProps} onAddAttribute={onAddAttribute} />,
		);
		fireEvent.click(screen.getByTestId("add-attr-btn"));
		const input = screen.getByTestId("new-attr-input");
		fireEvent.change(input, { target: { value: "sparkle" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onAddAttribute).toHaveBeenCalledWith("sparkle");
	});
});
