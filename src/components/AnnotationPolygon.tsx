import { useRef } from "react";
import type { Annotation, Point } from "../types/appState";

interface AnnotationPolygonProps {
	annotation: Annotation;
	classColor: string;
	isDrawing: boolean;
	isActiveClass: boolean;
	isSelected: boolean;
	isDeleteMode: boolean;
	onMoveStart: (annotationId: string) => void;
	onMove: (annotationId: string, delta: Point) => void;
	onMoveEnd: (annotationId: string, screenX: number, screenY: number) => void;
	onSelect: (annotationId: string) => void;
	onVertexMoveStart?: (annotationId: string) => void;
	onVertexMove?: (annotationId: string, vertexIndex: number, position: Point) => void;
	onVertexMoveEnd?: (annotationId: string) => void;
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
const VERTEX_RADIUS = 0.005;

export function AnnotationPolygon({
	annotation,
	classColor,
	isDrawing,
	isActiveClass,
	isSelected,
	isDeleteMode,
	onMoveStart,
	onMove,
	onMoveEnd,
	onSelect,
	onVertexMoveStart,
	onVertexMove,
	onVertexMoveEnd,
	svgRef,
}: AnnotationPolygonProps) {
	const holdTimer = useRef<ReturnType<typeof setTimeout>>(null);
	const isDragging = useRef(false);
	const lastPos = useRef<Point | null>(null);
	const clicked = useRef(false);

	// -- Polygon move via hold --

	const pointerIdRef = useRef<number | null>(null);

	const handlePolyDown = (e: React.PointerEvent) => {
		if (isDeleteMode) {
			e.stopPropagation();
			onSelect(annotation.id);
			return;
		}

		if (isDrawing || !isActiveClass) return;

		e.stopPropagation(); // Prevent lasso start on polygon click.

		const pos = pointerToSvg(e, svgRef.current);
		if (!pos) return;
		lastPos.current = pos;
		pointerIdRef.current = e.pointerId;
		clicked.current = true;

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
			if (isActiveClass) onSelect(annotation.id);
		}
		clicked.current = false;
	};

	// -- Vertex handle dragging --

	const draggingVertexRef = useRef<number | null>(null);

	const handleVertexDown = (e: React.PointerEvent, vertexIndex: number) => {
		e.stopPropagation();
		draggingVertexRef.current = vertexIndex;
		(e.target as Element).setPointerCapture(e.pointerId);
		onVertexMoveStart?.(annotation.id);
	};

	const handleVertexMove = (e: React.PointerEvent) => {
		if (draggingVertexRef.current === null) return;
		e.stopPropagation();
		const pos = pointerToSvg(e, svgRef.current);
		if (!pos) return;
		onVertexMove?.(annotation.id, draggingVertexRef.current, pos);
	};

	const handleVertexUp = (e: React.PointerEvent) => {
		if (draggingVertexRef.current === null) return;
		e.stopPropagation();
		draggingVertexRef.current = null;
		onVertexMoveEnd?.(annotation.id);
	};

	// Build polygon points string.
	const pointsStr = annotation.vertices
		.map((v) => `${v.x},${v.y}`)
		.join(" ");

	const filterId = `glow-${annotation.id}`;
	const showHandles = isSelected && !isDeleteMode && !isDrawing;

	return (
		<g
			style={{ pointerEvents: isDeleteMode ? "auto" : (isDrawing || !isActiveClass ? "none" : "auto") }}
			data-testid="annotation-polygon"
		>
			{/* Glow filter for selection aura */}
			{isSelected && (
				<defs>
					<filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
						<feGaussianBlur in="SourceGraphic" stdDeviation="0.012" result="blur" />
						<feComposite in="blur" in2="blur" operator="over" />
					</filter>
				</defs>
			)}
			{/* Selection aura — bright blurred glow behind the polygon */}
			{isSelected && (
				<polygon
					points={pointsStr}
					fill={`${classColor}80`}
					stroke="white"
					strokeWidth={0.01}
					filter={`url(#${filterId})`}
					data-testid="selection-indicator"
				/>
			)}
			<polygon
				data-annotation-id={annotation.id}
				points={pointsStr}
				fill={`${classColor}40`}
				stroke={isSelected ? "white" : classColor}
				strokeWidth={isSelected ? 0.004 : 0.003}
				onPointerDown={handlePolyDown}
				onPointerMove={handlePolyMove}
				onPointerUp={handlePolyUp}
				style={{ cursor: isDeleteMode ? "pointer" : (isDrawing || !isActiveClass ? "default" : "pointer") }}
			/>
			{/* Vertex handles for edge editing */}
			{showHandles && annotation.vertices.map((v, i) => (
				<circle
					key={i}
					cx={v.x}
					cy={v.y}
					r={VERTEX_RADIUS}
					fill="white"
					stroke={classColor}
					strokeWidth={0.0015}
					style={{ cursor: "grab" }}
					onPointerDown={(e) => handleVertexDown(e, i)}
					onPointerMove={handleVertexMove}
					onPointerUp={handleVertexUp}
				/>
			))}
		</g>
	);
}
