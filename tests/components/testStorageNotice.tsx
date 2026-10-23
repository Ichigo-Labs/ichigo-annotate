import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StorageNotice } from "../../src/components/StorageNotice";

describe("StorageNotice", () => {
	it("shows nothing while everything is saved", () => {
		// Act
		const { container } = render(
			<StorageNotice status="saved" error={null} onReload={vi.fn()} />,
		);

		// Assert
		expect(container.innerHTML).toBe("");
	});

	it("covers the app while saved files load", () => {
		// Act
		render(<StorageNotice status="loading" error={null} onReload={vi.fn()} />);

		// Assert
		expect(screen.getByTestId("storage-overlay")).toHaveTextContent(
			"Loading saved files",
		);
	});

	it("asks to close other tabs while an upgrade is blocked", () => {
		// Act
		render(<StorageNotice status="blocked" error={null} onReload={vi.fn()} />);

		// Assert
		expect(screen.getByTestId("storage-overlay")).toHaveTextContent(
			"Close other ichigo-annotate tabs",
		);
	});

	it("warns that changes aren't saved, with the error, while retrying", () => {
		// Act
		render(
			<StorageNotice
				status="save_failed"
				error="QuotaExceededError: disk full"
				onReload={vi.fn()}
			/>,
		);

		// Assert
		const warning = screen.getByTestId("storage-warning");
		expect(warning).toHaveTextContent("Changes aren't being saved");
		expect(warning).toHaveTextContent("QuotaExceededError: disk full");
		expect(screen.queryByTestId("storage-reload")).not.toBeInTheDocument();
	});

	it.each(["load_failed", "outdated"] as const)(
		"offers a reload when %s",
		(status) => {
			// Arrange
			const onReload = vi.fn();
			render(<StorageNotice status={status} error={null} onReload={onReload} />);

			// Act
			fireEvent.click(screen.getByTestId("storage-reload"));

			// Assert
			expect(screen.getByTestId("storage-warning")).toBeInTheDocument();
			expect(onReload).toHaveBeenCalledOnce();
		},
	);
});
