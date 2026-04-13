import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
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
		expect(screen.getByText("Import Dataset")).toBeInTheDocument();
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

	it("switches to zip input when zip source is selected", () => {
		render(
			<ImportModal open={true} onImport={vi.fn()} onCancel={vi.fn()} />,
		);
		expect(screen.getByTestId("file-input")).toBeInTheDocument();
		expect(screen.queryByTestId("zip-input")).not.toBeInTheDocument();

		fireEvent.click(screen.getByTestId("source-zip"));
		expect(screen.queryByTestId("file-input")).not.toBeInTheDocument();
		expect(screen.getByTestId("zip-input")).toBeInTheDocument();
	});

	it("switches back to folder input when folder source is selected", () => {
		render(
			<ImportModal open={true} onImport={vi.fn()} onCancel={vi.fn()} />,
		);
		fireEvent.click(screen.getByTestId("source-zip"));
		fireEvent.click(screen.getByTestId("source-folder"));
		expect(screen.getByTestId("file-input")).toBeInTheDocument();
		expect(screen.queryByTestId("zip-input")).not.toBeInTheDocument();
	});

	it("extracts zip and shows summary", async () => {
		// Build a tiny zip with a PNG stub
		const zip = new JSZip();
		// 1x1 red PNG
		const pngBytes = new Uint8Array([
			137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0,
			0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0,
			12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 0, 3, 0, 1,
			24, 216, 141, 110, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
		]);
		zip.file("img.png", pngBytes);
		const blob = await zip.generateAsync({ type: "blob" });
		const zipFile = new File([blob], "dataset.zip", {
			type: "application/zip",
		});

		const onImport = vi.fn();
		render(
			<ImportModal open={true} onImport={onImport} onCancel={vi.fn()} />,
		);

		fireEvent.click(screen.getByTestId("source-zip"));
		const input = screen.getByTestId("zip-input") as HTMLInputElement;
		fireEvent.change(input, { target: { files: [zipFile] } });

		await waitFor(() => {
			expect(screen.getByTestId("import-summary")).toHaveTextContent(
				"1 image found",
			);
		});

		fireEvent.click(screen.getByTestId("import-done"));
		expect(onImport).toHaveBeenCalledOnce();
		const importedFiles = onImport.mock.calls[0]![0] as File[];
		expect(importedFiles).toHaveLength(1);
		expect(importedFiles[0]!.name).toBe("img.png");
		expect(importedFiles[0]!.type).toBe("image/png");
	});

	it("shows classes.txt found in summary when present without annotations", () => {
		render(
			<ImportModal open={true} onImport={vi.fn()} onCancel={vi.fn()} />,
		);
		const input = screen.getByTestId("file-input") as HTMLInputElement;
		const imgFile = new File(["img"], "photo.png", { type: "image/png" });
		const classesFile = new File(["cat\ndog\n"], "classes.txt", {
			type: "text/plain",
		});
		fireEvent.change(input, { target: { files: [imgFile, classesFile] } });
		expect(screen.getByTestId("import-summary")).toHaveTextContent(
			"classes.txt found",
		);
	});

	it("does not show classes.txt hint when YOLO format is detected", () => {
		render(
			<ImportModal open={true} onImport={vi.fn()} onCancel={vi.fn()} />,
		);
		const input = screen.getByTestId("file-input") as HTMLInputElement;
		const imgFile = new File(["img"], "photo.png", { type: "image/png" });
		const classesFile = new File(["cat\ndog\n"], "classes.txt", {
			type: "text/plain",
		});
		const annoFile = new File(["0 0.1 0.2 0.3 0.4 0.5 0.6"], "photo.txt", {
			type: "text/plain",
		});
		fireEvent.change(input, {
			target: { files: [imgFile, classesFile, annoFile] },
		});
		const summary = screen.getByTestId("import-summary").textContent ?? "";
		expect(summary).toContain("YOLO annotations detected");
		expect(summary).not.toContain("classes.txt found");
	});
});
