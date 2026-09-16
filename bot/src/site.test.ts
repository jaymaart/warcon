import { describe, expect, test } from 'bun:test';
import type { Player, Status } from './game';
import { sitePayload } from './site';

const now = new Date('2026-09-16T15:30:00Z');
const status: Status = {
	serverName: 'Warfrogs EU',
	map: 'Bakurani',
	experiences: ['KOTH'],
	lighting: 'DayLateClear',
	matchSeconds: 600,
	scoreCap: 100,
	playerCount: 14,
	maxPlayers: 40,
	scores: [{ name: 'Rebels', colorHex: '#D86060', score: 40 }]
};
const player = (ping: number | null): Player => ({
	steamId: '1',
	name: 'A',
	faction: null,
	kills: 0,
	deaths: 0,
	cash: 0,
	ping
});

describe('sitePayload', () => {
	test('assembles the live document', () => {
		const p = sitePayload(
			{
				serverName: 'EU',
				serverId: 'd4dd',
				status,
				players: [player(30), player(50), player(null)],
				leaders: [
					{ steamId: '1', name: 'Alpha', kills: 30, deaths: 12 },
					{ steamId: '2', name: '', kills: 4, deaths: 0 }
				],
				uptime: 0.9942,
				discord: { members: 2148, online: 90 },
				error: ''
			},
			now
		);
		expect(p.online).toBe(true);
		expect(p.serverName).toBe('Warfrogs EU');
		expect(p.mode).toBe('KOTH · DayLateClear');
		expect(p.players).toEqual({ current: 14, max: 40 });
		expect(p.avgPing).toBe(40);
		expect(p.uptimePercent).toBe(99.4);
		expect(p.leaders).toEqual([
			{ rank: 1, name: 'Alpha', kills: 30, deaths: 12, kd: '2.5' },
			{ rank: 2, name: '2', kills: 4, deaths: 0, kd: '4.0' }
		]);
		expect(p.discord).toEqual({ members: 2148, online: 90 });
		expect(p.generatedAt).toBe('2026-09-16T15:30:00.000Z');
	});

	test('offline keeps the error and empties the live fields', () => {
		const p = sitePayload(
			{
				serverName: 'EU',
				serverId: '',
				status: null,
				players: [],
				leaders: [],
				uptime: null,
				discord: null,
				error: 'Could not reach x'
			},
			now
		);
		expect(p.online).toBe(false);
		expect(p.error).toBe('Could not reach x');
		expect(p.serverName).toBe('EU');
		expect(p.map).toBe('');
		expect(p.avgPing).toBeNull();
		expect(p.uptimePercent).toBeNull();
		expect(p.players).toEqual({ current: 0, max: 0 });
	});
});
