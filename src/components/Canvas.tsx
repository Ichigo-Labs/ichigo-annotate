import { useMemo, useRef } from "react";
import { usePinchZoom } from "../hooks/usePinchZoom";
import type { Annotation, AnnotationClass, CanvasMode, CanvasView, Point } from "../types/appState";
import { distanceBetween, isNearlyComplete, isPolygonClosed } from "../utils/areaUtils";
import { computeAttributeAbbreviations } from "../utils/attributeAbbrev";
import { sortByPaintOrder } from "../utils/paintOrder";
import { POLYGON_CLOSE_RADIUS } from "../utils/polygonUtils";
import { viewTransform } from "../utils/viewUtils";
import { AnnotationPolygon } from "./AnnotationPolygon";
import styles from "./Canvas.module.css";

interface CanvasProps {
	imageUrl: string | null;
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
	view: CanvasView;
	trashRef: React.RefObject<HTMLDivElement | null>;
	onLassoStart: (point: Point) => void;
	onLassoPoint: (point: Point) => void;
	onLassoComplete: () => void;
	onLassoCancel: () => void;
	onBucketFill: (point: Point) => void;
	// Object mode: a tap outlines the mark under it, a loop outlines the marks inside.
	onObjectTap: (point: Point) => void;
	onObjectLoop: (points: Point[]) => void;
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
	onViewChange: (view: CanvasView) => void;
}

const MIN_POINT_DISTANCE = 0.008;
const CLOSE_THRESHOLD = 0.03;
const NEAR_COMPLETE_GAP_RATIO = 0.25;
// An object-mode press that moves less than this is a tap, not a loop.
const OBJECT_TAP_SLOP = 0.01;

