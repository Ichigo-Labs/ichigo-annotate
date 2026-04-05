import type { Toast } from "../types/appState";
import styles from "./SystemToast.module.css";

interface SystemToastProps {
	toasts: Toast[];
}

export function SystemToast({ toasts }: SystemToastProps) {
	if (toasts.length === 0) return null;

	return (
		<div className={styles.container} data-testid="toast-container">
			{toasts.map((toast) => (
				<div key={toast.id} className={styles.toast} data-testid="toast">
					<div className={styles.message}>{toast.message}</div>
					{toast.progress && (
						<div className={styles.progressBar}>
							<div
								className={styles.progressFill}
								style={{
									width: `${(toast.progress.current / toast.progress.total) * 100}%`,
								}}
							/>
						</div>
					)}
				</div>
			))}
		</div>
	);
}
