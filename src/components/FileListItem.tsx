import styles from "./FileListItem.module.css";

interface FileListItemProps {
	name: string;
	thumbnailSrc: string;
	selected: boolean;
	hasAnnotations?: boolean;
	onSelect: () => void;
	onDelete: () => void;
}

export function FileListItem({
	name,
	thumbnailSrc,
	selected,
	hasAnnotations,
	onSelect,
	onDelete,
}: FileListItemProps) {
	return (
		<div
			className={`${styles.item} ${selected ? styles.selected : ""}`}
			onClick={onSelect}
			data-testid="file-list-item"
		>
			<img className={styles.thumbnail} src={thumbnailSrc} alt={name} />
			<span className={styles.name}>{name}</span>
			{hasAnnotations && (
				<span
					className={styles.annotationIcon}
					title="Has annotations"
					data-testid="annotation-icon"
				>
					●
				</span>
			)}
			<button
				className={styles.deleteBtn}
				onClick={(e) => {
					e.stopPropagation();
					onDelete();
				}}
				aria-label={`Delete ${name}`}
			>
				−
			</button>
		</div>
	);
}
