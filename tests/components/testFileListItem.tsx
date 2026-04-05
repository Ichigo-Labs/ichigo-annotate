import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileListItem } from "../../src/components/FileListItem";

const defaultProps = {
	name: "cat.jpg",
	thumbnailSrc: "data:image/png;base64,abc",
	selected: false,
	onSelect: vi.fn(),
	onDelete: vi.fn(),
};

describe("FileListItem", () => {
	it("renders file name and thumbnail", () => {
		render(<FileListItem {...defaultProps} />);
		expect(screen.getByText("cat.jpg")).toBeInTheDocument();
		expect(screen.getByAltText("cat.jpg")).toBeInTheDocument();
	});

	it("clicking the row calls onSelect", () => {
		const onSelect = vi.fn();
		render(<FileListItem {...defaultProps} onSelect={onSelect} />);
		fireEvent.click(screen.getByTestId("file-list-item"));
		expect(onSelect).toHaveBeenCalledOnce();
	});

	it("clicking delete calls onDelete but not onSelect", () => {
		const onSelect = vi.fn();
		const onDelete = vi.fn();
		render(
			<FileListItem
				{...defaultProps}
				onSelect={onSelect}
				onDelete={onDelete}
			/>,
		);
		fireEvent.click(screen.getByLabelText("Delete cat.jpg"));
		expect(onDelete).toHaveBeenCalledOnce();
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("applies selected class when selected", () => {
		render(<FileListItem {...defaultProps} selected={true} />);
		const el = screen.getByTestId("file-list-item");
		expect(el.className).toContain("selected");
	});
});
