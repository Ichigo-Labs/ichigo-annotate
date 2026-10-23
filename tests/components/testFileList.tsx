import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileList } from "../../src/components/FileList";
import type { ImageFile } from "../../src/types/appState";

const files: ImageFile[] = [
	{
		id: "1",
		name: "cat.jpg",
		image: new Blob(),
		thumbnailDataUrl: "data:image/png;base64,a",
		annotations: [],
	},
	{
		id: "2",
		name: "dog.png",
		image: new Blob(),
		thumbnailDataUrl: "data:image/png;base64,b",
		annotations: [],
	},
];

const noop = vi.fn();

const defaultProps = {
	files,
	totalFileCount: files.length,
	annotatedFileCount: 0,
	selectedFileId: null as string | null,
	searchQuery: "",
	lastDeletedFile: null as ImageFile | null,
	onSearchChange: noop,
	onSelectFile: noop,
	onDeleteFile: noop,
	onUndoDelete: noop,
	onImportClick: noop,
	onExportClick: noop,
	polygonize: false,
	polygonizeSides: 4,
	stretchImage: true,
	twoTapBox: false,
	onPolygonizeChange: noop,
	onPolygonizeSidesChange: noop,
	onStretchImageChange: noop,
	onTwoTapBoxChange: noop,
};

describe("FileList", () => {
	it("renders the Files header with count", () => {
		render(<FileList {...defaultProps} />);
		expect(screen.getByText("Files (0/2)")).toBeInTheDocument();
	});

	it("renders correct number of file items", () => {
		render(<FileList {...defaultProps} />);
		expect(screen.getAllByTestId("file-list-item")).toHaveLength(2);
	});

	it("renders only the rows in view of a long list", () => {
		// Arrange
		const many = Array.from({ length: 1000 }, (_, i) => ({
			...files[0]!,
			id: `f${i}`,
			name: `img-${i}.png`,
		}));

		// Act
		render(<FileList {...defaultProps} files={many} totalFileCount={1000} />);

		// Assert
		const rendered = screen.getAllByTestId("file-list-item");
		expect(rendered.length).toBeGreaterThan(0);
		expect(rendered.length).toBeLessThan(100);
		expect(screen.getByText("img-0.png")).toBeInTheDocument();
	});

	it("renders the rows scrolled to", () => {
		// Arrange
		const many = Array.from({ length: 1000 }, (_, i) => ({
			...files[0]!,
			id: `f${i}`,
			name: `img-${i}.png`,
		}));
		render(<FileList {...defaultProps} files={many} totalFileCount={1000} />);
		const list = screen.getAllByTestId("file-list-item")[0]!.parentElement!;

		// Act
		act(() => {
			Object.defineProperty(list, "scrollTop", { value: 500 * 52 });
			list.dispatchEvent(new Event("scroll"));
		});

		// Assert
		expect(screen.getByText("img-500.png")).toBeInTheDocument();
		expect(screen.queryByText("img-0.png")).not.toBeInTheDocument();
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

	it("renders polygonize checkbox and sides input", () => {
		render(<FileList {...defaultProps} />);
		expect(screen.getByTestId("polygonize-checkbox")).toBeInTheDocument();
		expect(screen.getByTestId("polygonize-sides")).toBeInTheDocument();
	});

	it("polygonize checkbox calls onPolygonizeChange", () => {
		const onPolygonizeChange = vi.fn();
		render(
			<FileList {...defaultProps} onPolygonizeChange={onPolygonizeChange} />,
		);
		fireEvent.click(screen.getByTestId("polygonize-checkbox"));
		expect(onPolygonizeChange).toHaveBeenCalledWith(true);
	});

	it("sides input is disabled when polygonize is off", () => {
		render(<FileList {...defaultProps} polygonize={false} />);
		expect(screen.getByTestId("polygonize-sides")).toBeDisabled();
	});

	it("sides input is enabled when polygonize is on", () => {
		render(<FileList {...defaultProps} polygonize={true} />);
		expect(screen.getByTestId("polygonize-sides")).not.toBeDisabled();
	});

	it("two tap box checkbox calls onTwoTapBoxChange", () => {
		const onTwoTapBoxChange = vi.fn();
		render(
			<FileList {...defaultProps} onTwoTapBoxChange={onTwoTapBoxChange} />,
		);
		fireEvent.click(screen.getByTestId("two-tap-box-checkbox"));
		expect(onTwoTapBoxChange).toHaveBeenCalledWith(true);
	});
});
