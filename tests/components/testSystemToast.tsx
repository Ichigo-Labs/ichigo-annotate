import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SystemToast } from "../../src/components/SystemToast";

describe("SystemToast", () => {
	it("renders nothing when toasts array is empty", () => {
		const { container } = render(<SystemToast toasts={[]} />);
		expect(container.innerHTML).toBe("");
	});

	it("renders a toast with message", () => {
		render(<SystemToast toasts={[{ id: "1", message: "Hello" }]} />);
		expect(screen.getByText("Hello")).toBeInTheDocument();
	});

	it("renders progress bar when progress is provided", () => {
		render(
			<SystemToast
				toasts={[
					{
						id: "1",
						message: "Importing",
						progress: { current: 3, total: 10 },
					},
				]}
			/>,
		);
		expect(screen.getByText("Importing")).toBeInTheDocument();
		const fill = document.querySelector("[class*='progressFill']");
		expect(fill).toBeTruthy();
	});

	it("renders multiple toasts", () => {
		render(
			<SystemToast
				toasts={[
					{ id: "1", message: "First" },
					{ id: "2", message: "Second" },
				]}
			/>,
		);
		expect(screen.getAllByTestId("toast")).toHaveLength(2);
	});
});
