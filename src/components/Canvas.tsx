import { useMemo, useRef } from "react";
import type { Annotation, AnnotationClass, CanvasMode, Point } from "../types/appState";
import { distanceBetween, isNearlyComplete, isPolygonClosed } from "../utils/areaUtils";
import { computeAttributeAbbreviations } from "../utils/attributeAbbrev";
import { sortByPaintOrder } from "../utils/paintOrder";
import { POLYGON_CLOSE_RADIUS } from "../utils/polygonUtils";
import { AnnotationPolygon } from "./AnnotationPolygon";
import styles from "./Canvas.module.css";

interface CanvasProps {
	imageDataUrl: string | null;
	annotations: Annotation[];
	classes: AnnotationClass[];
	attributes: string[];
	activeLassoPoints: Point[] | null;
	activeRectPoints: Point[] | null;
	activePolygonPoints: Point[] | null;
	activeClassId: string;
	selectedAnnotationId: string | null;
	stretchImage: boolean;
	canvasMode: CanvasMode;
	trashRef: React.RefObject<HTMLDivElement | null>;
	onLassoStart: (point: Point) => void;
	onLassoPoint: (point: Point) => void;
	onLassoComplete: () => void;
	onLassoCancel: () => void;
	onBucketFill: (point: Point) => void;
	onRectPoint: (point: Point) => void;
	onPolygonPoint: (point: Point) => void;
	onAnnotationMoveStart: (annotationId: string) => void;
	onAnnotationMove: (annotationId: string, delta: Point) => void;
	onAnnotationMoveEnd: (annotationId: string, droppedOnTrash: boolean) => void;
	onSelectAnnotation: (annotationId: string | null) => void;
	onVertexMoveStart: (annotationId: string) => void;
	onVertexMove: (annotationId: string, vertexIndex: number, position: Point) => void;
	onVertexMoveEnd: (annotationId: string) => void;
	onNavigate: (direction: "forward" | "backward") => void;
}

const MIN_POINT_DISTANCE = 0.008;
const CLOSE_THRESHOLD = 0.03;
const NEAR_COMPLETE_GAP_RATIO = 0.25;

