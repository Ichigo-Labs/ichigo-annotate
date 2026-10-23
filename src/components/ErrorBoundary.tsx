import { Component, type ReactNode } from "react";
import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
	children: ReactNode;
	onReload: () => void;
}

interface ErrorBoundaryState {
	error: Error | null;
}

// Shows a reload screen instead of a blank page when rendering throws. Work
// up to the last save is stored in the browser, so reloading restores it.
// (React only supports error boundaries as class components.)
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	override state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	override render() {
		const { error } = this.state;
		if (!error) return this.props.children;
		return (
			<div className={styles.screen} role="alert" data-testid="error-screen">
				<div className={styles.card}>
					<div className={styles.title}>Something went wrong</div>
					<p>Your work up to the last save is kept. Reload to continue.</p>
					<pre className={styles.detail}>{error.message}</pre>
					<button
						className={styles.reloadBtn}
						onClick={this.props.onReload}
						data-testid="error-reload"
					>
						Reload
					</button>
				</div>
			</div>
		);
	}
}
