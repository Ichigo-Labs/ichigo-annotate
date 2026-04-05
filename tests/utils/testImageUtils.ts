import { describe, expect, it, vi } from "vitest";
import { fileToDataUrl } from "../../src/utils/imageUtils";

describe("fileToDataUrl", () => {
	it("reads a file into a data URL string", async () => {
		const blob = new Blob(["hello"], { type: "text/plain" });
		const file = new File([blob], "test.txt", { type: "text/plain" });
		const result = await fileToDataUrl(file);
		expect(result).toContain("data:");
		expect(typeof result).toBe("string");
	});

	it("rejects when FileReader errors", async () => {
		// Create a file and mock FileReader to error.
		const file = new File([], "bad.txt");
		const origFileReader = globalThis.FileReader;
		globalThis.FileReader = class extends origFileReader {
			override readAsDataURL() {
				setTimeout(() => {
					this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
				}, 0);
			}
		} as typeof FileReader;

		await expect(fileToDataUrl(file)).rejects.toBeDefined();
		globalThis.FileReader = origFileReader;
	});
});