export function Canvas({
	imageUrl,
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
	view,
	trashRef,
	onLassoStart,
	onLassoPoint,
	onLassoComplete,
	onLassoCancel,
	onBucketFill,
	onObjectTap,
	onObjectLoop,
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
	onViewChange,
}: CanvasProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const elevatedSvgRef = useRef<SVGSVGElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const pinch = usePinchZoom(view, wrapperRef, onViewChange);
	// A finger's tap acts on lift, so a second finger can still turn the
	// touch into a pinch before anything is placed or filled.
	const pendingTapRef = useRef<{ pointerId: number; point: Point } | null>(null);
	// The pointer drawing the lasso; another pointer's cancel doesn't end it.
	const lassoPointerRef = useRef<number | null>(null);
	// Where an object-mode press began: on lift it's a tap or a loop.
	const objectPressRef = useRef<{ pointerId: number; point: Point } | null>(null);
	const isDrawing = activeLassoPoints !== null;
	const isDeleteMode = canvasMode === "delete";
	const isPaintMode = canvasMode === "paint";
	const isTagMode = canvasMode === "tag";
	const isRectMode = canvasMode === "rect";
	const isPolygonMode = canvasMode === "polygon";
	const isObjectMode = canvasMode === "object";
	const isTapMode = isDeleteMode || isPaintMode || isTagMode;
	// Sizes and distance rules below are divided by the zoom so they keep
	// their on-screen size when zoomed in.
	const zoom = view.zoom;

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
		// Zoomed in, or as fallout of a pinch, a tap beside the image is a
		// near miss rather than a request to change images.
		if (zoom > 1 || pinch.wasPinched()) return;
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

	// -- Taps and lasso drawing --

	// A tap on the image clears the selection and, in the point-placing
	// modes, acts at the tapped spot.
	const handleTap = (point: Point) => {
		onSelectAnnotation(null);
		if (canvasMode === "bucket") onBucketFill(point);
		else if (isRectMode) onRectPoint(point);
		else if (isPolygonMode) onPolygonPoint(point);
	};

	const handleSvgPointerDown = (e: React.PointerEvent) => {
		const point = toSvgCoords(e);
		if (!point) return;

		// Object mode draws a loop from the press and decides on lift whether
		// it was a tap.
		if (isObjectMode) {
			(e.target as Element).setPointerCapture(e.pointerId);
			onSelectAnnotation(null);
			objectPressRef.current = { pointerId: e.pointerId, point };
			lassoPointerRef.current = e.pointerId;
			onLassoStart(point);
			return;
		}

		if (e.pointerType === "touch") {
			(e.target as Element).setPointerCapture(e.pointerId);
			pendingTapRef.current = { pointerId: e.pointerId, point };
		} else {
			handleTap(point);
		}

		// Lasso and delete modes also draw a lasso from the press.
		if (canvasMode === "lasso" || isDeleteMode) {
			(e.target as Element).setPointerCapture(e.pointerId);
			lassoPointerRef.current = e.pointerId;
			onLassoStart(point);
		}
	};

	const handleSvgPointerMove = (e: React.PointerEvent) => {
		if (!activeLassoPoints) return;
		const point = toSvgCoords(e);
		if (!point) return;

		// Only add if far enough from the last point.
		const last = activeLassoPoints[activeLassoPoints.length - 1]!;
		if (distanceBetween(point, last) >= MIN_POINT_DISTANCE / zoom) {
			onLassoPoint(point);
		}
	};

	const handleSvgPointerUp = (e: React.PointerEvent) => {
		const press = objectPressRef.current;
		if (press?.pointerId === e.pointerId) {
			objectPressRef.current = null;
			const points = activeLassoPoints ?? [press.point];
			onLassoCancel();
			const moved = points.some(
				(p) => distanceBetween(p, press.point) > OBJECT_TAP_SLOP / zoom,
			);
			if (moved && points.length >= 3) onObjectLoop(points);
			else onObjectTap(press.point);
			return;
		}

		const tap = pendingTapRef.current;
		if (tap?.pointerId === e.pointerId) {
			pendingTapRef.current = null;
			handleTap(tap.point);
		}

		if (!activeLassoPoints) return;
		if (
			isPolygonClosed(activeLassoPoints, CLOSE_THRESHOLD / zoom) ||
			isNearlyComplete(activeLassoPoints, NEAR_COMPLETE_GAP_RATIO)
		) {
			onLassoComplete();
		} else {
			onLassoCancel();
		}
	};

	// A pinch or the browser took the pointer over: drop what it started.
	const handleSvgPointerCancel = (e: React.PointerEvent) => {
		if (pendingTapRef.current?.pointerId === e.pointerId) pendingTapRef.current = null;
		if (objectPressRef.current?.pointerId === e.pointerId) objectPressRef.current = null;
		if (activeLassoPoints && lassoPointerRef.current === e.pointerId) onLassoCancel();
	};

	// Look up color for a class.
	const classColor = (classId: string) =>
		classes.find((c) => c.id === classId)?.color ?? "#888";

	// Active class color for the lasso.
	const activeColor = classColor(activeClassId);

	// Preview strokes, dashes and dots.
	const lineWidth = 0.003 / zoom;
	const dash = `${0.008 / zoom} ${0.004 / zoom}`;
	const dotRadius = 0.008 / zoom;

	// Zoom and pan go on each layer rather than the shared wrapper: a
	// transformed wrapper would trap the elevated layer below the palette.
	const layerStyle = zoom > 1
		? { transform: viewTransform(view), transformOrigin: "0 0" }
		: undefined;

	// Build lasso polyline points.
	const lassoPointsStr = activeLassoPoints
		?.map((p) => `${p.x},${p.y}`)
		.join(" ");

	if (!imageUrl) {
		return (
			<div className={styles.container} data-testid="canvas" onClick={handleContainerClick}>
				<div className={styles.placeholder}>
					Import images to get started
				</div>
			</div>
		);
	}

	return (
		<div
			className={styles.container}
			data-testid="canvas"
			onClick={handleContainerClick}
			{...pinch.handlers}
		>
			<div
				ref={wrapperRef}
				className={stretchImage ? styles.imageWrapperStretch : styles.imageWrapper}
			>
				<img
					className={stretchImage ? styles.imageStretch : styles.image}
					style={layerStyle}
					src={imageUrl}
					alt="Annotation target"
					draggable={false}
				/>
				<svg
					ref={svgRef}
					className={styles.svgOverlay}
					style={layerStyle}
					viewBox="0 0 1 1"
					preserveAspectRatio="none"
					onPointerDown={handleSvgPointerDown}
					onPointerMove={handleSvgPointerMove}
					onPointerUp={handleSvgPointerUp}
					onPointerCancel={handleSvgPointerCancel}
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
							zoom={zoom}
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
							strokeWidth={lineWidth}
							strokeDasharray={dash}
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
									strokeWidth={lineWidth}
									strokeDasharray={dash}
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
									strokeWidth={lineWidth}
									strokeDasharray={dash}
								/>
							)}
							{activeRectPoints.map((p, i) => (
								<circle
									key={i}
									cx={p.x}
									cy={p.y}
									r={dotRadius}
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
									strokeWidth={lineWidth}
									strokeDasharray={dash}
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
										strokeWidth={lineWidth}
										strokeDasharray={dash}
									/>
									{/* Close target: tapping inside it finishes the shape */}
									<circle
										cx={activePolygonPoints[0]!.x}
										cy={activePolygonPoints[0]!.y}
										r={POLYGON_CLOSE_RADIUS / zoom}
										fill={`${activeColor}40`}
										stroke={activeColor}
										strokeWidth={0.002 / zoom}
										data-testid="polygon-close-target"
									/>
								</>
							)}
							{activePolygonPoints.map((p, i) => (
								<circle
									key={i}
									cx={p.x}
									cy={p.y}
									r={dotRadius}
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
						style={layerStyle}
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
							zoom={zoom}
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
