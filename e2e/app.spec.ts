import { test, expect } from "@playwright/test";
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

test.describe("Sidebar", () => {
	test("resize handle is visible", async ({ page }) => {
		await page.goto("/");
		await expect(
			page.getByTestId("sidebar-resize-handle"),
		).toBeVisible();
	});
});
