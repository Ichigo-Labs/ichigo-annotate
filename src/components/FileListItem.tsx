import styles from "./FileListItem.module.css";

interface FileListItemProps {
	name: string;
	thumbnailSrc: string;
	selected: boolean;
	onSelect: () => void;
	onDelete: () => void;
}

export function FileListItem({
	name,
	thumbnailSrc,
	selected,
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
