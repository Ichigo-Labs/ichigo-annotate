import JSZip from "jszip";
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
		image: new Blob(["abc"], { type: "image/png" }),
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

	it("writes COCO pixel coordinates from the sizes recorded at import", async () => {
		// Arrange
		vi.spyOn(document, "createElement").mockReturnValue({
			set href(_: string) {},
			set download(_: string) {},
			click: vi.fn(),
		} as unknown as HTMLAnchorElement);
		vi.spyOn(document.body, "appendChild").mockImplementation(
			(n) => n as HTMLAnchorElement,
		);
		vi.spyOn(document.body, "removeChild").mockImplementation(
			(n) => n as HTMLAnchorElement,
		);
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
		const createObjectURL = vi
			.spyOn(URL, "createObjectURL")
			.mockReturnValue("blob:test");
		const sized = [{ ...files[0]!, width: 1000, height: 500 }];

		// Act
		await exportAsZip(sized, classes, "coco");

		// Assert
		const zipBlob = createObjectURL.mock.calls[0]![0] as Blob;
		const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
		const coco = JSON.parse(await zip.file("annotations.json")!.async("string"));
		expect(coco.images[0]).toMatchObject({ width: 1000, height: 500 });
		expect(coco.annotations[0].segmentation[0]).toEqual([100, 100, 300, 100, 300, 200]);
		// The image itself was never decoded for its size.
		expect(createObjectURL).toHaveBeenCalledOnce();

		vi.restoreAllMocks();
	});

	it("creates and triggers download for JSON format", async () => {
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

		await exportAsZip(files, classes, "json");
		expect(clickSpy).toHaveBeenCalled();

		vi.restoreAllMocks();
	});

	it("creates and triggers download for VOC format", async () => {
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

		await exportAsZip(files, classes, "voc");
		expect(clickSpy).toHaveBeenCalled();

		vi.restoreAllMocks();
	});

	it("creates and triggers download for LabelMe format", async () => {
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

		await exportAsZip(files, classes, "labelme");
		expect(clickSpy).toHaveBeenCalled();

		vi.restoreAllMocks();
	});
});
