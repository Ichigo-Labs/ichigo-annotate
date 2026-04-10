import { useEffect, useState } from "react";
import type { ImageFile } from "../types/appState";
import { sortFilesByName } from "../utils/fileSort";
import { FileListItem } from "./FileListItem";
import styles from "./FileList.module.css";

interface FileListProps {
	files: ImageFile[];
	totalFileCount: number;
	annotatedFileCount: number;
	selectedFileId: string | null;
	searchQuery: string;
	lastDeletedFile: ImageFile | null;
	polygonize: boolean;
	polygonizeSides: number;
	stretchImage: boolean;
	onSearchChange: (query: string) => void;
	onSelectFile: (fileId: string) => void;
	onDeleteFile: (fileId: string) => void;
	onUndoDelete: () => void;
	onImportClick: () => void;
	onExportClick: () => void;
	onPolygonizeChange: (enabled: boolean) => void;
	onPolygonizeSidesChange: (sides: number) => void;
	onStretchImageChange: (enabled: boolean) => void;
}

export function FileList({
	files,
	totalFileCount,
	annotatedFileCount,
	selectedFileId,
	searchQuery,
	lastDeletedFile,
	onSearchChange,
	onSelectFile,
	onDeleteFile,
	onUndoDelete,
	onImportClick,
	onExportClick,
	polygonize,
	polygonizeSides,
	stretchImage,
	onPolygonizeChange,
	onPolygonizeSidesChange,
	onStretchImageChange,
}: FileListProps) {
	const [sidesText, setSidesText] = useState(String(polygonizeSides));

	useEffect(() => {
		setSidesText(String(polygonizeSides));
	}, [polygonizeSides]);

	// Filter files by search query, then sort numerically by the first number in the filename.
	const filtered = searchQuery
		? files.filter((f) =>
				f.name.toLowerCase().includes(searchQuery.toLowerCase()),
			)
		: files;

	const sorted = sortFilesByName(filtered);

	return (
		<div className={styles.container} data-testid="file-list">
			<div className={styles.header}>Files ({annotatedFileCount}/{totalFileCount})</div>

			<input
				className={styles.searchInput}
				type="text"
				placeholder="Search files..."
				value={searchQuery}
				onChange={(e) => onSearchChange(e.target.value)}
				data-testid="file-search"
			/>

			<div className={styles.list}>
				{sorted.map((file) => (
					<FileListItem
						key={file.id}
						name={file.name}
						thumbnailSrc={file.thumbnailDataUrl}
						selected={file.id === selectedFileId}
						hasAnnotations={file.annotations.length > 0}
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

			<div className={styles.polygonizeRow} data-testid="polygonize-row">
				<label className={styles.polygonizeLabel}>
					<input
						type="checkbox"
						checked={polygonize}
						onChange={(e) => onPolygonizeChange(e.target.checked)}
						data-testid="polygonize-checkbox"
					/>
					Polygonize
				</label>
				<input
					className={styles.polygonizeInput}
					type="number"
					min={3}
					value={sidesText}
					disabled={!polygonize}
					onChange={(e) => setSidesText(e.target.value)}
					onBlur={() => {
						const n = parseInt(sidesText, 10);
						const clamped = isNaN(n) || n < 3 ? polygonizeSides : n;
						setSidesText(String(clamped));
						onPolygonizeSidesChange(clamped);
					}}
					data-testid="polygonize-sides"
				/>
			</div>

			<div className={styles.polygonizeRow} data-testid="stretch-row">
				<label className={styles.polygonizeLabel}>
					<input
						type="checkbox"
						checked={stretchImage}
						onChange={(e) => onStretchImageChange(e.target.checked)}
						data-testid="stretch-checkbox"
					/>
					Stretch image
				</label>
			</div>
		</div>
	);
}
