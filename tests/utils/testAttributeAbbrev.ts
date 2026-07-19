import { describe, expect, it } from "vitest";
import {
	abbreviateAttribute,
	computeAttributeAbbreviations,
} from "../../src/utils/attributeAbbrev";

describe("abbreviateAttribute", () => {
	it("uses the uppercased first letter of a single word", () => {
		expect(abbreviateAttribute("italic")).toBe("I");
	});

	it("uses word initials for hyphenated names", () => {
		expect(abbreviateAttribute("has-border")).toBe("HB");
	});

	it("splits on underscores and spaces", () => {
		expect(abbreviateAttribute("has_border")).toBe("HB");
		expect(abbreviateAttribute("has border")).toBe("HB");
	});

	it("widens each word prefix at higher lengths", () => {
		expect(abbreviateAttribute("has-border", 2)).toBe("HaBo");
	});

	it("returns an empty string for blank names", () => {
		expect(abbreviateAttribute("")).toBe("");
	});
});

describe("computeAttributeAbbreviations", () => {
	it("keeps single letters when initials already differ", () => {
		const map = computeAttributeAbbreviations(["italic", "bold", "handwritten"]);
		expect(map.get("italic")).toBe("I");
		expect(map.get("bold")).toBe("B");
		expect(map.get("handwritten")).toBe("H");
	});

	it("distinguishes attributes sharing a first letter via word initials", () => {
		const map = computeAttributeAbbreviations(["handwritten", "has-border"]);
		expect(map.get("handwritten")).toBe("H");
		expect(map.get("has-border")).toBe("HB");
	});

	it("widens colliding single-word attributes until unique", () => {
		const map = computeAttributeAbbreviations(["hidden", "handwritten"]);
		expect(map.get("hidden")).toBe("Hi");
		expect(map.get("handwritten")).toBe("Ha");
	});

	it("keeps widening while prefixes still collide", () => {
		const map = computeAttributeAbbreviations(["handwritten", "handmade"]);
		expect(map.get("handwritten")).toBe("Handw");
		expect(map.get("handmade")).toBe("Handm");
	});

	it("stops widening a name that runs out of letters", () => {
		const map = computeAttributeAbbreviations(["hi", "hidden"]);
		expect(map.get("hi")).toBe("Hi");
		expect(map.get("hidden")).toBe("Hid");
	});

	it("produces unique abbreviations for a mixed vocabulary", () => {
		const vocab = ["italic", "bold", "handwritten", "has-border", "hidden"];
		const map = computeAttributeAbbreviations(vocab);
		const values = [...map.values()];
		expect(new Set(values).size).toBe(vocab.length);
	});
});
