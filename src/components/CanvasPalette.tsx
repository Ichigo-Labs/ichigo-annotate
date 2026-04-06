import { useRef, useState } from "react";
import type { AnnotationClass } from "../types/appState";
import { generateDistinctColor } from "../utils/areaUtils";
import styles from "./CanvasPalette.module.css";

interface CanvasPaletteProps {
	classes: AnnotationClass[];
	activeClassId: string;
	position: { x: number; y: number };
	onSelectClass: (classId: string) => void;
	onDeleteClass: (classId: string) => void;
	onAddClass: (name: string, color: string) => void;
	onNavigate: (direction: "forward" | "backward") => void;
	onDragEnd: (position: { x: number; y: number }) => void;
}

export function CanvasPalette({
	classes,
	activeClassId,
	position,
	onSelectClass,
	onDeleteClass,
	onAddClass,
	onNavigate,
	onDragEnd,
}: CanvasPaletteProps) {
	const [adding, setAdding] = useState(false);
	const [newName, setNewName] = useState("");
	const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
	const paletteRef = useRef<HTMLDivElement>(null);

	// -- Drag handlers --

	const handleDragStart = (e: React.PointerEvent) => {
		e.preventDefault();
		dragRef.current = {
			startX: e.clientX,
			startY: e.clientY,
			posX: position.x,
			posY: position.y,
		};
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};

	const clampPosition = (x: number, y: number) => {
		const el = paletteRef.current;
		if (!el) return { x, y };
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		const margin = 40; // keep at least this many pixels on-screen
		return {
			x: Math.max(margin - w, Math.min(window.innerWidth - margin, x)),
			y: Math.max(margin - h, Math.min(window.innerHeight - margin, y)),
		};
	};

	const handleDragMove = (e: React.PointerEvent) => {
		if (!dragRef.current) return;
		const dx = e.clientX - dragRef.current.startX;
		const dy = e.clientY - dragRef.current.startY;
		const el = paletteRef.current;
		if (el) {
			const clamped = clampPosition(dragRef.current.posX + dx, dragRef.current.posY + dy);
			el.style.left = `${clamped.x}px`;
			el.style.top = `${clamped.y}px`;
		}
	};

	const handleDragEnd = (e: React.PointerEvent) => {
		if (!dragRef.current) return;
		const dx = e.clientX - dragRef.current.startX;
		const dy = e.clientY - dragRef.current.startY;
		onDragEnd(clampPosition(dragRef.current.posX + dx, dragRef.current.posY + dy));
		dragRef.current = null;
	};

	// -- Add class --

	const handleAddConfirm = () => {
		const trimmed = newName.trim();
		if (!trimmed) return;
		const color = generateDistinctColor(classes.map((c) => c.color));
		onAddClass(trimmed, color);
		setNewName("");
		setAdding(false);
	};

	return (
		<div
			ref={paletteRef}
			className={styles.palette}
			style={{ left: position.x, top: position.y }}
			data-testid="canvas-palette"
		>
			{/* Drag handle */}
			<div
				className={styles.dragHandle}
				onPointerDown={handleDragStart}
				onPointerMove={handleDragMove}
				onPointerUp={handleDragEnd}
				data-testid="palette-drag-handle"
			>
				⋮⋮⋮
			</div>

			{/* Class pills */}
			<div className={styles.pills}>
				{classes.map((cls) => (
					<div
						key={cls.id}
						className={`${styles.pill} ${cls.id === activeClassId ? styles.pillActive : ""}`}
						style={{ background: `${cls.color}33` }}
						onClick={() => onSelectClass(cls.id)}
						data-testid="class-pill"
					>
						<div
							className={styles.colorDot}
							style={{ background: cls.color }}
						/>
						<span className={styles.pillName}>{cls.name}</span>
						<button
							className={styles.pillDelete}
							onClick={(e) => {
								e.stopPropagation();
								onDeleteClass(cls.id);
							}}
							aria-label={`Delete class ${cls.name}`}
						>
							×
						</button>
					</div>
				))}
			</div>

			{/* Bottom row */}
			<div className={styles.bottomRow}>
				{adding ? (
					<input
						className={styles.newClassInput}
						autoFocus
						value={newName}
						placeholder="Class name..."
						onChange={(e) => setNewName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleAddConfirm();
							if (e.key === "Escape") {
								setAdding(false);
								setNewName("");
							}
						}}
						onBlur={() => {
							if (!newName.trim()) {
								setAdding(false);
								setNewName("");
							}
						}}
						data-testid="new-class-input"
					/>
				) : (
					<button
						className={styles.iconBtn}
						onClick={() => setAdding(true)}
						aria-label="Add class"
						data-testid="add-class-btn"
					>
						+
					</button>
				)}
				<div className={styles.spacer} />
				<button
					className={styles.iconBtn}
					onClick={() => onNavigate("backward")}
					aria-label="Previous image"
					data-testid="nav-backward"
				>
					◀
				</button>
				<button
					className={styles.iconBtn}
					onClick={() => onNavigate("forward")}
					aria-label="Next image"
					data-testid="nav-forward"
				>
					▶
				</button>
			</div>
		</div>
	);
}
