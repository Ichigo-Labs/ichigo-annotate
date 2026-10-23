import type { StorageStatus } from "../types/appState";
import styles from "./StorageNotice.module.css";

interface StorageNoticeProps {
	status: StorageStatus;
	error: string | null;
	onReload: () => void;
}

const WARNINGS: Partial<Record<StorageStatus, string>> = {
	save_failed: "Changes aren't being saved. Retrying… Export to keep a copy.",
	load_failed:
		"Saved files couldn't be loaded, so changes aren't being saved. Export to keep a copy, then reload.",
	outdated:
		"The app was updated or reset in another tab, so this tab stopped saving. Reload to continue.",
};

// Tells the user when their work isn't safely stored. Until the saved files
// have loaded it covers the app, so nothing done meanwhile gets replaced.
export function StorageNotice({ status, error, onReload }: StorageNoticeProps) {
	if (status === "loading" || status === "blocked") {
		return (
			<div className={styles.overlay} data-testid="storage-overlay">
				<div className={styles.card}>
					{status === "loading"
						? "Loading saved files…"
						: "Close other ichigo-annotate tabs or windows to finish updating."}
				</div>
			</div>
		);
	}

	const warning = WARNINGS[status];
	if (!warning) return null;
	return (
		<div className={styles.banner} role="alert" data-testid="storage-warning">
			<div className={styles.message}>
				{warning}
				{error && <div className={styles.detail}>{error}</div>}
			</div>
			{status !== "save_failed" && (
				<button className={styles.reloadBtn} onClick={onReload} data-testid="storage-reload">
					Reload
				</button>
			)}
		</div>
	);
}
