import { describe, expect, test } from 'bun:test';
import type { Status } from './game';
import { clock, statusEmbed } from './status';

const now = new Date('2026-09-16T15:30:00Z');
const status: Status = {
	serverName: 'WD #1',
	map: 'Bakurani',
	experiences: [],
	lighting: '',
	matchSeconds: 3900,
	playerCount: 12,
	maxPlayers: 98,
	scoreCap: 100,
	scores: [
		{ name: 'Rebels', colorHex: '#D86060', score: 40 },
		{ name: 'Army', colorHex: '#5B95D8', score: 25 }
	]
};

describe('statusEmbed', () => {
	test('shows players, map, coloured scores and the leader colour', () => {
		const e = statusEmbed({ name: 'EU', status, error: '', serverId: 'd4dd049b' }, now, 60);
		expect(e.title).toBe('WD #1');
		expect(e.description).toBe('**12 / 98** players on **Bakurani**');
		expect(e.color).toBe(0xd86060);
		expect(e.fields?.[0]).toEqual({ name: 'Server ID', value: '`d4dd049b`', inline: false });
		expect(e.fields?.[1]?.value).toBe('\u{1F7E5} Rebels **40**\n\u{1F7E6} Army **25**');
		expect(e.fields?.[2]?.value).toBe('1 h 5 min');
		expect(e.fields?.[3]?.value).toBe('100');
		expect(e.footer?.text).toBe('Updates every 1 min');
	});

	test('a tie is grey and no cap reads none', () => {
		const tied = {
			...status,
			scoreCap: null,
			scores: status.scores.map((f) => ({ ...f, score: 5 }))
		};
		const e = statusEmbed({ name: 'EU', status: tied, error: '', serverId: '' }, now, 90);
		expect(e.color).toBe(0x99aab5);
		expect(e.fields?.[0]?.name).toBe('Scores');
		expect(e.fields?.[2]?.value).toBe('none');
		expect(e.footer?.text).toBe('Updates every 90 s');
	});

	test('offline shows the error in red', () => {
		const e = statusEmbed(
			{ name: 'EU', status: null, error: 'Could not reach x', serverId: '' },
			now,
			60
		);
		expect(e.title).toBe('EU');
		expect(e.description).toBe('**Offline** · Could not reach x');
		expect(e.color).toBe(0xed4245);
	});
});

describe('clock', () => {
	test('formats minutes and hours', () => {
		expect(clock(59)).toBe('0 min');
		expect(clock(600)).toBe('10 min');
		expect(clock(7200)).toBe('2 h 0 min');
		expect(clock(null)).toBe('unknown');
	});
});
