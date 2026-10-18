import type { Annotation, AnnotationClass } from "../types/appState";

// Class of the manga-scene detector's subtext layout boxes, which sit inside
// a containing parent region (Dialog, Narration, ...).
export const SUBTEXT_CLASS_NAME = "Subtext-box";

// Order annotations for SVG painting, where later elements draw on top and
// receive taps first. Subtext boxes go last so they always win over their
// containing parent; the relative order within each group is kept.
export function sortByPaintOrder(
	annotations: Annotation[],
	classes: AnnotationClass[],
): Annotation[] {
	const subtextClassIds = new Set(
		classes
			.filter((c) => c.name.toLowerCase() === SUBTEXT_CLASS_NAME.toLowerCase())
			.map((c) => c.id),
	);
	if (subtextClassIds.size === 0) return annotations;

	return [
		...annotations.filter((a) => !subtextClassIds.has(a.classId)),
		...annotations.filter((a) => subtextClassIds.has(a.classId)),
	];
}
