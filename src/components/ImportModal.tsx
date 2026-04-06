import { useRef, useState } from "react";
import styles from "./ImportModal.module.css";

interface ImportModalProps {
	open: boolean;
	onImport: (files: File[], replace: boolean) => void;
	onCancel: () => void;
}

export function ImportModal({ open, onImport, onCancel }: ImportModalProps) {
	const [replace, setReplace] = useState(false);
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);

	if (!open) return null;

	const handleDone = () => {
		if (selectedFiles.length === 0) return;
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
				<div className={styles.title}>Import Images</div>

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
						accept="image/*"
						{...{ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>}
						onChange={(e) => {
							const all = Array.from(e.target.files ?? []);
							setSelectedFiles(all.filter((f) => f.type.startsWith("image/")));
						}}
						data-testid="file-input"
					/>
				</div>

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
						disabled={selectedFiles.length === 0}
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
