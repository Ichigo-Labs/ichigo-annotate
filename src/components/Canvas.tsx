import { useRef } from "react";
import type { Annotation, AnnotationClass, Point } from "../types/appState";
import { distanceBetween, isPolygonClosed } from "../utils/areaUtils";
import { AnnotationPolygon } from "./AnnotationPolygon";
import styles from "./Canvas.module.css";

interface CanvasProps {
	imageDataUrl: string | null;
	annotations: Annotation[];
	classes: AnnotationClass[];
	activeLassoPoints: Point[] | null;
	activeClassId: string;
	onLassoStart: (point: Point) => void;
	onLassoPoint: (point: Point) => void;
	onLassoComplete: () => void;
	onLassoCancel: () => void;
	onAnnotationMoveStart: (annotationId: string) => void;
	onAnnotationMove: (annotationId: string, delta: Point) => void;
	onAnnotationMoveEnd: () => void;
	onVertexDragStart: (annotationId: string, vertexIndex: number) => void;
	onVertexDrag: (
		annotationId: string,
		vertexIndex: number,
		newPos: Point,
	) => void;
	onVertexDragEnd: () => void;
}

const MIN_POINT_DISTANCE = 0.008;
const CLOSE_THRESHOLD = 0.03;

export function Canvas({
	imageDataUrl,
	annotations,
	classes,
	activeLassoPoints,
	activeClassId,
	onLassoStart,
	onLassoPoint,
	onLassoComplete,
	onLassoCancel,
	onAnnotationMoveStart,
	onAnnotationMove,
	onAnnotationMoveEnd,
	onVertexDragStart,
	onVertexDrag,
	onVertexDragEnd,
}: CanvasProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const isDrawing = activeLassoPoints !== null;

	// Convert pointer event to SVG coordinates.
	const toSvgCoords = (e: React.PointerEvent): Point | null => {
		const svg = svgRef.current;
		if (!svg) return null;
		const rect = svg.getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width;
		const y = (e.clientY - rect.top) / rect.height;
		if (x < 0 || x > 1 || y < 0 || y > 1) return null;
		return { x, y };
	};

	// -- Lasso drawing --

	const handleSvgPointerDown = (e: React.PointerEvent) => {
		const point = toSvgCoords(e);
		if (!point) return;
		(e.target as Element).setPointerCapture(e.pointerId);
		onLassoStart(point);
	};

	const handleSvgPointerMove = (e: React.PointerEvent) => {
		if (!activeLassoPoints) return;
		const point = toSvgCoords(e);
		if (!point) return;

		// Only add if far enough from the last point.
		const last = activeLassoPoints[activeLassoPoints.length - 1]!;
		if (distanceBetween(point, last) >= MIN_POINT_DISTANCE) {
			onLassoPoint(point);
		}
	};

	const handleSvgPointerUp = () => {
		if (!activeLassoPoints) return;
		if (isPolygonClosed(activeLassoPoints, CLOSE_THRESHOLD)) {
			onLassoComplete();
		} else {
			onLassoCancel();
		}
	};

	// Look up color for a class.
	const classColor = (classId: string) =>
		classes.find((c) => c.id === classId)?.color ?? "#888";

	// Active class color for the lasso.
	const activeColor = classColor(activeClassId);

	// Build lasso polyline points.
	const lassoPointsStr = activeLassoPoints
		?.map((p) => `${p.x},${p.y}`)
		.join(" ");

	if (!imageDataUrl) {
		return (
			<div className={styles.container} data-testid="canvas">
				<div className={styles.placeholder}>
					Import images to get started
				</div>
			</div>
		);
	}

	return (
		<div className={styles.container} data-testid="canvas">
			<div className={styles.imageWrapper}>
				<img
					className={styles.image}
					src={imageDataUrl}
					alt="Annotation target"
					draggable={false}
				/>
				<svg
					ref={svgRef}
					className={styles.svgOverlay}
					viewBox="0 0 1 1"
					preserveAspectRatio="none"
					onPointerDown={handleSvgPointerDown}
					onPointerMove={handleSvgPointerMove}
					onPointerUp={handleSvgPointerUp}
					data-testid="canvas-svg"
				>
					{/* Existing annotations */}
					{annotations.map((ann) => (
						<AnnotationPolygon
							key={ann.id}
							annotation={ann}
							classColor={classColor(ann.classId)}
							isDrawing={isDrawing}
							onMoveStart={onAnnotationMoveStart}
							onMove={onAnnotationMove}
							onMoveEnd={onAnnotationMoveEnd}
							onVertexDragStart={onVertexDragStart}
							onVertexDrag={onVertexDrag}
							onVertexDragEnd={onVertexDragEnd}
							svgRef={svgRef}
						/>
					))}

					{/* Active lasso line */}
					{lassoPointsStr && (
						<polyline
							points={lassoPointsStr}
							fill="none"
							stroke={activeColor}
							strokeWidth={0.003}
							strokeDasharray="0.008 0.004"
							data-testid="lasso-line"
						/>
					)}
				</svg>
			</div>
		</div>
	);
}
