import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useVisibleRows } from "../../src/hooks/useVisibleRows";

// A scroll container with a given height and scroll position (jsdom does no
// layout of its own).
function fakeList(height: number, scrollTop = 0): HTMLDivElement {
	const list = document.createElement("div");
	Object.defineProperty(list, "clientHeight", { value: height });
	Object.defineProperty(list, "scrollTop", { value: scrollTop, writable: true });
	return list;
}

describe("useVisibleRows", () => {
	it("covers the rows in view plus the overscan", () => {
		// Arrange
		const ref = { current: fakeList(100) };

		// Act
		const { result } = renderHook(() => useVisibleRows(ref, 1000, 10, 5));

		// Assert
		expect(result.current).toEqual({ first: 0, last: 15 });
	});

	it("follows the scroll position", () => {
		// Arrange
		const list = fakeList(100);
		const ref = { current: list };
		const { result } = renderHook(() => useVisibleRows(ref, 1000, 10, 5));

		// Act
		act(() => {
			list.scrollTop = 500;
			list.dispatchEvent(new Event("scroll"));
		});

		// Assert
		expect(result.current).toEqual({ first: 45, last: 65 });
	});

	it("never runs past the last row", () => {
		// Arrange
		const ref = { current: fakeList(100, 9950) };

		// Act
		const { result } = renderHook(() => useVisibleRows(ref, 1000, 10, 5));

		// Assert
		expect(result.current).toEqual({ first: 985, last: 1000 });
	});

	it("shows the end of a list that shrank below the scroll position", () => {
		// Arrange
		const ref = { current: fakeList(100, 5000) };
		const { result, rerender } = renderHook(
			({ count }) => useVisibleRows(ref, count, 10, 5),
			{ initialProps: { count: 1000 } },
		);

		// Act
		rerender({ count: 20 });

		// Assert
		expect(result.current).toEqual({ first: 5, last: 20 });
	});

	it("covers every row of a list shorter than the view", () => {
		// Arrange
		const ref = { current: fakeList(100) };

		// Act
		const { result } = renderHook(() => useVisibleRows(ref, 3, 10, 5));

		// Assert
		expect(result.current).toEqual({ first: 0, last: 3 });
	});
});
