import { useRef } from "react";
import type { Annotation, Point } from "../types/appState";

interface AnnotationPolygonProps {
	annotation: Annotation;
	classColor: string;
	isDrawing: boolean;
	onMoveStart: (annotationId: string) => void;
	onMove: (annotationId: string, delta: Point) => void;
	onMoveEnd: () => void;
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
	onMoveStart,
	onMove,
	onMoveEnd,
	svgRef,
}: AnnotationPolygonProps) {
	const holdTimer = useRef<ReturnType<typeof setTimeout>>(null);
	const isDragging = useRef(false);
	const lastPos = useRef<Point | null>(null);

	// -- Polygon move via hold --

	const handlePolyDown = (e: React.PointerEvent) => {
		if (isDrawing) return;
		e.stopPropagation();
		const pos = pointerToSvg(e, svgRef.current);
		if (!pos) return;
		lastPos.current = pos;

		holdTimer.current = setTimeout(() => {
			isDragging.current = true;
			onMoveStart(annotation.id);
			(e.target as Element).setPointerCapture(e.pointerId);
		}, HOLD_DELAY);
	};

	const handlePolyMove = (e: React.PointerEvent) => {
		if (!isDragging.current) return;
		const pos = pointerToSvg(e, svgRef.current);
		if (!pos || !lastPos.current) return;
		const delta = {
			x: pos.x - lastPos.current.x,
			y: pos.y - lastPos.current.y,
		};
		lastPos.current = pos;
		onMove(annotation.id, delta);
	};

	const handlePolyUp = () => {
		if (holdTimer.current) clearTimeout(holdTimer.current);
		if (isDragging.current) {
			isDragging.current = false;
			onMoveEnd();
		}
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
			<polygon
				points={pointsStr}
				fill={`${classColor}40`}
				stroke={classColor}
				strokeWidth={0.003}
				onPointerDown={handlePolyDown}
				onPointerMove={handlePolyMove}
				onPointerUp={handlePolyUp}
				style={{ cursor: isDrawing ? "default" : "move" }}
			/>
		</g>
	);
}
