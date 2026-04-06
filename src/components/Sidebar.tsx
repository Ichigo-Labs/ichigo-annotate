import { useRef, type ReactNode } from "react";
import styles from "./Sidebar.module.css";

interface SidebarProps {
	collapsed: boolean;
	widthPercent: number;
	side: "left" | "right";
	onResize: (newWidthPercent: number) => void;
	children: ReactNode;
}

export function Sidebar({
	collapsed,
	widthPercent,
	side,
	onResize,
	children,
}: SidebarProps) {
	const dragging = useRef(false);

	const handlePointerDown = (e: React.PointerEvent) => {
		e.preventDefault();
		dragging.current = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		if (!dragging.current) return;
		const pct = side === "left"
			? (e.clientX / window.innerWidth) * 100
			: ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
		onResize(pct);
	};

	const handlePointerUp = () => {
		dragging.current = false;
	};

	const handleClass = side === "left" ? styles.handleRight : styles.handleLeft;

	return (
		<div
			className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}
			style={{ width: collapsed ? 6 : `${widthPercent}%` }}
			data-testid="sidebar"
		>
			<div className={styles.content}>{children}</div>
			<div
				className={`${styles.resizeHandle} ${handleClass}`}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				data-testid="sidebar-resize-handle"
			/>
		</div>
	);
}
