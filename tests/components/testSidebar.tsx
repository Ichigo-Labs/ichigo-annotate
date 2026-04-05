import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "../../src/components/Sidebar";

describe("Sidebar", () => {
	it("renders children when not collapsed", () => {
		render(
			<Sidebar
				collapsed={false}
				widthPercent={20}
				side="left"
				onResize={vi.fn()}
			>
				<div>Child Content</div>
			</Sidebar>,
		);
		expect(screen.getByText("Child Content")).toBeInTheDocument();
	});

	it("hides content when collapsed", () => {
		render(
			<Sidebar
				collapsed={true}
				widthPercent={20}
				side="left"
				onResize={vi.fn()}
			>
				<div>Child Content</div>
			</Sidebar>,
		);
		// Content exists in DOM but parent has collapsed class.
		const sidebar = screen.getByTestId("sidebar");
		expect(sidebar.className).toContain("collapsed");
	});

	it("resize handle is always present", () => {
		render(
			<Sidebar
				collapsed={true}
				widthPercent={20}
				side="left"
				onResize={vi.fn()}
			>
				<div>Child Content</div>
			</Sidebar>,
		);
		expect(screen.getByTestId("sidebar-resize-handle")).toBeInTheDocument();
	});

	it("applies width percent as style", () => {
		render(
			<Sidebar
				collapsed={false}
				widthPercent={25}
				side="left"
				onResize={vi.fn()}
			>
				<div>Test</div>
			</Sidebar>,
		);
		const sidebar = screen.getByTestId("sidebar");
		expect(sidebar.style.width).toBe("25%");
	});
});
