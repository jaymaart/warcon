import { describe, expect, test } from 'bun:test';
import { colorSquare, factionColor, hexToInt } from './colors';

const RED = '\u{1F7E5}';
const GREEN = '\u{1F7E9}';
const BLUE = '\u{1F7E6}';

describe('colorSquare', () => {
	test('maps the mock factions to red, blue and green', () => {
		expect(colorSquare('#D86060')).toBe(RED);
		expect(colorSquare('#5B95D8')).toBe(BLUE);
		expect(colorSquare('#7BC462')).toBe(GREEN);
	});

	test('accepts a bare hex and rejects junk', () => {
		expect(colorSquare('ff0000')).toBe(RED);
		expect(colorSquare('')).toBe('');
		expect(colorSquare('#12')).toBe('');
		expect(colorSquare('blue')).toBe('');
	});
});

describe('hexToInt', () => {
	test('parses and rejects', () => {
		expect(hexToInt('#3ba55d')).toBe(0x3ba55d);
		expect(hexToInt('3BA55D')).toBe(0x3ba55d);
		expect(hexToInt('nope')).toBeNull();
	});
});

describe('factionColor', () => {
	const scores = [
		{ name: 'Rebels', colorHex: '#D86060', score: 1 },
		{ name: 'Army', colorHex: '#5B95D8', score: 2 }
	];
	test('finds the faction by name', () => {
		expect(factionColor(scores, 'Army')).toBe('#5B95D8');
		expect(factionColor(scores, 'Nobody')).toBe('');
		expect(factionColor(scores, null)).toBe('');
	});
});
