import { describe, expect, test } from 'bun:test';
import {
	leaderboardComponents,
	leaderboardEmbed,
	parseBoard,
	cashEmbed,
	periodStart,
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

describe('parseBoard', () => {
	test('reads the button id', () => {
		expect(parseBoard('lb:daily')).toEqual({ board: 'kills', period: 'daily' });
		expect(parseBoard('cash:all')).toEqual({ board: 'cash', period: 'all' });
		expect(parseBoard('lb:yearly')).toBeNull();
		expect(parseBoard('gold:daily')).toBeNull();
		expect(parseBoard('other')).toBeNull();
	});
});

describe('leaderboardEmbed', () => {
	const rows: Row[] = [
		{ steamId: '1', name: 'Alpha', kills: 30, deaths: 10, discordId: '42' },
		{ steamId: '2', name: 'Bravo', kills: 12, deaths: 0, discordId: null }
	];

	test('ranks players with kills, deaths and K/D', () => {
		const embed = leaderboardEmbed('weekly', rows, now, 900);
		expect(embed.title).toBe('Leaderboard · This week');
		expect(embed.description).toContain('**1.** Alpha (<@42>)');
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

describe('cashEmbed', () => {
	test('ranks earnings with thousands separators and the period footer', () => {
		const embed = cashEmbed(
			'monthly',
			[
				{ steamId: '1', name: 'Alpha', cash: 1234567, discordId: null },
				{ steamId: '2', name: 'Bravo', cash: 999.6, discordId: '7' }
			],
			now,
			900
		);
		expect(embed.title).toBe('Cash earned · This month');
		expect(embed.description).toBe('**1.** Alpha · $1,234,567\n**2.** Bravo (<@7>) · $1,000');
		expect(embed.footer?.text).toBe('Updates every 15 min · Since 2026-09-01 UTC');
		expect(cashEmbed('all', [], now, null).description).toBe('No cash earned yet.');
		expect(cashEmbed('all', [], now, null).footer?.text).toBe('All time');
	});
});

describe('leaderboardComponents', () => {
	test('one row of four buttons with the active period highlighted', () => {
		const rows = leaderboardComponents('kills', 'monthly');
		expect(rows).toHaveLength(1);
		const buttons = rows[0]?.components ?? [];
		expect(buttons.map((b) => b.custom_id)).toEqual([
			'lb:daily',
			'lb:weekly',
			'lb:monthly',
			'lb:all'
		]);
		expect(buttons.map((b) => b.style)).toEqual([2, 2, 1, 2]);
		expect(leaderboardComponents('cash', 'all')[0]?.components.map((b) => b.custom_id)).toEqual([
			'cash:daily',
			'cash:weekly',
			'cash:monthly',
			'cash:all'
		]);
	});
});
