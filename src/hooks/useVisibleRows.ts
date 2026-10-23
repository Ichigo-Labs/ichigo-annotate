import { useLayoutEffect, useState } from "react";

// The rows of a scrolling list of fixed-height rows that are in view, plus
// `overscan` rows either side, as the range [first, last). A list of
// thousands of files renders just these, so it never holds every thumbnail.
export function useVisibleRows(
	listRef: React.RefObject<HTMLElement | null>,
	rowCount: number,
	rowHeight: number,
	overscan: number,
): { first: number; last: number } {
	const [view, setView] = useState({ top: 0, height: window.innerHeight });

	useLayoutEffect(() => {
		const list = listRef.current;
		if (!list) return;
		// Without layout (e.g. jsdom) the list has no height: assume the window.
		const update = () =>
			setView({
				top: list.scrollTop,
				height: list.clientHeight || window.innerHeight,
			});
		update();
		list.addEventListener("scroll", update, { passive: true });
		const resize =
			typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
		resize?.observe(list);
		return () => {
			list.removeEventListener("scroll", update);
			resize?.disconnect();
		};
	}, [listRef]);

	// Clamp to the end when the list shrinks below the scroll position (e.g.
	// after a search), before the browser's own scroll clamping catches up.
	const visible = Math.ceil(view.height / rowHeight);
	const start = Math.min(
		Math.floor(view.top / rowHeight),
		Math.max(0, rowCount - visible),
	);
	return {
		first: Math.max(0, start - overscan),
		last: Math.min(rowCount, start + visible + overscan),
	};
}
