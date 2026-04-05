import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileList } from "../../src/components/FileList";
import type { ImageFile } from "../../src/types/appState";

const files: ImageFile[] = [
	{
		id: "1",
		name: "cat.jpg",
		dataUrl: "",
		thumbnailDataUrl: "data:image/png;base64,a",
		annotations: [],
	},
	{
		id: "2",
		name: "dog.png",
		dataUrl: "",
		thumbnailDataUrl: "data:image/png;base64,b",
		annotations: [],
	},
];

const noop = vi.fn();

const defaultProps = {
	files,
	selectedFileId: null as string | null,
	searchQuery: "",
	lastDeletedFile: null as ImageFile | null,
	onSearchChange: noop,
	onSelectFile: noop,
	onDeleteFile: noop,
	onUndoDelete: noop,
	onImportClick: noop,
	onExportClick: noop,
};

describe("FileList", () => {
	it("renders the Files header", () => {
		render(<FileList {...defaultProps} />);
		expect(screen.getByText("Files")).toBeInTheDocument();
	});

	it("renders correct number of file items", () => {
		render(<FileList {...defaultProps} />);
		expect(screen.getAllByTestId("file-list-item")).toHaveLength(2);
	});

	it("filters items by search query", () => {
		render(<FileList {...defaultProps} searchQuery="cat" />);
		expect(screen.getAllByTestId("file-list-item")).toHaveLength(1);
		expect(screen.getByText("cat.jpg")).toBeInTheDocument();
	});

	it("shows undo banner when lastDeletedFile is set", () => {
		const deleted = files[0]!;
		render(<FileList {...defaultProps} lastDeletedFile={deleted} />);
		expect(screen.getByTestId("undo-banner")).toBeInTheDocument();
		expect(screen.getByText(/Deleted cat.jpg/)).toBeInTheDocument();
	});

	it("clicking undo calls onUndoDelete", () => {
		const onUndoDelete = vi.fn();
		render(
			<FileList
				{...defaultProps}
				lastDeletedFile={files[0]!}
				onUndoDelete={onUndoDelete}
			/>,
		);
		fireEvent.click(screen.getByTestId("undo-btn"));
		expect(onUndoDelete).toHaveBeenCalledOnce();
	});

	it("import and export buttons call their callbacks", () => {
		const onImportClick = vi.fn();
		const onExportClick = vi.fn();
		render(
			<FileList
				{...defaultProps}
				onImportClick={onImportClick}
				onExportClick={onExportClick}
			/>,
		);
		fireEvent.click(screen.getByTestId("import-btn"));
		expect(onImportClick).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByTestId("export-btn"));
		expect(onExportClick).toHaveBeenCalledOnce();
	});
});
