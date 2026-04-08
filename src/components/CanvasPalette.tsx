import { useRef, useState } from "react";
import type { AnnotationClass, CanvasMode } from "../types/appState";
import { generateDistinctColor } from "../utils/areaUtils";
import styles from "./CanvasPalette.module.css";

interface CanvasPaletteProps {
	classes: AnnotationClass[];
	activeClassId: string;
	canvasMode: CanvasMode;
	canUndo: boolean;
	canRedo: boolean;
	position: { x: number; y: number };
	isDraggingAnnotation: boolean;
	trashRef: React.RefObject<HTMLDivElement | null>;
	onSelectClass: (classId: string) => void;
	onDeleteClass: (classId: string) => void;
	onAddClass: (name: string, color: string) => void;
	onModeChange: (mode: CanvasMode) => void;
	onUndo: () => void;
	onRedo: () => void;
	onNavigate: (direction: "forward" | "backward") => void;
	onDragEnd: (position: { x: number; y: number }) => void;
}

export function CanvasPalette({
	classes,
	activeClassId,
	canvasMode,
	canUndo,
	canRedo,
	position,
	isDraggingAnnotation,
	trashRef,
	onSelectClass,
	onDeleteClass,
	onAddClass,
	onModeChange,
	onUndo,
	onRedo,
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
				{classes.filter((c) => !c.hidden).map((cls) => (
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

			{/* Trash drop target — visible while dragging an annotation */}
			{isDraggingAnnotation && (
				<div
					ref={trashRef}
					className={styles.trashTarget}
					data-testid="trash-target"
				>
					🗑
				</div>
			)}

			{/* Bottom row */}
			<div className={styles.bottomRow}>
				<button
					className={`${styles.iconBtn} ${canvasMode === "lasso" ? styles.iconBtnActive : ""}`}
					onClick={() => onModeChange("lasso")}
					aria-label="Lasso mode"
					data-testid="mode-lasso"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
						<path d="M8 2.5C4.5 2.5 2 5 2 7.5S4.5 12.5 8 12.5c1.8 0 3.3-.7 4.3-1.8" strokeDasharray="2.5 1.5"/>
						<path d="M12.3 10.7l1.2 3.8"/>
					</svg>
				</button>
				<button
					className={`${styles.iconBtn} ${canvasMode === "bucket" ? styles.iconBtnActive : ""}`}
					onClick={() => onModeChange("bucket")}
					aria-label="Bucket fill mode"
					data-testid="mode-bucket"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
						<path d="M3.5 6h9l-1.5 8h-6z"/>
						<path d="M5 6l1-3.5h4L11 6"/>
						<path d="M13.5 9c1 1 1.5 2.5.5 3.2"/>
					</svg>
				</button>
				<button
					className={`${styles.iconBtn} ${canvasMode === "delete" ? styles.iconBtnActive : ""}`}
					onClick={() => onModeChange("delete")}
					aria-label="Delete mode"
					data-testid="mode-delete"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
						<path d="M3 4h10"/>
						<path d="M5 4V3h6v1"/>
						<path d="M4 4l1 10h6l1-10"/>
						<path d="M7 7v4"/>
						<path d="M9 7v4"/>
					</svg>
				</button>
				<button
					className={styles.iconBtn}
					onClick={onUndo}
					disabled={!canUndo}
					aria-label="Undo"
					data-testid="undo-btn"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
						<path d="M4 6l-3 3 3 3"/>
						<path d="M1 9h9a4 4 0 0 1 0 8H8"/>
					</svg>
				</button>
				<button
					className={styles.iconBtn}
					onClick={onRedo}
					disabled={!canRedo}
					aria-label="Redo"
					data-testid="redo-btn"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
						<path d="M12 6l3 3-3 3"/>
						<path d="M15 9H6a4 4 0 0 0 0 8h2"/>
					</svg>
				</button>
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
