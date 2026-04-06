import { useRef } from "react";
import type { Annotation, Point } from "../types/appState";

interface AnnotationPolygonProps {
	annotation: Annotation;
	classColor: string;
	isDrawing: boolean;
	isActiveClass: boolean;
	isSelected: boolean;
	onMoveStart: (annotationId: string) => void;
	onMove: (annotationId: string, delta: Point) => void;
	onMoveEnd: (annotationId: string, screenX: number, screenY: number) => void;
	onSelect: (annotationId: string) => void;
	svgRef: React.RefObject<SVGSVGElement | null>;
}

// Convert a screen-space pointer event to SVG viewBox coordinates.
function pointerToSvg(
	e: React.PointerEvent,
	svgEl: SVGSVGElement | null,
): Point | null {
	if (!svgEl) return null;
	const rect = svgEl.getBoundingClientRect();
	return {
		x: (e.clientX - rect.left) / rect.width,
		y: (e.clientY - rect.top) / rect.height,
	};
}

const HOLD_DELAY = 200;

export function AnnotationPolygon({
	annotation,
	classColor,
	isDrawing,
	isActiveClass,
	isSelected,
	onMoveStart,
	onMove,
	onMoveEnd,
	onSelect,
	svgRef,
}: AnnotationPolygonProps) {
	const holdTimer = useRef<ReturnType<typeof setTimeout>>(null);
	const isDragging = useRef(false);
	const lastPos = useRef<Point | null>(null);
	const clicked = useRef(false);

	// -- Polygon move via hold --

	const pointerIdRef = useRef<number | null>(null);

	const handlePolyDown = (e: React.PointerEvent) => {
		if (isDrawing) return;

		e.stopPropagation(); // Prevent lasso start on polygon click.

		const pos = pointerToSvg(e, svgRef.current);
		if (!pos) return;
		lastPos.current = pos;
		pointerIdRef.current = e.pointerId;
		clicked.current = true;

		// Only allow drag for active class.
		if (isActiveClass) {
			holdTimer.current = setTimeout(() => {
				clicked.current = false;
				isDragging.current = true;
				onMoveStart(annotation.id);
				const el = svgRef.current?.querySelector(
					`[data-annotation-id="${annotation.id}"]`,
				);
				if (el && pointerIdRef.current !== null) {
					el.setPointerCapture(pointerIdRef.current);
				}
			}, HOLD_DELAY);
		}
	};

	const handlePolyMove = (e: React.PointerEvent) => {
		if (!isDragging.current) return;
		e.stopPropagation();
		const pos = pointerToSvg(e, svgRef.current);
		if (!pos || !lastPos.current) return;
		const delta = {
			x: pos.x - lastPos.current.x,
			y: pos.y - lastPos.current.y,
		};
		lastPos.current = pos;
		onMove(annotation.id, delta);
	};

	const handlePolyUp = (e: React.PointerEvent) => {
		if (holdTimer.current) clearTimeout(holdTimer.current);
		if (isDragging.current) {
			e.stopPropagation();
			isDragging.current = false;
			pointerIdRef.current = null;
			onMoveEnd(annotation.id, e.clientX, e.clientY);
		} else if (clicked.current) {
			e.stopPropagation();
			onSelect(annotation.id);
		}
		clicked.current = false;
	};

	// Build polygon points string.
	const pointsStr = annotation.vertices
		.map((v) => `${v.x},${v.y}`)
		.join(" ");

	return (
		<g
			style={{ pointerEvents: isDrawing ? "none" : "auto" }}
			data-testid="annotation-polygon"
		>
			{/* Selection indicator — white dashed outline */}
			{isSelected && (
				<polygon
					points={pointsStr}
					fill="none"
					stroke="white"
					strokeWidth={0.006}
					strokeDasharray="0.012 0.006"
					data-testid="selection-indicator"
				/>
			)}
			<polygon
				data-annotation-id={annotation.id}
				points={pointsStr}
				fill={`${classColor}40`}
				stroke={classColor}
				strokeWidth={0.003}
				onPointerDown={handlePolyDown}
				onPointerMove={handlePolyMove}
				onPointerUp={handlePolyUp}
				style={{ cursor: isDrawing ? "default" : "pointer" }}
			/>
		</g>
	);
}
