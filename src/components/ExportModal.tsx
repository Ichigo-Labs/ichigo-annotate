import type { ExportFormat } from "../types/appState";
import styles from "./ExportModal.module.css";

interface ExportModalProps {
	open: boolean;
	exportFormat: ExportFormat;
	onFormatChange: (format: ExportFormat) => void;
	onExport: () => void;
	onCancel: () => void;
}

export function ExportModal({
	open,
	exportFormat,
	onFormatChange,
	onExport,
	onCancel,
}: ExportModalProps) {
	if (!open) return null;

	return (
		<div
			className={styles.overlay}
			data-testid="export-modal"
			onClick={(e) => {
				if (e.target === e.currentTarget) onCancel();
			}}
		>
			<div className={styles.card}>
				<div className={styles.title}>Export Annotations</div>

				<div className={styles.formatGroup}>
					<label className={styles.formatLabel}>
						<input
							type="radio"
							name="format"
							value="yolo"
							checked={exportFormat === "yolo"}
							onChange={() => onFormatChange("yolo")}
						/>
						YOLO
					</label>
					<label className={styles.formatLabel}>
						<input
							type="radio"
							name="format"
							value="coco"
							checked={exportFormat === "coco"}
							onChange={() => onFormatChange("coco")}
						/>
						COCO
					</label>
					<label className={styles.formatLabel}>
						<input
							type="radio"
							name="format"
							value="json"
							checked={exportFormat === "json"}
							onChange={() => onFormatChange("json")}
						/>
						JSON
					</label>
					<label className={styles.formatLabel}>
						<input
							type="radio"
							name="format"
							value="voc"
							checked={exportFormat === "voc"}
							onChange={() => onFormatChange("voc")}
						/>
						Pascal VOC
					</label>
					<label className={styles.formatLabel}>
						<input
							type="radio"
							name="format"
							value="labelme"
							checked={exportFormat === "labelme"}
							onChange={() => onFormatChange("labelme")}
						/>
						LabelMe
					</label>
				</div>

				<div className={styles.buttons}>
					<button
						className={`${styles.btn} ${styles.btnSecondary}`}
						onClick={onCancel}
						data-testid="export-cancel"
					>
						Cancel
					</button>
					<button
						className={`${styles.btn} ${styles.btnPrimary}`}
						onClick={onExport}
						data-testid="export-done"
					>
						Export as ZIP
					</button>
				</div>
			</div>
		</div>
	);
}
