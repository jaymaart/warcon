// Faction colours in Discord text: embeds cannot colour words, so a faction's colorHex becomes the
// nearest coloured square, and a hex becomes the embed's side colour.
import type { FactionScore } from './game';

// Written as escapes so the source stays plain ASCII.
const SQUARES: { square: string; rgb: [number, number, number] }[] = [
	{ square: '\u{1F7E5}', rgb: [220, 40, 40] }, // red
	{ square: '\u{1F7E7}', rgb: [240, 140, 30] }, // orange
	{ square: '\u{1F7E8}', rgb: [240, 220, 50] }, // yellow
	{ square: '\u{1F7E9}', rgb: [60, 180, 75] }, // green
	{ square: '\u{1F7E6}', rgb: [60, 110, 220] }, // blue
	{ square: '\u{1F7EA}', rgb: [150, 70, 200] }, // purple
	{ square: '\u{1F7EB}', rgb: [140, 90, 50] }, // brown
	{ square: '\u2B1B', rgb: [30, 30, 30] }, // black
	{ square: '\u2B1C', rgb: [230, 230, 230] } // white
];

/** #RRGGBB (or RRGGBB) to an integer, or null when it is not a colour. */
export function hexToInt(hex: string): number | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	return m ? parseInt(m[1]!, 16) : null;
}

/** The coloured square closest to the hex, or '' when the hex is unusable. */
export function colorSquare(hex: string): string {
	const n = hexToInt(hex);
	if (n === null) return '';
	const r = n >> 16;
	const g = (n >> 8) & 255;
	const b = n & 255;
	let best = SQUARES[0]!;
	let bestDistance = Infinity;
	for (const s of SQUARES) {
		const d = (r - s.rgb[0]) ** 2 + (g - s.rgb[1]) ** 2 + (b - s.rgb[2]) ** 2;
		if (d < bestDistance) {
			bestDistance = d;
			best = s;
		}
	}
	return best.square;
}

/** The colour of the named faction from a status document's scores, or '' when unknown. */
export function factionColor(scores: FactionScore[], faction: string | null): string {
	if (!faction) return '';
	return scores.find((f) => f.name === faction)?.colorHex ?? '';
}
