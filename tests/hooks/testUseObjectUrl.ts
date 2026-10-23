import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useObjectUrl } from "../../src/hooks/useObjectUrl";

let createObjectURL: ReturnType<typeof vi.spyOn>;
let revokeObjectURL: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	let count = 0;
	createObjectURL = vi
		.spyOn(URL, "createObjectURL")
		.mockImplementation(() => `blob:test-${++count}`);
	revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("useObjectUrl", () => {
	it("returns null without a blob", () => {
		// Act
		const { result } = renderHook(() => useObjectUrl(null));

		// Assert
		expect(result.current).toBeNull();
		expect(createObjectURL).not.toHaveBeenCalled();
	});

	it("returns an object URL for the blob", () => {
		// Arrange
		const blob = new Blob(["a"]);

		// Act
		const { result } = renderHook(() => useObjectUrl(blob));

		// Assert
		expect(result.current).toBe("blob:test-1");
		expect(createObjectURL).toHaveBeenCalledWith(blob);
	});

	it("keeps the same URL while the blob is unchanged", () => {
		// Arrange
		const blob = new Blob(["a"]);
		const { result, rerender } = renderHook(() => useObjectUrl(blob));

		// Act
		rerender();

		// Assert
		expect(result.current).toBe("blob:test-1");
		expect(createObjectURL).toHaveBeenCalledOnce();
	});

	it("revokes the old URL when the blob changes", () => {
		// Arrange
		const { result, rerender } = renderHook(({ blob }) => useObjectUrl(blob), {
			initialProps: { blob: new Blob(["a"]) },
		});

		// Act
		rerender({ blob: new Blob(["b"]) });

		// Assert
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
		expect(result.current).toBe("blob:test-2");
	});

	it("returns null and revokes the URL once the blob is gone", () => {
		// Arrange
		const { result, rerender } = renderHook(
			({ blob }: { blob: Blob | null }) => useObjectUrl(blob),
			{ initialProps: { blob: new Blob(["a"]) as Blob | null } },
		);

		// Act
		rerender({ blob: null });

		// Assert
		expect(result.current).toBeNull();
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
	});

	it("revokes its URL on unmount", () => {
		// Arrange
		const blob = new Blob(["a"]);
		const { unmount } = renderHook(() => useObjectUrl(blob));

		// Act
		unmount();

		// Assert
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
	});
});
