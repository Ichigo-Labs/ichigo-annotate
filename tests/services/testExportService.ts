import { describe, expect, it, vi } from "vitest";
import { exportAsZip } from "../../src/services/exportService";
import type { AnnotationClass, ImageFile } from "../../src/types/appState";

const classes: AnnotationClass[] = [
	{ id: "c1", name: "cat", color: "#ff0000" },
];

const files: ImageFile[] = [
	{
		id: "f1",
		name: "img1.png",
		dataUrl: "data:image/png;base64,abc",
		thumbnailDataUrl: "data:image/png;base64,thumb",
		annotations: [
			{
				id: "a1",
				classId: "c1",
				vertices: [
					{ x: 0.1, y: 0.2 },
					{ x: 0.3, y: 0.2 },
					{ x: 0.3, y: 0.4 },
				],
			},
		],
	},
];

describe("exportAsZip", () => {
	it("creates and triggers download for YOLO format", async () => {
		// Mock the anchor element and URL APIs.
		const clickSpy = vi.fn();
		const createElementSpy = vi
			.spyOn(document, "createElement")
			.mockReturnValue({
				set href(_: string) {},
				set download(_: string) {},
				click: clickSpy,
			} as unknown as HTMLAnchorElement);
		vi.spyOn(document.body, "appendChild").mockImplementation(
			(n) => n as HTMLAnchorElement,
		);
		vi.spyOn(document.body, "removeChild").mockImplementation(
			(n) => n as HTMLAnchorElement,
		);
		const revokeObjectURL = vi
			.spyOn(URL, "revokeObjectURL")
			.mockImplementation(() => {});
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");

		await exportAsZip(files, classes, "yolo");
		expect(clickSpy).toHaveBeenCalled();

		createElementSpy.mockRestore();
		revokeObjectURL.mockRestore();
	});

	it("creates and triggers download for COCO format", async () => {
		const clickSpy = vi.fn();
		vi.spyOn(document, "createElement").mockReturnValue({
			set href(_: string) {},
			set download(_: string) {},
			click: clickSpy,
		} as unknown as HTMLAnchorElement);
		vi.spyOn(document.body, "appendChild").mockImplementation(
			(n) => n as HTMLAnchorElement,
		);
		vi.spyOn(document.body, "removeChild").mockImplementation(
			(n) => n as HTMLAnchorElement,
		);
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");

		await exportAsZip(files, classes, "coco");
		expect(clickSpy).toHaveBeenCalled();

		vi.restoreAllMocks();
	});
});
