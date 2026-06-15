import { useRef, useState } from "react";
import JSZip from "jszip";
import { isCocoFileName } from "../utils/importUtils";
import styles from "./ImportModal.module.css";

interface ImportModalProps {
	open: boolean;
	onImport: (files: File[], replace: boolean) => void;
	onCancel: () => void;
}

type DetectedFormat = "YOLO" | "COCO" | "VOC" | "JSON" | null;
type ImportSource = "folder" | "zip";

const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"bmp",
	"svg",
	"tif",
	"tiff",
]);

function mimeFromName(name: string): string {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	if (IMAGE_EXTENSIONS.has(ext)) {
		const mapped = ext === "jpg" ? "jpeg" : ext === "tif" ? "tiff" : ext;
		return ext === "svg" ? "image/svg+xml" : `image/${mapped}`;
	}
	if (ext === "txt") return "text/plain";
	if (ext === "json") return "application/json";
	if (ext === "xml") return "application/xml";
	return "application/octet-stream";
}

function detectFormat(files: File[]): DetectedFormat {
	if (files.some((f) => isCocoFileName(f.name))) return "COCO";
	if (files.some((f) => f.name.endsWith(".xml"))) return "VOC";
	const hasAnnotationTxt = files.some(
		(f) =>
			f.name.endsWith(".txt") &&
			f.name !== "classes.txt" &&
			!f.type.startsWith("image/"),
	);
	if (hasAnnotationTxt) return "YOLO";
	const hasAnnotationJson = files.some(
		(f) => f.name.endsWith(".json") && !f.type.startsWith("image/"),
	);
	if (hasAnnotationJson) return "JSON";
	return null;
}

async function extractZip(file: File): Promise<File[]> {
	const zip = await JSZip.loadAsync(file);
	const extracted: File[] = [];

	for (const [path, entry] of Object.entries(zip.files)) {
		if (entry.dir) continue;
		const name = path.split("/").pop() || path;
		const blob = await entry.async("blob");
		const type = mimeFromName(name);
		extracted.push(new File([blob], name, { type }));
	}

	return extracted;
}

export function ImportModal({ open, onImport, onCancel }: ImportModalProps) {
	const [replace, setReplace] = useState(false);
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [source, setSource] = useState<ImportSource>("folder");
	const [extracting, setExtracting] = useState(false);
	const folderInputRef = useRef<HTMLInputElement>(null);
	const zipInputRef = useRef<HTMLInputElement>(null);

	if (!open) return null;

	const imageCount = selectedFiles.filter((f) =>
		f.type.startsWith("image/"),
	).length;
	const annotationFileCount = selectedFiles.filter(
		(f) => !f.type.startsWith("image/") && f.name !== "classes.txt",
	).length;
	const annotationsOnly = imageCount === 0 && annotationFileCount > 0;
	const format = detectFormat(selectedFiles);
	const hasClassesTxt = selectedFiles.some((f) => f.name === "classes.txt");

	const resetInputs = () => {
		setSelectedFiles([]);
		setReplace(false);
		if (folderInputRef.current) folderInputRef.current.value = "";
		if (zipInputRef.current) zipInputRef.current.value = "";
	};

	const handleDone = () => {
		if (imageCount === 0 && annotationFileCount === 0) return;
		onImport(selectedFiles, annotationsOnly ? false : replace);
		resetInputs();
	};

	const handleCancel = () => {
		resetInputs();
		onCancel();
	};

	const handleSourceChange = (next: ImportSource) => {
		setSource(next);
		setSelectedFiles([]);
		if (folderInputRef.current) folderInputRef.current.value = "";
		if (zipInputRef.current) zipInputRef.current.value = "";
	};

	const handleZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setExtracting(true);
		try {
			const files = await extractZip(file);
			setSelectedFiles(files);
		} catch {
			setSelectedFiles([]);
		} finally {
			setExtracting(false);
		}
	};

	return (
		<div
			className={styles.overlay}
			data-testid="import-modal"
			onClick={(e) => {
				if (e.target === e.currentTarget) handleCancel();
			}}
		>
			<div className={styles.card}>
				<div className={styles.title}>Import Dataset</div>

				{!annotationsOnly && (
					<label className={`${styles.field} ${styles.checkboxRow}`}>
						<input
							type="checkbox"
							checked={replace}
							onChange={(e) => setReplace(e.target.checked)}
							data-testid="replace-checkbox"
						/>
						Replace current file list?
					</label>
				)}

				<div className={`${styles.field} ${styles.sourceToggle}`}>
					<button
						type="button"
						className={`${styles.sourceBtn} ${source === "folder" ? styles.sourceBtnActive : ""}`}
						onClick={() => handleSourceChange("folder")}
						data-testid="source-folder"
					>
						Folder
					</button>
					<button
						type="button"
						className={`${styles.sourceBtn} ${source === "zip" ? styles.sourceBtnActive : ""}`}
						onClick={() => handleSourceChange("zip")}
						data-testid="source-zip"
					>
						Zip file
					</button>
				</div>

				<div className={styles.field}>
					{source === "folder" ? (
						<input
							ref={folderInputRef}
							className={styles.fileInput}
							type="file"
							multiple
							/* @ts-expect-error webkitdirectory is not in React's type defs */
							webkitdirectory=""
							onChange={(e) =>
								setSelectedFiles(Array.from(e.target.files ?? []))
							}
							data-testid="file-input"
						/>
					) : (
						<input
							ref={zipInputRef}
							className={styles.fileInput}
							type="file"
							accept=".zip"
							onChange={handleZipChange}
							data-testid="zip-input"
						/>
					)}
				</div>

				{extracting && (
					<div className={styles.summary}>Extracting zip…</div>
				)}

				{!extracting && selectedFiles.length > 0 && (
					<div className={styles.summary} data-testid="import-summary">
						{annotationsOnly
							? `${annotationFileCount} annotation file${annotationFileCount !== 1 ? "s" : ""} found \u00B7 ${format} \u00B7 will update matching images`
							: `${imageCount} image${imageCount !== 1 ? "s" : ""} found${format ? ` \u00B7 ${format} annotations detected` : " \u00B7 no annotations detected"}${hasClassesTxt && format !== "YOLO" ? " \u00B7 classes.txt found" : ""}`}
					</div>
				)}

				<div className={styles.buttons}>
					<button
						className={`${styles.btn} ${styles.btnSecondary}`}
						onClick={handleCancel}
						data-testid="import-cancel"
					>
						Cancel
					</button>
					<button
						className={`${styles.btn} ${styles.btnPrimary}`}
						disabled={(imageCount === 0 && annotationFileCount === 0) || extracting}
						onClick={handleDone}
						data-testid="import-done"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}
