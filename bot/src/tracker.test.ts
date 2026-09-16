import { describe, expect, test } from 'bun:test';
import { observe, type Snapshot } from './tracker';
import type { Player, Status } from './game';

const status = (over: Partial<Status> = {}): Status => ({
	serverName: 'Test',
	map: 'Bakurani',
	matchSeconds: 600,
	playerCount: 2,
	maxPlayers: 98,
	scores: [
		{ name: 'Rebels', colorHex: '#D86060', score: 40 },
		{ name: 'Army', colorHex: '#5B95D8', score: 25 }
	],
	...over
});

const player = (steamId: string, kills: number, deaths = 0, name = `P${steamId}`): Player => ({
	steamId,
	name,
	faction: 'Rebels',
	kills,
	deaths,
	cash: 0
});

describe('observe', () => {
	test('first observation only sets the baseline', () => {
		const { snapshot, result } = observe(null, status(), [player('1', 5, 2)]);
		expect(result.deltas).toEqual([]);
		expect(result.matchEnd).toBeNull();
		expect(result.newMatch).toBe(false);
		expect(snapshot.players.get('1')).toEqual({ name: 'P1', kills: 5, deaths: 2 });
	});

	test('kills and deaths growing produce a delta', () => {
		const first = observe(null, status(), [player('1', 5, 2)]).snapshot;
		const { result } = observe(first, status({ matchSeconds: 610 }), [player('1', 8, 3)]);
		expect(result.deltas).toEqual([{ steamId: '1', name: 'P1', kills: 3, deaths: 1 }]);
		expect(result.matchEnd).toBeNull();
	});

	test('unchanged players produce no delta', () => {
		const first = observe(null, status(), [player('1', 5, 2)]).snapshot;
		const { result } = observe(first, status({ matchSeconds: 610 }), [player('1', 5, 2)]);
		expect(result.deltas).toEqual([]);
	});

	test('a player seen for the first time mid-match only sets a baseline', () => {
		const first = observe(null, status(), [player('1', 5)]).snapshot;
		const { result } = observe(first, status({ matchSeconds: 610 }), [
			player('1', 5),
			player('2', 4)
		]);
		expect(result.deltas).toEqual([]);
	});

	test('a map change ends the match with the previous leader as winner', () => {
		const first = observe(null, status(), [player('1', 5)]).snapshot;
		const { result } = observe(
			first,
			status({
				map: 'Kavkazi',
				matchSeconds: 5,
				scores: [{ name: 'Rebels', colorHex: '#D86060', score: 0 }]
			}),
			[player('1', 0)]
		);
		expect(result.newMatch).toBe(true);
		expect(result.matchEnd).toEqual({
			map: 'Bakurani',
			winner: 'Rebels',
			scores: [
				{ name: 'Rebels', colorHex: '#D86060', score: 40 },
				{ name: 'Army', colorHex: '#5B95D8', score: 25 }
			],
			durationSeconds: 600
		});
	});

	test('the clock going backwards ends the match', () => {
		const first = observe(null, status({ matchSeconds: 900 }), [player('1', 5)]).snapshot;
		const { result } = observe(first, status({ matchSeconds: 3 }), [player('1', 0)]);
		expect(result.newMatch).toBe(true);
		expect(result.matchEnd?.durationSeconds).toBe(900);
	});

	test('a tie has no winner', () => {
		const tied = status({
			scores: [
				{ name: 'A', colorHex: '', score: 10 },
				{ name: 'B', colorHex: '', score: 10 }
			]
		});
		const first = observe(null, tied, []).snapshot;
		const { result } = observe(first, status({ map: 'Other' }), []);
		expect(result.matchEnd?.winner).toBeNull();
	});

	test('kills reset on a new match count from zero', () => {
		const first = observe(null, status(), [player('1', 30, 10)]).snapshot;
		const { result } = observe(first, status({ map: 'Kavkazi', matchSeconds: 20 }), [
			player('1', 2, 1)
		]);
		expect(result.deltas).toEqual([{ steamId: '1', name: 'P1', kills: 2, deaths: 1 }]);
	});

	test('a lower count without a new match is treated as a reset', () => {
		const first = observe(null, status(), [player('1', 30, 10)]).snapshot;
		const { result } = observe(first, status({ matchSeconds: 610 }), [player('1', 1, 0)]);
		expect(result.deltas).toEqual([{ steamId: '1', name: 'P1', kills: 1, deaths: 0 }]);
	});

	test('the snapshot keeps the latest name', () => {
		const first = observe(null, status(), [player('1', 0, 0, 'Old')]).snapshot;
		const { snapshot } = observe(first, status(), [player('1', 0, 0, 'New')]);
		expect(snapshot.players.get('1')?.name).toBe('New');
		const typed: Snapshot = snapshot;
		expect(typed.map).toBe('Bakurani');
	});
});
