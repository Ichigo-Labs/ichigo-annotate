import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "fixtures");

test.beforeEach(async ({ page }) => {
	// Clear localStorage to start fresh.
	await page.goto("/");
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test.describe("Initial layout", () => {
	test("renders sidebar with Files header", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("Files")).toBeVisible();
	});

	test("renders canvas placeholder", async ({ page }) => {
		await page.goto("/");
		await expect(
			page.getByText("Import images to get started"),
		).toBeVisible();
	});

	test("renders palette with default-class pill", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText("default-class")).toBeVisible();
	});
});

test.describe("Import and file selection", () => {
	test("import images and select a file", async ({ page }) => {
		await page.goto("/");

		// Open import modal.
		await page.getByTestId("import-btn").click();
		await expect(page.getByTestId("import-modal")).toBeVisible();

		// Upload a directory containing test images.
		const fileInput = page.getByTestId("file-input");
		await fileInput.setInputFiles(path.join(fixtures, "two-images"));

		// Click done.
		await page.getByTestId("import-done").click();

		// Modal closes, files appear in list.
		await expect(page.getByTestId("import-modal")).not.toBeVisible();
		await expect(page.getByText("test-image-1.png")).toBeVisible();
		await expect(page.getByText("test-image-2.png")).toBeVisible();

		// Canvas shows the image (placeholder should be gone).
		await expect(
			page.getByText("Import images to get started"),
		).not.toBeVisible();
	});
});

test.describe("File management", () => {
	test("delete a file and undo", async ({ page }) => {
		await page.goto("/");

		// Import a file.
		await page.getByTestId("import-btn").click();
		await page
			.getByTestId("file-input")
			.setInputFiles(path.join(fixtures, "single-image"));
		await page.getByTestId("import-done").click();
		await expect(page.getByText("test-image-1.png")).toBeVisible();

		// Delete the file.
		await page.getByLabel("Delete test-image-1.png").click();

		// File list item should be gone, but undo banner should appear.
		await expect(
			page.getByTestId("file-list-item").filter({ hasText: "test-image-1.png" }),
		).not.toBeVisible();
		await expect(page.getByTestId("undo-banner")).toBeVisible();

		// Undo restores the file.
		await page.getByTestId("undo-btn").click();
		await expect(
			page.getByTestId("file-list-item").filter({ hasText: "test-image-1.png" }),
		).toBeVisible();
	});
});

test.describe("Search", () => {
	test("filter files by name", async ({ page }) => {
		await page.goto("/");

		// Import two files.
		await page.getByTestId("import-btn").click();
		await page
			.getByTestId("file-input")
			.setInputFiles(path.join(fixtures, "two-images"));
		await page.getByTestId("import-done").click();

		// Type search query.
		await page.getByTestId("file-search").fill("image-1");
		await expect(page.getByText("test-image-1.png")).toBeVisible();
		await expect(page.getByText("test-image-2.png")).not.toBeVisible();

		// Clear search.
		await page.getByTestId("file-search").fill("");
		await expect(page.getByText("test-image-2.png")).toBeVisible();
	});
});

test.describe("Class management", () => {
	test("add a new class and select it", async ({ page }) => {
		await page.goto("/");

		// Add new class.
		await page.getByTestId("add-class-btn").click();
		const input = page.getByTestId("new-class-input");
		await input.fill("tiger");
		await input.press("Enter");

		// New pill visible.
		await expect(page.getByText("tiger")).toBeVisible();

		// Select it.
		await page.getByText("tiger").click();

		// Verify active state (pill should have active border).
		const tigerPill = page
			.getByTestId("class-pill")
			.filter({ hasText: "tiger" });
		await expect(tigerPill).toHaveClass(/pillActive/);
	});

	test("delete a class", async ({ page }) => {
		await page.goto("/");

		// Delete default class.
		await page.getByLabel("Delete class default-class").click();
		await expect(page.getByText("default-class")).not.toBeVisible();
	});
});

test.describe("File navigation", () => {
	test("navigate between files with palette arrows", async ({ page }) => {
		await page.goto("/");

		// Import two files.
		await page.getByTestId("import-btn").click();
		await page
			.getByTestId("file-input")
			.setInputFiles(path.join(fixtures, "two-images"));
		await page.getByTestId("import-done").click();

		// First file should be selected (check for selected style).
		const item1 = page
			.getByTestId("file-list-item")
			.filter({ hasText: "test-image-1.png" });
		await expect(item1).toHaveClass(/selected/);

		// Navigate forward.
		await page.getByTestId("nav-forward").click();
		const item2 = page
			.getByTestId("file-list-item")
			.filter({ hasText: "test-image-2.png" });
		await expect(item2).toHaveClass(/selected/);

		// Navigate backward.
		await page.getByTestId("nav-backward").click();
		await expect(item1).toHaveClass(/selected/);
	});
});

