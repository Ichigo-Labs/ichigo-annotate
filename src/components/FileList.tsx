import type { ImageFile } from "../types/appState";
import { FileListItem } from "./FileListItem";
import styles from "./FileList.module.css";

interface FileListProps {
	files: ImageFile[];
	selectedFileId: string | null;
	searchQuery: string;
	lastDeletedFile: ImageFile | null;
	onSearchChange: (query: string) => void;
	onSelectFile: (fileId: string) => void;
	onDeleteFile: (fileId: string) => void;
	onUndoDelete: () => void;
	onImportClick: () => void;
	onExportClick: () => void;
}

export function FileList({
	files,
	selectedFileId,
	searchQuery,
	lastDeletedFile,
	onSearchChange,
	onSelectFile,
	onDeleteFile,
	onUndoDelete,
	onImportClick,
	onExportClick,
}: FileListProps) {
	// Filter files by search query.
	const filtered = searchQuery
		? files.filter((f) =>
				f.name.toLowerCase().includes(searchQuery.toLowerCase()),
			)
		: files;

	return (
		<div className={styles.container} data-testid="file-list">
			<div className={styles.header}>Files</div>

			<input
				className={styles.searchInput}
				type="text"
				placeholder="Search files..."
				value={searchQuery}
				onChange={(e) => onSearchChange(e.target.value)}
				data-testid="file-search"
			/>

			<div className={styles.list}>
				{filtered.map((file) => (
					<FileListItem
						key={file.id}
						name={file.name}
						thumbnailSrc={file.thumbnailDataUrl}
						selected={file.id === selectedFileId}
						onSelect={() => onSelectFile(file.id)}
						onDelete={() => onDeleteFile(file.id)}
					/>
				))}
			</div>

			{lastDeletedFile && (
				<div className={styles.undoBanner} data-testid="undo-banner">
					<span>Deleted {lastDeletedFile.name}</span>
					<button
						className={styles.undoBtn}
						onClick={onUndoDelete}
						data-testid="undo-btn"
					>
						Undo
					</button>
				</div>
			)}

			<div className={styles.actions}>
				<button
					className={styles.actionBtn}
					onClick={onImportClick}
					data-testid="import-btn"
				>
					Import
				</button>
				<button
					className={styles.actionBtn}
					onClick={onExportClick}
					data-testid="export-btn"
				>
					Export
				</button>
			</div>
		</div>
	);
}
