import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportModal } from "../../src/components/ImportModal";

describe("ImportModal", () => {
	it("renders nothing when not open", () => {
		const { container } = render(
			<ImportModal open={false} onImport={vi.fn()} onCancel={vi.fn()} />,
		);
		expect(container.innerHTML).toBe("");
	});

	it("renders content when open", () => {
		render(
			<ImportModal open={true} onImport={vi.fn()} onCancel={vi.fn()} />,
		);
		expect(screen.getByText("Import Images")).toBeInTheDocument();
		expect(screen.getByTestId("replace-checkbox")).toBeInTheDocument();
		expect(screen.getByTestId("file-input")).toBeInTheDocument();
	});

	it("done button is disabled when no files selected", () => {
		render(
			<ImportModal open={true} onImport={vi.fn()} onCancel={vi.fn()} />,
		);
		expect(screen.getByTestId("import-done")).toBeDisabled();
	});

	it("cancel button calls onCancel", () => {
		const onCancel = vi.fn();
		render(
			<ImportModal open={true} onImport={vi.fn()} onCancel={onCancel} />,
		);
		fireEvent.click(screen.getByTestId("import-cancel"));
		expect(onCancel).toHaveBeenCalledOnce();
	});
});
