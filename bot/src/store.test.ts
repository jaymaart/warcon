import { describe, expect, test } from 'bun:test';
import { Store } from './store';

describe('Store', () => {
	test('sums deltas per player since a moment, newest name wins', () => {
		const store = new Store(':memory:');
		const t1 = new Date('2026-09-10T10:00:00Z');
		const t2 = new Date('2026-09-16T10:00:00Z');
		store.touchPlayers(t1, [{ steamId: '1', name: 'Old' }]);
		store.recordDeltas(t1, 'A', [{ steamId: '1', name: 'Old', kills: 5, deaths: 1, cash: 0 }]);
		store.touchPlayers(t2, [
			{ steamId: '1', name: 'New' },
			{ steamId: '2', name: 'Two' }
		]);
		store.recordDeltas(t2, 'A', [
			{ steamId: '1', name: 'New', kills: 2, deaths: 0, cash: 0 },
			{ steamId: '2', name: 'Two', kills: 9, deaths: 3, cash: 0 }
		]);
		expect(store.leaderboard(null, 10)).toEqual([
			{ steamId: '2', name: 'Two', kills: 9, deaths: 3, discordId: null },
			{ steamId: '1', name: 'New', kills: 7, deaths: 1, discordId: null }
		]);
		expect(store.leaderboard(new Date('2026-09-15T00:00:00Z'), 10)).toEqual([
			{ steamId: '2', name: 'Two', kills: 9, deaths: 3, discordId: null },
			{ steamId: '1', name: 'New', kills: 2, deaths: 0, discordId: null }
		]);
		expect(store.leaderboard(null, 1)).toHaveLength(1);
		store.close();
	});

	test('players with only deaths are excluded and ties break by fewer deaths', () => {
		const store = new Store(':memory:');
		const t = new Date();
		store.recordDeltas(t, 'A', [
			{ steamId: '1', name: 'A', kills: 0, deaths: 4, cash: 0 },
			{ steamId: '2', name: 'B', kills: 3, deaths: 2, cash: 0 },
			{ steamId: '3', name: 'C', kills: 3, deaths: 1, cash: 0 }
		]);
		expect(store.leaderboard(null, 10).map((r) => r.steamId)).toEqual(['3', '2']);
		store.close();
	});

	test('cash earned sums per player since a moment', () => {
		const store = new Store(':memory:');
		const t1 = new Date('2026-09-10T10:00:00Z');
		const t2 = new Date('2026-09-16T10:00:00Z');
		store.touchPlayers(t2, [{ steamId: '1', name: 'A' }]);
		store.recordDeltas(t1, 'S', [{ steamId: '1', name: 'A', kills: 0, deaths: 0, cash: 500 }]);
		store.recordDeltas(t2, 'S', [
			{ steamId: '1', name: 'A', kills: 1, deaths: 0, cash: 250 },
			{ steamId: '2', name: 'B', kills: 0, deaths: 0, cash: 9000 },
			{ steamId: '3', name: 'C', kills: 4, deaths: 0, cash: 0 }
		]);
		expect(store.cashEarned(null, 10)).toEqual([
			{ steamId: '2', name: '2', cash: 9000, discordId: null },
			{ steamId: '1', name: 'A', cash: 750, discordId: null }
		]);
		expect(store.cashEarned(new Date('2026-09-15T00:00:00Z'), 10)).toEqual([
			{ steamId: '2', name: '2', cash: 9000, discordId: null },
			{ steamId: '1', name: 'A', cash: 250, discordId: null }
		]);
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

	test('links, name lookup and per-player stats with rank', () => {
		const store = new Store(':memory:');
		const t = new Date('2026-09-16T10:00:00Z');
		store.touchPlayers(t, [
			{ steamId: '1', name: 'Alpha' },
			{ steamId: '2', name: 'alpha' },
			{ steamId: '3', name: 'Charlie' }
		]);
		expect(
			store
				.playersNamed('ALPHA')
				.map((p) => p.steamId)
				.sort()
		).toEqual(['1', '2']);
		expect(store.playersNamed('nobody')).toEqual([]);
		expect(store.link('d1')).toBeNull();
		store.setLink('d1', '3');
		expect(store.link('d1')).toBe('3');
		store.setLink('d1', '1');
		expect(store.link('d1')).toBe('1');
		store.recordDeltas(t, 'S', [
			{ steamId: '1', name: 'Alpha', kills: 5, deaths: 2, cash: 300 },
			{ steamId: '3', name: 'Charlie', kills: 9, deaths: 0, cash: 0 },
			{ steamId: '2', name: 'alpha', kills: 0, deaths: 1, cash: 10 }
		]);
		expect(store.playerStats('1', [null])).toEqual([{ kills: 5, deaths: 2, cash: 300, rank: 2 }]);
		expect(store.playerStats('3', [null])).toEqual([{ kills: 9, deaths: 0, cash: 0, rank: 1 }]);
		expect(store.playerStats('2', [null])).toEqual([{ kills: 0, deaths: 1, cash: 10, rank: null }]);
		expect(store.playerStats('1', [new Date('2026-09-17T00:00:00Z'), null])).toEqual([
			{ kills: 0, deaths: 0, cash: 0, rank: null },
			{ kills: 5, deaths: 2, cash: 300, rank: 2 }
		]);
		expect(store.playerStats('nobody', [null])).toEqual([
			{ kills: 0, deaths: 0, cash: 0, rank: null }
		]);
		expect(store.playerStats('1', [])).toEqual([]);
		expect(store.leaderboard(null, 10)[1]).toEqual({
			steamId: '1',
			name: 'Alpha',
			kills: 5,
			deaths: 2,
			discordId: 'd1'
		});
		expect(store.clearLink('d1')).toBe(true);
		expect(store.clearLink('d1')).toBe(false);
		expect(store.link('d1')).toBeNull();
		store.close();
	});

	test('compact folds past days and every query still sees them', () => {
		const store = new Store(':memory:');
		const old1 = new Date('2026-09-10T10:00:00Z');
		const old2 = new Date('2026-09-10T20:00:00Z');
		const yesterday = new Date('2026-09-15T23:59:00Z');
		const today = new Date('2026-09-16T10:00:00Z');
		store.touchPlayers(today, [{ steamId: '1', name: 'A' }]);
		store.recordDeltas(old1, 'S', [{ steamId: '1', name: 'A', kills: 2, deaths: 1, cash: 100 }]);
		store.recordDeltas(old2, 'S', [{ steamId: '1', name: 'A', kills: 3, deaths: 0, cash: 50 }]);
		store.recordDeltas(yesterday, 'S', [{ steamId: '2', name: 'B', kills: 1, deaths: 4, cash: 0 }]);
		store.recordDeltas(today, 'S', [{ steamId: '1', name: 'A', kills: 4, deaths: 2, cash: 10 }]);
		const before = store.leaderboard(null, 10);
		expect(store.compact(today)).toBe(3);
		expect(store.compact(today)).toBe(0);
		expect(store.leaderboard(null, 10)).toEqual(before);
		expect(store.leaderboard(null, 10)[0]).toEqual({
			steamId: '1',
			name: 'A',
			kills: 9,
			deaths: 3,
			discordId: null
		});
		expect(store.leaderboard(new Date('2026-09-16T00:00:00Z'), 10)).toEqual([
			{ steamId: '1', name: 'A', kills: 4, deaths: 2, discordId: null }
		]);
		expect(store.leaderboard(new Date('2026-09-15T00:00:00Z'), 10).map((r) => r.steamId)).toEqual([
			'1',
			'2'
		]);
		expect(store.cashEarned(null, 10)).toEqual([
			{ steamId: '1', name: 'A', cash: 160, discordId: null }
		]);
		expect(store.playerStats('1', [new Date('2026-09-16T00:00:00Z'), null])).toEqual([
			{ kills: 4, deaths: 2, cash: 10, rank: 1 },
			{ kills: 9, deaths: 3, cash: 160, rank: 1 }
		]);
		// a second day's rows fold into the same player row without double counting
		store.recordDeltas(new Date('2026-09-16T12:00:00Z'), 'S', [
			{ steamId: '1', name: 'A', kills: 1, deaths: 0, cash: 0 }
		]);
		expect(store.compact(new Date('2026-09-17T01:00:00Z'))).toBe(2);
		expect(store.leaderboard(null, 10)[0]?.kills).toBe(10);
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
