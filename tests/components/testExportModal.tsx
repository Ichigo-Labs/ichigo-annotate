import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExportModal } from "../../src/components/ExportModal";

describe("ExportModal", () => {
	it("renders nothing when not open", () => {
		const { container } = render(
			<ExportModal
				open={false}
				exportFormat="yolo"
				onFormatChange={vi.fn()}
				onExport={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		expect(container.innerHTML).toBe("");
	});

	it("renders all format options when open", () => {
		render(
			<ExportModal
				open={true}
				exportFormat="yolo"
				onFormatChange={vi.fn()}
				onExport={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		expect(screen.getByText("YOLO")).toBeInTheDocument();
		expect(screen.getByText("COCO")).toBeInTheDocument();
		expect(screen.getByText("JSON")).toBeInTheDocument();
		expect(screen.getByText("Pascal VOC")).toBeInTheDocument();
		expect(screen.getByText("LabelMe")).toBeInTheDocument();
	});

	it("changing format calls onFormatChange", () => {
		const onFormatChange = vi.fn();
		render(
			<ExportModal
				open={true}
				exportFormat="yolo"
				onFormatChange={onFormatChange}
				onExport={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByDisplayValue("coco"));
		expect(onFormatChange).toHaveBeenCalledWith("coco");
	});

	it("export button calls onExport", () => {
		const onExport = vi.fn();
		render(
			<ExportModal
				open={true}
				exportFormat="yolo"
				onFormatChange={vi.fn()}
				onExport={onExport}
				onCancel={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByTestId("export-done"));
		expect(onExport).toHaveBeenCalledOnce();
	});
});