export function Canvas({
	imageDataUrl,
	annotations,
	classes,
	attributes,
	activeLassoPoints,
	activeRectPoints,
	activePolygonPoints,
	activeClassId,
	selectedAnnotationId,
	stretchImage,
	canvasMode,
	trashRef,
	onLassoStart,
	onLassoPoint,
	onLassoComplete,
	onLassoCancel,
	onBucketFill,
	onRectPoint,
	onPolygonPoint,
	onAnnotationMoveStart,
	onAnnotationMove,
	onAnnotationMoveEnd,
	onSelectAnnotation,
	onVertexMoveStart,
	onVertexMove,
	onVertexMoveEnd,
	onNavigate,
}: CanvasProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const elevatedSvgRef = useRef<SVGSVGElement>(null);
	const isDrawing = activeLassoPoints !== null;
	const isDeleteMode = canvasMode === "delete";
	const isPaintMode = canvasMode === "paint";
	const isTagMode = canvasMode === "tag";
	const isRectMode = canvasMode === "rect";
	const isPolygonMode = canvasMode === "polygon";
	const isTapMode = isDeleteMode || isPaintMode || isTagMode;

	const attributeAbbreviations = useMemo(
		() => computeAttributeAbbreviations(attributes),
		[attributes],
	);

	// SVG has no z-index: later elements draw on top and take taps first.
	const orderedAnnotations = useMemo(
		() => sortByPaintOrder(annotations, classes),
		[annotations, classes],
	);

	// The selected annotation is raised above the palette so its handles stay
	// reachable. Tap modes show no handles, so there it keeps its paint order
	// and can't shadow a Subtext-box tapped inside it.
	const elevatedAnnotation = isTapMode
		? undefined
		: orderedAnnotations.find((ann) => ann.id === selectedAnnotationId);

	const handleMoveStart = (annotationId: string) => {
		onLassoCancel();
		onAnnotationMoveStart(annotationId);
	};

	const handleMoveEnd = (annotationId: string, screenX: number, screenY: number) => {
		const onTrash = isOverTrash(screenX, screenY);
		onAnnotationMoveEnd(annotationId, onTrash);
	};

	const isOverTrash = (screenX: number, screenY: number): boolean => {
		const el = trashRef.current;
		if (!el) return false;
		const rect = el.getBoundingClientRect();
		return (
			screenX >= rect.left &&
			screenX <= rect.right &&
			screenY >= rect.top &&
			screenY <= rect.bottom
		);
	};

	// Navigate forward/backward when clicking on the black margins.
	const handleContainerClick = (e: React.MouseEvent) => {
		if (e.target !== e.currentTarget) return;
		// While a box or polygon is mid-draw, a tiny miss just outside the image
		// should not advance the file and lose the in-progress anchors.
		// Navigation stays enabled in these modes whenever no anchors have been
		// placed yet.
		if (isRectMode && activeRectPoints && activeRectPoints.length > 0) return;
		if (isPolygonMode && activePolygonPoints && activePolygonPoints.length > 0) return;

		const rect = e.currentTarget.getBoundingClientRect();
		const clickX = e.clientX - rect.left;
		if (clickX < rect.width / 2) {
			onNavigate("backward");
		} else {
			onNavigate("forward");
		}
	};

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

		if (canvasMode === "bucket") {
			onSelectAnnotation(null);
			onBucketFill(point);
			return;
		}

		if (isRectMode) {
			onSelectAnnotation(null);
			onRectPoint(point);
			return;
		}

		if (isPolygonMode) {
			onSelectAnnotation(null);
			onPolygonPoint(point);
			return;
		}

		// Paint/tag modes are tap-to-act on annotations only. Clicks on the
		// background should not start a lasso draw.
		if (isPaintMode || isTagMode) {
			onSelectAnnotation(null);
			return;
		}

		(e.target as Element).setPointerCapture(e.pointerId);
		onSelectAnnotation(null);
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
		if (
			isPolygonClosed(activeLassoPoints, CLOSE_THRESHOLD) ||
			isNearlyComplete(activeLassoPoints, NEAR_COMPLETE_GAP_RATIO)
		) {
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
			<div className={styles.container} data-testid="canvas" onClick={handleContainerClick}>
				<div className={styles.placeholder}>
					Import images to get started
				</div>
			</div>
		);
	}

	return (
		<div className={styles.container} data-testid="canvas" onClick={handleContainerClick}>
			<div className={stretchImage ? styles.imageWrapperStretch : styles.imageWrapper}>
				<img
					className={stretchImage ? styles.imageStretch : styles.image}
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
					{/* Annotations in paint order, minus the elevated one */}
					{orderedAnnotations.filter((ann) => ann !== elevatedAnnotation).map((ann) => (
						<AnnotationPolygon
							key={ann.id}
							annotation={ann}
							classColor={classColor(ann.classId)}
							attributeAbbreviations={attributeAbbreviations}
							isDrawing={isDrawing}
							isActiveClass={ann.classId === activeClassId}
							isDeleteMode={isDeleteMode}
							isPaintMode={isPaintMode}
							isTagMode={isTagMode}
							isRectMode={isRectMode}
							isPolygonMode={isPolygonMode}
							isSelected={ann.id === selectedAnnotationId}
							onMoveStart={handleMoveStart}
							onMove={onAnnotationMove}
							onMoveEnd={handleMoveEnd}
							onSelect={onSelectAnnotation}
							onVertexMoveStart={onVertexMoveStart}
							onVertexMove={onVertexMove}
							onVertexMoveEnd={onVertexMoveEnd}
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

					{/* Rect-in-progress preview */}
					{activeRectPoints && activeRectPoints.length > 0 && (
						<>
							{activeRectPoints.length > 1 && (
								<polyline
									points={activeRectPoints.map((p) => `${p.x},${p.y}`).join(" ")}
									fill="none"
									stroke={activeColor}
									strokeWidth={0.003}
									strokeDasharray="0.008 0.004"
									data-testid="rect-preview-lines"
								/>
							)}
							{activeRectPoints.length >= 3 && (
								<line
									x1={activeRectPoints[activeRectPoints.length - 1]!.x}
									y1={activeRectPoints[activeRectPoints.length - 1]!.y}
									x2={activeRectPoints[0]!.x}
									y2={activeRectPoints[0]!.y}
									stroke={activeColor}
									strokeWidth={0.003}
									strokeDasharray="0.008 0.004"
								/>
							)}
							{activeRectPoints.map((p, i) => (
								<circle
									key={i}
									cx={p.x}
									cy={p.y}
									r={0.008}
									fill={activeColor}
									data-testid="rect-preview-dot"
								/>
							))}
						</>
					)}

					{/* Polygon-in-progress preview */}
					{activePolygonPoints && activePolygonPoints.length > 0 && (
						<>
							{activePolygonPoints.length > 1 && (
								<polyline
									points={activePolygonPoints.map((p) => `${p.x},${p.y}`).join(" ")}
									fill="none"
									stroke={activeColor}
									strokeWidth={0.003}
									strokeDasharray="0.008 0.004"
									data-testid="polygon-preview-lines"
								/>
							)}
							{activePolygonPoints.length >= 3 && (
								<>
									{/* Faint closing edge: the shape is not committed yet */}
									<line
										x1={activePolygonPoints[activePolygonPoints.length - 1]!.x}
										y1={activePolygonPoints[activePolygonPoints.length - 1]!.y}
										x2={activePolygonPoints[0]!.x}
										y2={activePolygonPoints[0]!.y}
										stroke={activeColor}
										strokeOpacity={0.5}
										strokeWidth={0.003}
										strokeDasharray="0.008 0.004"
									/>
									{/* Close target: tapping inside it finishes the shape */}
									<circle
										cx={activePolygonPoints[0]!.x}
										cy={activePolygonPoints[0]!.y}
										r={POLYGON_CLOSE_RADIUS}
										fill={`${activeColor}40`}
										stroke={activeColor}
										strokeWidth={0.002}
										data-testid="polygon-close-target"
									/>
								</>
							)}
							{activePolygonPoints.map((p, i) => (
								<circle
									key={i}
									cx={p.x}
									cy={p.y}
									r={0.008}
									fill={activeColor}
									data-testid="polygon-preview-dot"
								/>
							))}
						</>
					)}
				</svg>
				{/* Elevated overlay for selected annotation (above CanvasPalette) */}
				{elevatedAnnotation && (
					<svg
						ref={elevatedSvgRef}
						className={styles.svgOverlayElevated}
						viewBox="0 0 1 1"
						preserveAspectRatio="none"
					>
						<AnnotationPolygon
							key={elevatedAnnotation.id}
							annotation={elevatedAnnotation}
							classColor={classColor(elevatedAnnotation.classId)}
							attributeAbbreviations={attributeAbbreviations}
							isDrawing={isDrawing}
							isActiveClass={elevatedAnnotation.classId === activeClassId}
							isDeleteMode={isDeleteMode}
							isPaintMode={isPaintMode}
							isTagMode={isTagMode}
							isRectMode={isRectMode}
							isPolygonMode={isPolygonMode}
							isSelected={true}
							onMoveStart={handleMoveStart}
							onMove={onAnnotationMove}
							onMoveEnd={handleMoveEnd}
							onSelect={onSelectAnnotation}
							onVertexMoveStart={onVertexMoveStart}
							onVertexMove={onVertexMove}
							onVertexMoveEnd={onVertexMoveEnd}
							svgRef={elevatedSvgRef}
						/>
					</svg>
				)}
			</div>
		</div>
	);
}
