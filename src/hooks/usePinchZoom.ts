import { useRef } from "react";
import type { CanvasView, Point } from "../types/appState";
import { pinchView } from "../utils/viewUtils";

interface Pinch {
	ids: [number, number];
	// Finger positions when the pinch started, relative to `box`.
	from: [Point, Point];
	view: CanvasView;
	box: DOMRect;
}

// Two-finger pinch to zoom and pan the canvas. Returns capture-phase pointer
// handlers for the canvas container. Once a second finger lands, the whole
// touch sequence belongs to the pinch: the finger already down gets a
// pointercancel (as a browser sends when it takes a touch over for panning),
// so whatever it started is dropped, and no later touch event in the
// sequence reaches the drawing tools. Pen and mouse are never affected.
export function usePinchZoom(
	view: CanvasView,
	boxRef: React.RefObject<HTMLElement | null>,
	onViewChange: (view: CanvasView) => void,
) {
	const touches = useRef(new Map<number, { client: Point; target: EventTarget }>());
	const pinch = useRef<Pinch | null>(null);
	// Set from a pinch's start until the next touch sequence or pen/mouse
	// press, so the click a lifting finger may cause isn't taken as a tap.
	const pinched = useRef(false);
	// True while dispatching our own pointercancel, which isn't a lift.
	const cancelling = useRef(false);

	const beginPinch = () => {
		const box = boxRef.current?.getBoundingClientRect();
		const [a, b] = [...touches.current.entries()];
		if (!box || !a || !b || box.width === 0 || box.height === 0) return;
		pinch.current = {
			ids: [a[0], b[0]],
			from: [toBox(a[1].client, box), toBox(b[1].client, box)],
			view,
			box,
		};
	};

	const cancelEarlierTouches = (newId: number) => {
		cancelling.current = true;
		try {
			for (const [id, { target }] of touches.current) {
				if (id === newId) continue;
				target.dispatchEvent(
					new PointerEvent("pointercancel", { bubbles: true, pointerId: id, pointerType: "touch" }),
				);
			}
		} finally {
			cancelling.current = false;
		}
	};

	const onPointerDownCapture = (e: React.PointerEvent) => {
		if (e.pointerType !== "touch") {
			pinched.current = false;
			return;
		}
		if (e.isPrimary) {
			// First finger of a new sequence: forget fingers that lifted
			// outside the canvas.
			touches.current.clear();
			pinch.current = null;
			pinched.current = false;
		}
		touches.current.set(e.pointerId, { client: { x: e.clientX, y: e.clientY }, target: e.target });
		if (!pinched.current && touches.current.size < 2) return;

		e.stopPropagation();
		if (!pinched.current) {
			pinched.current = true;
			cancelEarlierTouches(e.pointerId);
		}
		if (!pinch.current) beginPinch();
	};

	const onPointerMoveCapture = (e: React.PointerEvent) => {
		if (e.pointerType !== "touch") return;
		const touch = touches.current.get(e.pointerId);
		if (touch) touch.client = { x: e.clientX, y: e.clientY };
		if (!pinched.current) return;

		e.stopPropagation();
		const p = pinch.current;
		if (!p || !p.ids.includes(e.pointerId)) return;
		const a = touches.current.get(p.ids[0])?.client;
		const b = touches.current.get(p.ids[1])?.client;
		if (!a || !b) return;
		onViewChange(pinchView(p.view, p.from, [toBox(a, p.box), toBox(b, p.box)], p.box));
	};

	// Shared by pointerup and pointercancel.
	const onPointerEndCapture = (e: React.PointerEvent) => {
		if (e.pointerType !== "touch" || cancelling.current) return;
		touches.current.delete(e.pointerId);
		if (!pinched.current) return;

		e.stopPropagation();
		if (pinch.current?.ids.includes(e.pointerId)) {
			pinch.current = null;
			// Still two fingers down (one of three lifted): keep pinching.
			if (touches.current.size >= 2) beginPinch();
		}
	};

	return {
		handlers: {
			onPointerDownCapture,
			onPointerMoveCapture,
			onPointerUpCapture: onPointerEndCapture,
			onPointerCancelCapture: onPointerEndCapture,
		},
		wasPinched: () => pinched.current,
	};
}

function toBox(client: Point, box: DOMRect): Point {
	return { x: client.x - box.left, y: client.y - box.top };
}
