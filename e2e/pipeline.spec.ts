import { test, expect, type Page, type Download } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "fixtures");
const samplePanelDir = path.join(fixtures, "sample-panel");

// --- Helpers ---

async function clearAppState(page: Page) {
	await page.evaluate(() => {
		localStorage.clear();
		return new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase("ichigo-annotate");
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});
	});
}

async function importFolder(page: Page, folderPath: string) {
	await page.getByTestId("import-btn").click();
	await expect(page.getByTestId("import-modal")).toBeVisible();
	await page.getByTestId("file-input").setInputFiles(folderPath);
	await page.getByTestId("import-done").click();
	await expect(page.getByTestId("import-modal")).not.toBeVisible();
}

async function importZipReplace(page: Page, zipPath: string) {
	await page.getByTestId("import-btn").click();
	await expect(page.getByTestId("import-modal")).toBeVisible();
	await page.getByTestId("replace-checkbox").check();
	await page.getByTestId("source-zip").click();
	await page.getByTestId("zip-input").setInputFiles(zipPath);
	// Wait for zip extraction to finish.
	await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 10000 });
	await page.getByTestId("import-done").click();
	await expect(page.getByTestId("import-modal")).not.toBeVisible();
}

async function drawTriangleLasso(page: Page) {
	const svg = page.getByTestId("canvas-svg");
	await expect(svg).toBeVisible();
	const box = (await svg.boundingBox())!;

	const x1 = box.x + box.width * 0.3;
	const y1 = box.y + box.height * 0.3;
	const x2 = box.x + box.width * 0.7;
	const y2 = box.y + box.height * 0.3;
	const x3 = box.x + box.width * 0.5;
	const y3 = box.y + box.height * 0.7;

	await page.mouse.move(x1, y1);
	await page.mouse.down();
	for (let i = 0; i <= 10; i++) {
		const t = i / 10;
		await page.mouse.move(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
	}
	for (let i = 0; i <= 10; i++) {
		const t = i / 10;
		await page.mouse.move(x2 + (x3 - x2) * t, y2 + (y3 - y2) * t);
	}
	for (let i = 0; i <= 10; i++) {
		const t = i / 10;
		await page.mouse.move(x3 + (x1 - x3) * t, y3 + (y1 - y3) * t);
	}
	await page.mouse.up();

	await expect(page.locator("svg polygon")).toBeVisible();
}

async function exportFormat(page: Page, format: string): Promise<Download> {
	await page.getByTestId("export-btn").click();
	await expect(page.getByTestId("export-modal")).toBeVisible();
	await page.locator(`input[value="${format}"]`).click();
	const downloadPromise = page.waitForEvent("download");
	await page.getByTestId("export-done").click();
	return downloadPromise;
}

async function addClass(page: Page, name: string) {
	await page.getByTestId("add-class-btn").click();
	const input = page.getByTestId("new-class-input");
	await input.fill(name);
	await input.press("Enter");
	await expect(page.getByText(name)).toBeVisible();
}

// --- Tests ---

test.beforeEach(async ({ page }) => {
	await page.goto("/");
	await clearAppState(page);
	await page.reload();
});

test.describe("Pipeline: Import → Annotate → Export", () => {
	test("import sample panel, draw annotation, and verify canvas", async ({ page }) => {
		await importFolder(page, samplePanelDir);
		await expect(page.getByText("sample-panel.webp")).toBeVisible();
		await expect(page.locator("img[alt='Annotation target']")).toBeVisible();

		// Draw annotation.
		await drawTriangleLasso(page);

		// Verify polygon count.
		const polygons = page.locator("svg polygon");
		await expect(polygons).toHaveCount(1);
	});

	for (const format of ["yolo", "coco", "json", "voc", "labelme"] as const) {
		test(`export as ${format} produces a downloadable zip`, async ({ page }) => {
			await importFolder(page, samplePanelDir);
			await drawTriangleLasso(page);

			const download = await exportFormat(page, format);
			expect(download.suggestedFilename()).toBe(`annotations-${format}.zip`);

			// Verify the zip is non-empty and has expected content.
			const zipPath = await download.path();
			expect(zipPath).toBeTruthy();
			const zipBuffer = fs.readFileSync(zipPath!);
			const zip = await JSZip.loadAsync(zipBuffer);
			const fileNames = Object.keys(zip.files);
			expect(fileNames.length).toBeGreaterThan(0);

			if (format === "yolo") {
				expect(fileNames).toContain("classes.txt");
				expect(fileNames).toContain("sample-panel.txt");
			} else if (format === "coco") {
				expect(fileNames).toContain("annotations.json");
			} else if (format === "voc") {
				expect(fileNames).toContain("sample-panel.xml");
			} else if (format === "json") {
				expect(fileNames).toContain("sample-panel.json");
			} else if (format === "labelme") {
				expect(fileNames).toContain("sample-panel.json");
			}
		});
	}
});

test.describe("Round-trip: Export → Re-import", () => {
	/**
	 * For each format:
	 * 1. Import image, add a named class, draw annotation.
	 * 2. Export as the format.
	 * 3. Build a re-importable zip (exported annotations + original image).
	 * 4. Clear state, re-import the combined zip with replace.
	 * 5. Verify the annotation and class survive the round-trip.
	 */
	for (const format of ["yolo", "coco", "json", "voc", "labelme"] as const) {
		test(`round-trip ${format}: annotations survive export and re-import`, async ({ page }) => {
			// Step 1: Import image and create annotation with a named class.
			await importFolder(page, samplePanelDir);
			await addClass(page, "bubble");
			await page.getByText("bubble").click();
			await drawTriangleLasso(page);

			// Step 2: Export.
			const download = await exportFormat(page, format);
			const zipPath = await download.path();
			const exportedZip = await JSZip.loadAsync(fs.readFileSync(zipPath!));

			// Step 3: Build a combined zip with image + annotation files.
			const combinedZip = new JSZip();

			// Add the original image.
			const imageBuffer = fs.readFileSync(
				path.join(samplePanelDir, "sample-panel.webp"),
			);
			combinedZip.file("sample-panel.webp", imageBuffer);

			// Add all exported annotation files.
			for (const [name, entry] of Object.entries(exportedZip.files)) {
				if (!entry.dir) {
					combinedZip.file(name, await entry.async("uint8array"));
				}
			}

			// Write the combined zip to a temp file.
			const tmpDir = fs.mkdtempSync(path.join(fixtures, ".tmp-"));
			const combinedZipPath = path.join(tmpDir, `reimport-${format}.zip`);
			const combinedBuffer = await combinedZip.generateAsync({ type: "nodebuffer" });
			fs.writeFileSync(combinedZipPath, combinedBuffer);

			try {
				// Step 4: Re-import with replace.
				await importZipReplace(page, combinedZipPath);

				// Step 5: Verify.
				// Image should be present.
				await expect(page.getByText("sample-panel.webp")).toBeVisible();
				await expect(page.locator("img[alt='Annotation target']")).toBeVisible();

				// VOC re-imports as bounding boxes (4-vertex rectangles), not
				// the original polygon shape. All other formats preserve the
				// polygon vertices faithfully.
				if (format === "voc") {
					// VOC round-trip produces a bounding-box rectangle from
					// <bndbox> when no <polygon> data is available on
					// re-import. The parser creates a 4-vertex rectangle, so
					// we just verify an annotation polygon exists.
					await expect(page.locator("svg polygon")).toBeVisible();
				} else {
					// All other formats preserve the polygon annotation.
					await expect(page.locator("svg polygon")).toBeVisible();
				}

				// Class should survive (except VOC which may need class
				// resolution and YOLO which has classes.txt).
				const classPill = page
					.getByTestId("class-pill")
					.filter({ hasText: "bubble" });
				await expect(classPill).toBeVisible();
			} finally {
				// Clean up temp files.
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});
	}
});

test.describe("Export content validation", () => {
	test("YOLO export has correct structure", async ({ page }) => {
		await importFolder(page, samplePanelDir);
		await drawTriangleLasso(page);

		const download = await exportFormat(page, "yolo");
		const zip = await JSZip.loadAsync(fs.readFileSync((await download.path())!));

		// classes.txt should contain the default class.
		const classesTxt = await zip.file("classes.txt")!.async("string");
		expect(classesTxt).toContain("default-class");

		// Annotation file should have class index + coordinate pairs.
		const annTxt = await zip.file("sample-panel.txt")!.async("string");
		const parts = annTxt.trim().split(/\s+/);
		expect(parts[0]).toBe("0"); // class index
		// Remaining parts should be x y pairs (even count, ≥ 6 numbers for 3+ vertices).
		expect((parts.length - 1) % 2).toBe(0);
		expect(parts.length - 1).toBeGreaterThanOrEqual(6);
	});

	test("COCO export has correct JSON structure", async ({ page }) => {
		await importFolder(page, samplePanelDir);
		await drawTriangleLasso(page);

		const download = await exportFormat(page, "coco");
		const zip = await JSZip.loadAsync(fs.readFileSync((await download.path())!));
		const coco = JSON.parse(await zip.file("annotations.json")!.async("string"));

		expect(coco.images).toHaveLength(1);
		expect(coco.images[0].file_name).toBe("sample-panel.webp");
		expect(coco.annotations).toHaveLength(1);
		expect(coco.annotations[0].segmentation).toHaveLength(1);
		expect(coco.annotations[0].segmentation[0].length).toBeGreaterThanOrEqual(6);
		expect(coco.categories.length).toBeGreaterThanOrEqual(1);
	});

	test("JSON export has correct structure", async ({ page }) => {
		await importFolder(page, samplePanelDir);
		await drawTriangleLasso(page);

		const download = await exportFormat(page, "json");
		const zip = await JSZip.loadAsync(fs.readFileSync((await download.path())!));
		const data = JSON.parse(await zip.file("sample-panel.json")!.async("string"));

		expect(Array.isArray(data)).toBe(true);
		expect(data).toHaveLength(1);
		expect(data[0].class).toBe("default-class");
		expect(data[0].vertices.length).toBeGreaterThanOrEqual(3);
		// Each vertex is [x, y].
		expect(data[0].vertices[0]).toHaveLength(2);
	});

	test("VOC export has correct XML structure", async ({ page }) => {
		await importFolder(page, samplePanelDir);
		await drawTriangleLasso(page);

		const download = await exportFormat(page, "voc");
		const zip = await JSZip.loadAsync(fs.readFileSync((await download.path())!));
		const xml = await zip.file("sample-panel.xml")!.async("string");

		expect(xml).toContain("<annotation>");
		expect(xml).toContain("<filename>sample-panel.webp</filename>");
		expect(xml).toContain("<name>default-class</name>");
		expect(xml).toContain("<bndbox>");
		expect(xml).toContain("<polygon>");
		expect(xml).toContain("<pt>");
	});

	test("LabelMe export has correct JSON structure", async ({ page }) => {
		await importFolder(page, samplePanelDir);
		await drawTriangleLasso(page);

		const download = await exportFormat(page, "labelme");
		const zip = await JSZip.loadAsync(fs.readFileSync((await download.path())!));
		const data = JSON.parse(await zip.file("sample-panel.json")!.async("string"));

		expect(data.version).toBe("5.0.0");
		expect(data.imagePath).toBe("sample-panel.webp");
		expect(data.shapes).toHaveLength(1);
		expect(data.shapes[0].label).toBe("default-class");
		expect(data.shapes[0].shape_type).toBe("polygon");
		expect(data.shapes[0].points.length).toBeGreaterThanOrEqual(3);
	});
});
