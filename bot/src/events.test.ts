import { describe, expect, test } from 'bun:test';
import { matchEndEmbed, moderationEmbed } from './events';

const RED = '\u{1F7E5}';
const BLUE = '\u{1F7E6}';

describe('matchEndEmbed', () => {
	const scores = [
		{ name: 'Rebels', colorHex: '#D86060', score: 40 },
		{ name: 'Army', colorHex: '#5B95D8', score: 25 }
	];

	test('tags factions with their colour and paints the winner', () => {
		const e = matchEndEmbed('WD #1', {
			map: 'Bakurani',
			winner: 'Rebels',
			scores,
			durationSeconds: 600
		});
		expect(e.title).toBe('Match over on Bakurani');
		expect(e.description).toBe(`${RED} Rebels **won** · ${RED} Rebels 40 – ${BLUE} Army 25`);
		expect(e.color).toBe(0xd86060);
		expect(e.footer?.text).toBe('WD #1 · 10 min');
	});

	test('a draw stays grey and unknown colours get no square', () => {
		const plain = scores.map((s) => ({ ...s, colorHex: '' }));
		const e = matchEndEmbed('WD #1', {
			map: 'X',
			winner: null,
			scores: plain,
			durationSeconds: null
		});
		expect(e.description).toBe('Draw · Rebels 40 – Army 25');
		expect(e.color).toBe(0x99aab5);
	});
});

describe('moderationEmbed', () => {
	const ev = {
		kind: 'kick' as const,
		steamId: '1',
		reason: 'Team killing',
		at: '2026-09-15T19:00:00Z'
	};

	test('tags the player with their faction colour', () => {
		const e = moderationEmbed('WD #1', ev, { name: 'Alpha', colorHex: '#5B95D8' });
		expect(e.title).toBe('Player kicked');
		expect(e.description).toBe(`${BLUE} **Alpha** (1)\nReason: Team killing`);
		expect(e.color).toBe(0xe67e22);
	});

	test('no faction colour and no name', () => {
		expect(moderationEmbed('WD #1', ev, { name: 'Alpha', colorHex: '' }).description).toBe(
			'**Alpha** (1)\nReason: Team killing'
		);
		expect(moderationEmbed('WD #1', { ...ev, reason: '' }, null).description).toBe('**1**');
	});
});
