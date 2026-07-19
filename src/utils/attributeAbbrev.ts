// Short badge labels for style attributes. Single first letters collide too
// easily ("handwritten" and "has-border" both read "H"), so abbreviations are
// built from word initials and widened only as far as needed to stay unique
// within the attribute vocabulary.

function words(name: string): string[] {
	return name.split(/[-_\s]+/).filter(Boolean);
}

// Abbreviation using the first `len` letters of each word, first letter
// uppercased: "has-border" at len 1 → "HB", at len 2 → "HaBo".
export function abbreviateAttribute(name: string, len = 1): string {
	return words(name)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1, len))
		.join("");
}

// Map every attribute in the vocabulary to an abbreviation that is unique
// across the vocabulary. Attributes whose initials already differ keep the
// shortest form; colliding ones widen together so related names stay visually
// consistent (e.g. "hidden"/"handwritten" → "Hi"/"Ha").
export function computeAttributeAbbreviations(
	vocabulary: string[],
): Map<string, string> {
	const unique = [...new Set(vocabulary)];
	const lens = new Map(unique.map((a) => [a, 1]));
	const maxLen = (a: string) =>
		Math.max(0, ...words(a).map((w) => w.length));

	// Widen colliding groups until all abbreviations are unique or the names
	// themselves are exhausted (identical after word-splitting).
	for (;;) {
		const groups = new Map<string, string[]>();
		for (const a of unique) {
			const abbrev = abbreviateAttribute(a, lens.get(a));
			groups.set(abbrev, [...(groups.get(abbrev) ?? []), a]);
		}
		let widened = false;
		for (const members of groups.values()) {
			if (members.length < 2) continue;
			for (const a of members) {
				const len = lens.get(a)!;
				if (len < maxLen(a)) {
					lens.set(a, len + 1);
					widened = true;
				}
			}
		}
		if (!widened) break;
	}

	return new Map(unique.map((a) => [a, abbreviateAttribute(a, lens.get(a))]));
}