test.describe("Export modal", () => {
	test("open export, change format, and close", async ({ page }) => {
		await page.goto("/");

		// Open export.
		await page.getByTestId("export-btn").click();
		await expect(page.getByTestId("export-modal")).toBeVisible();

		// YOLO should be selected by default.
		await expect(page.locator('input[value="yolo"]')).toBeChecked();

		// Change to COCO.
		await page.locator('input[value="coco"]').click();
		await expect(page.locator('input[value="coco"]')).toBeChecked();

		// Cancel.
		await page.getByTestId("export-cancel").click();
		await expect(page.getByTestId("export-modal")).not.toBeVisible();
	});

	test("shows all format options", async ({ page }) => {
		await page.goto("/");
		await page.getByTestId("export-btn").click();

		await expect(page.locator('input[value="yolo"]')).toBeVisible();
		await expect(page.locator('input[value="coco"]')).toBeVisible();
		await expect(page.locator('input[value="json"]')).toBeVisible();
		await expect(page.locator('input[value="voc"]')).toBeVisible();
		await expect(page.locator('input[value="labelme"]')).toBeVisible();

		await page.getByTestId("export-cancel").click();
	});
});

test.describe("Import with annotations", () => {
	test("imports YOLO annotations alongside images", async ({ page }) => {
		await page.goto("/");

		// Open import modal.
		await page.getByTestId("import-btn").click();
		await expect(page.getByTestId("import-modal")).toBeVisible();

		// Upload directory with image + YOLO annotation files.
		await page
			.getByTestId("file-input")
			.setInputFiles(path.join(fixtures, "yolo-dataset"));

		// Summary should show annotation detection.
		await expect(page.getByTestId("import-summary")).toContainText(
			"1 image found",
		);
		await expect(page.getByTestId("import-summary")).toContainText(
			"YOLO annotations detected",
		);

		// Import.
		await page.getByTestId("import-done").click();
		await expect(page.getByTestId("import-modal")).not.toBeVisible();

		// Image should appear in file list.
		await expect(page.getByText("test-image-1.png")).toBeVisible();

		// The imported class should appear in the palette.
		await expect(page.getByText("test-class")).toBeVisible();

		// An annotation polygon should be rendered on the canvas.
		await expect(page.locator("svg polygon")).toBeVisible();
	});
});

test.describe("Import with unreadable images", () => {
	test("imports the readable images and names the skipped ones", async ({ page }) => {
		await page.goto("/");

		// Import a folder holding one good and one corrupt image.
		await page.getByTestId("import-btn").click();
		await page
			.getByTestId("file-input")
			.setInputFiles(path.join(fixtures, "with-broken-image"));
		await page.getByTestId("import-done").click();

		// The good image is imported and the corrupt one is reported.
		await expect(page.getByText("test-image-1.png")).toBeVisible();
		await expect(
			page.getByText("Skipped 1 unreadable image: broken.png"),
		).toBeVisible();
		await expect(page.getByText("Files (0/1)")).toBeVisible();
		await expect(page.getByText(/^Importing/)).not.toBeVisible();
	});
});

test.describe("Object mode", () => {
	// marks.png (200x120): a filled disk at (50, 60) r 15, a 2 px ring at (150, 60) r 18.
	async function setup(page: Page) {
		await page.goto("/");
		await page.getByTestId("import-btn").click();
		await page
			.getByTestId("file-input")
			.setInputFiles(path.join(fixtures, "object-marks"));
		await page.getByTestId("import-done").click();
		await expect(page.locator("img[alt='Annotation target']")).toBeVisible();
		await page.getByTestId("mode-object").click();
		const box = (await page.getByTestId("canvas-svg").boundingBox())!;
		// Image pixel -> screen position.
		return (x: number, y: number) => [box.x + (x / 200) * box.width, box.y + (y / 120) * box.height] as const;
	}

	// Pixel bounding box of the nth outline.
	async function outline(page: Page, n: number) {
		const points = await page.locator("[data-testid='canvas-svg'] polygon").nth(n).getAttribute("points");
		const pts = points!.trim().split(/\s+/).map((p) => p.split(",").map(Number));
		const xs = pts.map(([x]) => x! * 200);
		const ys = pts.map(([, y]) => y! * 120);
		return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
	}

	test("tapping marks outlines them", async ({ page }) => {
		const at = await setup(page);

		await page.mouse.click(...at(50, 60));
		await page.mouse.click(...at(150, 60));

		await expect(page.locator("[data-testid='canvas-svg'] polygon")).toHaveCount(2);
		const disk = await outline(page, 0);
		expect(disk.x0).toBeGreaterThan(30);
		expect(disk.x1).toBeLessThan(70);
		expect(disk.y0).toBeGreaterThan(40);
		expect(disk.y1).toBeLessThan(80);
		const ring = await outline(page, 1);
		expect(ring.x0).toBeLessThan(134);
		expect(ring.x1).toBeGreaterThan(166);
	});

	test("a loop outlines every mark inside it", async ({ page }) => {
		const at = await setup(page);

		// Stays below the floating palette at the top left.
		const loop = [[25, 36], [180, 36], [180, 95], [25, 95], [25, 36]] as const;
		await page.mouse.move(...at(...loop[0]));
		await page.mouse.down();
		for (let k = 1; k < loop.length; k++) {
			const [ax, ay] = loop[k - 1]!;
			const [bx, by] = loop[k]!;
			for (let t = 1; t <= 10; t++) {
				await page.mouse.move(...at(ax + ((bx - ax) * t) / 10, ay + ((by - ay) * t) / 10));
			}
		}
		await page.mouse.up();

		await expect(page.locator("[data-testid='canvas-svg'] polygon")).toHaveCount(1);
		const both = await outline(page, 0);
		expect(both.x0).toBeLessThan(36);
		expect(both.x1).toBeGreaterThan(166);
	});

	test("a tap on empty paper explains how to use the tool", async ({ page }) => {
		const at = await setup(page);

		await page.mouse.click(...at(100, 110));

		await expect(page.getByText(/No mark found there/)).toBeVisible();
		await expect(page.locator("[data-testid='canvas-svg'] polygon")).toHaveCount(0);
	});
});

