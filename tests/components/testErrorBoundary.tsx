import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";

function Broken(): never {
	throw new Error("render exploded");
}

beforeEach(() => {
	// React logs the caught error; keep the test output clean.
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
	it("renders its children while nothing throws", () => {
		// Act
		render(
			<ErrorBoundary onReload={vi.fn()}>
				<div>app</div>
			</ErrorBoundary>,
		);

		// Assert
		expect(screen.getByText("app")).toBeInTheDocument();
		expect(screen.queryByTestId("error-screen")).not.toBeInTheDocument();
	});

	it("shows the error and a reload button when rendering throws", () => {
		// Act
		render(
			<ErrorBoundary onReload={vi.fn()}>
				<Broken />
			</ErrorBoundary>,
		);

		// Assert
		expect(screen.getByTestId("error-screen")).toHaveTextContent("render exploded");
		expect(screen.getByTestId("error-reload")).toBeInTheDocument();
	});

	it("reloads when asked", () => {
		// Arrange
		const onReload = vi.fn();
		render(
			<ErrorBoundary onReload={onReload}>
				<Broken />
			</ErrorBoundary>,
		);

		// Act
		fireEvent.click(screen.getByTestId("error-reload"));

		// Assert
		expect(onReload).toHaveBeenCalledOnce();
	});
});
