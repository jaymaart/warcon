import { describe, expect, test } from 'bun:test';
import { Store } from './store';

describe('Store', () => {
	test('sums deltas per player since a moment, newest name wins', () => {
		const store = new Store(':memory:');
		const t1 = new Date('2026-09-10T10:00:00Z');
		const t2 = new Date('2026-09-16T10:00:00Z');
		store.touchPlayers(t1, [{ steamId: '1', name: 'Old' }]);
		store.recordDeltas(t1, 'A', [{ steamId: '1', name: 'Old', kills: 5, deaths: 1 }]);
		store.touchPlayers(t2, [
			{ steamId: '1', name: 'New' },
			{ steamId: '2', name: 'Two' }
		]);
		store.recordDeltas(t2, 'A', [
			{ steamId: '1', name: 'New', kills: 2, deaths: 0 },
			{ steamId: '2', name: 'Two', kills: 9, deaths: 3 }
		]);
		expect(store.leaderboard(null, 10)).toEqual([
			{ steamId: '2', name: 'Two', kills: 9, deaths: 3 },
			{ steamId: '1', name: 'New', kills: 7, deaths: 1 }
		]);
		expect(store.leaderboard(new Date('2026-09-15T00:00:00Z'), 10)).toEqual([
			{ steamId: '2', name: 'Two', kills: 9, deaths: 3 },
			{ steamId: '1', name: 'New', kills: 2, deaths: 0 }
		]);
		expect(store.leaderboard(null, 1)).toHaveLength(1);
		store.close();
	});

	test('players with only deaths are excluded and ties break by fewer deaths', () => {
		const store = new Store(':memory:');
		const t = new Date();
		store.recordDeltas(t, 'A', [
			{ steamId: '1', name: 'A', kills: 0, deaths: 4 },
			{ steamId: '2', name: 'B', kills: 3, deaths: 2 },
			{ steamId: '3', name: 'C', kills: 3, deaths: 1 }
		]);
		expect(store.leaderboard(null, 10).map((r) => r.steamId)).toEqual(['3', '2']);
		store.close();
	});

	test('richest players rank by the latest balance', () => {
		const store = new Store(':memory:');
		const t = new Date();
		store.touchPlayers(t, [
			{ steamId: '1', name: 'A', cash: 500 },
			{ steamId: '2', name: 'B', cash: 9000 },
			{ steamId: '3', name: 'C', cash: 0 }
		]);
		store.touchPlayers(t, [{ steamId: '1', name: 'A', cash: 12000 }]);
		store.touchPlayers(t, [{ steamId: '2', name: 'B2' }]); // no cash given: balance kept
		expect(store.richest(10)).toEqual([
			{ steamId: '1', name: 'A', cash: 12000 },
			{ steamId: '2', name: 'B2', cash: 9000 }
		]);
		expect(store.richest(1)).toHaveLength(1);
		store.close();
	});

	test('uptime is the share of reachable polls since a day', () => {
		const store = new Store(':memory:');
		expect(store.uptime('2026-08-17')).toBeNull();
		const old = new Date('2026-08-01T00:00:00Z');
		const recent = new Date('2026-09-10T12:00:00Z');
		store.recordPoll(old, 'A', false);
		store.recordPoll(recent, 'A', true);
		store.recordPoll(recent, 'A', true);
		store.recordPoll(recent, 'A', false);
		store.recordPoll(recent, 'B', true);
		expect(store.uptime('2026-08-17')).toBe(0.75);
		expect(store.uptime('2026-08-01')).toBe(0.6);
		store.close();
	});

	test('player names resolve for moderation events', () => {
		const store = new Store(':memory:');
		store.touchPlayers(new Date(), [{ steamId: '7', name: 'Seven', faction: 'Army' }]);
		expect(store.player('7')).toEqual({ name: 'Seven', faction: 'Army' });
		store.touchPlayers(new Date(), [{ steamId: '7', name: 'Seven' }]);
		expect(store.player('7')).toEqual({ name: 'Seven', faction: 'Army' });
		expect(store.player('8')).toBeNull();
		store.close();
	});

	test('state is a string key-value map', () => {
		const store = new Store(':memory:');
		expect(store.getState('k')).toBeNull();
		store.setState('k', 'v');
		expect(store.getState('k')).toBe('v');
		store.setState('k', 'w');
		expect(store.getState('k')).toBe('w');
		store.close();
	});
});
