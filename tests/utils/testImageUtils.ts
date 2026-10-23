import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createImageFile,
	dataUrlToBlob,
	readImageInfo,
} from "../../src/utils/imageUtils";

// jsdom decodes no images and has no 2D canvas: stub both so the tests see
// what gets drawn.
let drawImage: ReturnType<typeof vi.fn>;

beforeEach(() => {
	drawImage = vi.fn();
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		drawImage,
	} as unknown as CanvasRenderingContext2D);
	vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
		"data:image/png;base64,thumb",
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function stubBitmap(width: number, height: number) {
	const bitmap = { width, height, close: vi.fn() };
	vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
	return bitmap;
}

// An <img> stand-in that "loads" (or fails) as soon as its src is set.
function stubImageElement(size: { width: number; height: number } | null) {
	class FakeImage {
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		naturalWidth = size?.width ?? 0;
		naturalHeight = size?.height ?? 0;
		set src(_: string) {
			setTimeout(() => (size ? this.onload?.() : this.onerror?.()), 0);
		}
	}
	vi.stubGlobal("Image", FakeImage);
}

describe("readImageInfo", () => {
	it("returns the natural size and an 80px thumbnail", async () => {
		// Arrange
		const bitmap = stubBitmap(400, 200);

		// Act
		const info = await readImageInfo(new Blob(["png"], { type: "image/png" }));

		// Assert
		expect(info).toEqual({
			width: 400,
			height: 200,
			thumbnailDataUrl: "data:image/png;base64,thumb",
		});
		expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 80, 40);
	});

	it("never scales a small image up", async () => {
		// Arrange
		const bitmap = stubBitmap(40, 20);

		// Act
		await readImageInfo(new Blob(["png"]));

		// Assert
		expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 40, 20);
	});

	it("frees the decoded pixels", async () => {
		// Arrange
		const bitmap = stubBitmap(400, 200);

		// Act
		await readImageInfo(new Blob(["png"]));

		// Assert
		expect(bitmap.close).toHaveBeenCalledOnce();
	});

	it("falls back to an <img> for formats createImageBitmap rejects", async () => {
		// Arrange
		vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("SVG")));
		stubImageElement({ width: 300, height: 600 });
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:svg");
		const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

		// Act
		const info = await readImageInfo(new Blob(["<svg/>"], { type: "image/svg+xml" }));

		// Assert
		expect(info.width).toBe(300);
		expect(info.height).toBe(600);
		expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 40, 80);
		expect(revoke).toHaveBeenCalledWith("blob:svg");
	});

	it("rejects when the image cannot be decoded at all", async () => {
		// Arrange
		vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("bad")));
		stubImageElement(null);
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:bad");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

		// Act
		const result = readImageInfo(new Blob(["not an image"]));

		// Assert
		await expect(result).rejects.toThrow("Failed to load image");
	});
});

describe("createImageFile", () => {
	it("keeps the File itself as the image and records its size", async () => {
		// Arrange
		stubBitmap(1200, 800);
		const file = new File(["png"], "page-1.png", { type: "image/png" });

		// Act
		const imageFile = await createImageFile(file);

		// Assert
		expect(imageFile.image).toBe(file);
		expect(imageFile.name).toBe("page-1.png");
		expect(imageFile.width).toBe(1200);
		expect(imageFile.height).toBe(800);
		expect(imageFile.thumbnailDataUrl).toBe("data:image/png;base64,thumb");
		expect(imageFile.annotations).toEqual([]);
		expect(imageFile.id).toEqual(expect.any(String));
	});
});

describe("dataUrlToBlob", () => {
	it("decodes the bytes and media type of a base64 data URL", async () => {
		// Arrange
		const dataUrl = "data:image/png;base64,AQID/w==";

		// Act
		const blob = dataUrlToBlob(dataUrl);

		// Assert
		expect(blob.type).toBe("image/png");
		expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3, 255]);
	});

	it("round-trips every byte value", async () => {
		// Arrange
		const bytes = Array.from({ length: 256 }, (_, i) => i);
		const dataUrl = `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`;

		// Act
		const blob = dataUrlToBlob(dataUrl);

		// Assert
		expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual(bytes);
	});
});
