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
	canvasMode: "lasso" as const,
	position: { x: 10, y: 10 },
	isDraggingAnnotation: false,
	trashRef: createRef<HTMLDivElement>(),
	onSelectClass: vi.fn(),
	onDeleteClass: vi.fn(),
	onAddClass: vi.fn(),
	onModeChange: vi.fn(),
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
});
