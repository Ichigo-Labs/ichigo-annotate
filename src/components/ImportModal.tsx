import { useRef, useState } from "react";
import styles from "./ImportModal.module.css";

interface ImportModalProps {
	open: boolean;
	onImport: (files: File[], replace: boolean) => void;
	onCancel: () => void;
}

type DetectedFormat = "YOLO" | "COCO" | "VOC" | "JSON" | null;

function detectFormat(files: File[]): DetectedFormat {
	if (files.some((f) => f.name === "annotations.json")) return "COCO";
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

export function ImportModal({ open, onImport, onCancel }: ImportModalProps) {
	const [replace, setReplace] = useState(false);
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);

	if (!open) return null;

	const imageCount = selectedFiles.filter((f) =>
		f.type.startsWith("image/"),
	).length;
	const format = detectFormat(selectedFiles);

	const handleDone = () => {
		if (imageCount === 0) return;
		onImport(selectedFiles, replace);
		setSelectedFiles([]);
		setReplace(false);
		if (inputRef.current) inputRef.current.value = "";
	};

	const handleCancel = () => {
		setSelectedFiles([]);
		setReplace(false);
		if (inputRef.current) inputRef.current.value = "";
		onCancel();
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

				<label className={`${styles.field} ${styles.checkboxRow}`}>
					<input
						type="checkbox"
						checked={replace}
						onChange={(e) => setReplace(e.target.checked)}
						data-testid="replace-checkbox"
					/>
					Replace current file list?
				</label>

				<div className={styles.field}>
					<input
						ref={inputRef}
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
				</div>

				{selectedFiles.length > 0 && (
					<div className={styles.summary} data-testid="import-summary">
						{imageCount} image{imageCount !== 1 ? "s" : ""} found
						{format
							? ` \u00B7 ${format} annotations detected`
							: " \u00B7 no annotations detected"}
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
						disabled={imageCount === 0}
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