test.describe("Canvas layout", () => {
	test("image fills the full canvas area", async ({ page }) => {
		await page.goto("/");

		// Import an image.
		await page.getByTestId("import-btn").click();
		await page
			.getByTestId("file-input")
			.setInputFiles(path.join(fixtures, "single-image"));
		await page.getByTestId("import-done").click();

		// The image and SVG should fill their container.
		const img = page.locator("img[alt='Annotation target']");
		const svg = page.getByTestId("canvas-svg");
		await expect(img).toBeVisible();
		await expect(svg).toBeVisible();

		const imgBox = await img.boundingBox();
		const svgBox = await svg.boundingBox();
		expect(imgBox).not.toBeNull();
		expect(svgBox).not.toBeNull();

		// Image and SVG should have the same position and size.
		expect(imgBox!.x).toBeCloseTo(svgBox!.x, 0);
		expect(imgBox!.y).toBeCloseTo(svgBox!.y, 0);
		expect(imgBox!.width).toBeCloseTo(svgBox!.width, 0);
		expect(imgBox!.height).toBeCloseTo(svgBox!.height, 0);

		// Image should fill substantially more than half the viewport width
		// (proving it's stretched, not just contained at natural size).
		const viewport = page.viewportSize()!;
		expect(imgBox!.width).toBeGreaterThan(viewport.width * 0.5);
		expect(imgBox!.height).toBeGreaterThan(viewport.height * 0.5);
	});

	test("lasso drawing produces correctly positioned annotation", async ({ page }) => {
		await page.goto("/");

		// Import an image.
		await page.getByTestId("import-btn").click();
		await page
			.getByTestId("file-input")
			.setInputFiles(path.join(fixtures, "single-image"));
		await page.getByTestId("import-done").click();
		await expect(
			page.locator("img[alt='Annotation target']"),
		).toBeVisible();

		// Get the SVG bounding box for coordinate calculation.
		const svg = page.getByTestId("canvas-svg");
		const box = (await svg.boundingBox())!;

		// Draw a lasso triangle: start near top-left, drag to right,
		// then down, then back near start. It stays below the palette,
		// which floats over the top-left of the canvas.
		const x1 = box.x + box.width * 0.3;
		const y1 = box.y + box.height * 0.3;
		const x2 = box.x + box.width * 0.7;
		const y2 = box.y + box.height * 0.3;
		const x3 = box.x + box.width * 0.5;
		const y3 = box.y + box.height * 0.7;

		// Draw the lasso (pointer down, move through points, release near start).
		await page.mouse.move(x1, y1);
		await page.mouse.down();
		// Move through the triangle vertices.
		for (let i = 0; i <= 10; i++) {
			const t = i / 10;
			await page.mouse.move(
				x1 + (x2 - x1) * t,
				y1 + (y2 - y1) * t,
			);
		}
		for (let i = 0; i <= 10; i++) {
			const t = i / 10;
			await page.mouse.move(
				x2 + (x3 - x2) * t,
				y2 + (y3 - y2) * t,
			);
		}
		// Close back to start.
		for (let i = 0; i <= 10; i++) {
			const t = i / 10;
			await page.mouse.move(
				x3 + (x1 - x3) * t,
				y3 + (y1 - y3) * t,
			);
		}
		await page.mouse.up();

		// An annotation polygon should now be visible.
		await expect(page.locator("svg polygon")).toBeVisible();
	});
});

test.describe("Sidebar", () => {
	test("resize handle is visible", async ({ page }) => {
		await page.goto("/");
		await expect(
			page.getByTestId("sidebar-resize-handle"),
		).toBeVisible();
	});
});
