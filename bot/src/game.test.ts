import { describe, expect, test } from 'bun:test';
import { toAudit, toPlayers, toStatus } from './game';

describe('toStatus', () => {
	test('reads the live status document', () => {
		const s = toStatus({
			serverName: 'WD #1',
			map: 'Bakurani',
			matchSeconds: 321,
			players: { current: 12, max: 98 },
			factionScores: [
				{ name: 'Rebels', colorHex: '#ff0000', score: 41 },
				{ name: 'Army', colorHex: '#0000ff', score: 12 }
			]
		});
		expect(s).toEqual({
			serverName: 'WD #1',
			map: 'Bakurani',
			matchSeconds: 321,
			playerCount: 12,
			maxPlayers: 98,
			scores: [
				{ name: 'Rebels', score: 41 },
				{ name: 'Army', score: 12 }
			]
		});
	});

	test('tolerates missing fields', () => {
		expect(toStatus({})).toEqual({
			serverName: '',
			map: '',
			matchSeconds: null,
			playerCount: 0,
			maxPlayers: 0,
			scores: []
		});
		expect(toStatus(null).scores).toEqual([]);
	});
});

describe('toPlayers', () => {
	test('reads players and stringifies steam ids', () => {
		expect(
			toPlayers({
				players: [
					{ steamId: 4242, name: 'Alpha', faction: 'Rebels', kills: 3, deaths: 1 },
					{ steamId: '2', name: 'Bravo', faction: null }
				]
			})
		).toEqual([
			{ steamId: '4242', name: 'Alpha', faction: 'Rebels', kills: 3, deaths: 1 },
			{ steamId: '2', name: 'Bravo', faction: null, kills: 0, deaths: 0 }
		]);
	});

	test('drops entries without a steam id', () => {
		expect(toPlayers({ players: [{ name: 'x' }, 5, null] })).toEqual([]);
		expect(toPlayers(undefined)).toEqual([]);
	});
});

describe('toAudit', () => {
	test('reads entries', () => {
		expect(
			toAudit({
				entries: [
					{
						timestampUtc: '2026-09-15T19:00:00Z',
						peer: '1.2.3.4:5',
						sessionId: 'a',
						event: 'COMMAND',
						detail: 'kick 1'
					},
					{ timestampUtc: '2026-09-15T19:00:01Z' }
				]
			})
		).toEqual([
			{
				timestampUtc: '2026-09-15T19:00:00Z',
				peer: '1.2.3.4:5',
				sessionId: 'a',
				event: 'COMMAND',
				detail: 'kick 1'
			},
			{ timestampUtc: '2026-09-15T19:00:01Z', peer: '', sessionId: '', event: '', detail: '' }
		]);
	});

	test('drops entries without a timestamp', () => {
		expect(toAudit({ entries: [{ event: 'COMMAND' }] })).toEqual([]);
	});
});
