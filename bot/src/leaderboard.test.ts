import { describe, expect, test } from 'bun:test';
import {
	leaderboardComponents,
	leaderboardEmbed,
	parsePeriod,
	periodStart,
	richestEmbed,
	type Row
} from './leaderboard';

const now = new Date('2026-09-16T15:30:00Z'); // a Wednesday

describe('periodStart', () => {
	test('daily starts at midnight UTC', () => {
		expect(periodStart('daily', now)?.toISOString()).toBe('2026-09-16T00:00:00.000Z');
	});
	test('weekly starts on Monday', () => {
		expect(periodStart('weekly', now)?.toISOString()).toBe('2026-09-14T00:00:00.000Z');
		expect(periodStart('weekly', new Date('2026-09-13T10:00:00Z'))?.toISOString()).toBe(
			'2026-09-07T00:00:00.000Z'
		);
		expect(periodStart('weekly', new Date('2026-09-14T00:00:00Z'))?.toISOString()).toBe(
			'2026-09-14T00:00:00.000Z'
		);
	});
	test('monthly starts on the first', () => {
		expect(periodStart('monthly', now)?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
	});
	test('all time has no start', () => {
		expect(periodStart('all', now)).toBeNull();
	});
});

describe('parsePeriod', () => {
	test('reads the button id', () => {
		expect(parsePeriod('lb:daily')).toBe('daily');
		expect(parsePeriod('lb:all')).toBe('all');
		expect(parsePeriod('lb:yearly')).toBeNull();
		expect(parsePeriod('other')).toBeNull();
	});
});

describe('leaderboardEmbed', () => {
	const rows: Row[] = [
		{ steamId: '1', name: 'Alpha', kills: 30, deaths: 10 },
		{ steamId: '2', name: 'Bravo', kills: 12, deaths: 0 }
	];

	test('ranks players with kills, deaths and K/D', () => {
		const embed = leaderboardEmbed('weekly', rows, now, 900);
		expect(embed.title).toBe('Leaderboard · This week');
		expect(embed.description).toContain('**1.** Alpha');
		expect(embed.description).toContain('30 kills');
		expect(embed.description).toContain('10 deaths');
		expect(embed.description).toContain('K/D 3.00');
		expect(embed.description).toContain('**2.** Bravo');
		expect(embed.description).toContain('K/D 12.00');
		expect(embed.footer?.text).toBe('Updates every 15 min · Since 2026-09-14 UTC');
	});

	test('all time footer and empty state', () => {
		const embed = leaderboardEmbed('all', [], now, 3600);
		expect(embed.title).toBe('Leaderboard · All time');
		expect(embed.description).toBe('No kills recorded yet.');
		expect(embed.footer?.text).toBe('Updates every 1 h · All time');
	});

	test('a one-off reply has no refresh note', () => {
		expect(leaderboardEmbed('daily', [], now, null).footer?.text).toBe('Since 2026-09-16 UTC');
		expect(leaderboardEmbed('all', [], now, null).footer?.text).toBe('All time');
	});
});

describe('richestEmbed', () => {
	test('ranks balances with thousands separators', () => {
		const embed = richestEmbed(
			[
				{ steamId: '1', name: 'Alpha', cash: 1234567 },
				{ steamId: '2', name: 'Bravo', cash: 999.6 }
			],
			now
		);
		expect(embed.title).toBe('Richest players');
		expect(embed.description).toBe('**1.** Alpha · $1,234,567\n**2.** Bravo · $1,000');
		expect(richestEmbed([], now).description).toBe('No balances seen yet.');
	});
});

describe('leaderboardComponents', () => {
	test('one row of four buttons with the active period highlighted', () => {
		const rows = leaderboardComponents('monthly');
		expect(rows).toHaveLength(1);
		const buttons = rows[0]?.components ?? [];
		expect(buttons.map((b) => b.custom_id)).toEqual([
			'lb:daily',
			'lb:weekly',
			'lb:monthly',
			'lb:all'
		]);
		expect(buttons.map((b) => b.style)).toEqual([2, 2, 1, 2]);
	});
});
