import { describe, expect, test } from 'bun:test';
import { resolvePlayer, runCommand, type PeriodStats, type StatsSource } from './link';

const now = new Date('2026-09-16T15:30:00Z');

describe('resolvePlayer', () => {
	const byName = (name: string) =>
		name.toLowerCase() === 'alpha'
			? [{ steamId: '76561198000000001', name: 'Alpha' }]
			: name.toLowerCase() === 'twin'
				? [
						{ steamId: '1', name: 'Twin' },
						{ steamId: '2', name: 'twin' }
					]
				: [];

	test('accepts a SteamID64 and a profiles URL', () => {
		expect(resolvePlayer(' 76561198000000001 ', byName)).toEqual({ steamId: '76561198000000001' });
		expect(resolvePlayer('https://steamcommunity.com/profiles/76561198000000001/', byName)).toEqual(
			{
				steamId: '76561198000000001'
			}
		);
	});

	test('resolves a unique in-game name', () => {
		expect(resolvePlayer('Alpha', byName)).toEqual({ steamId: '76561198000000001' });
	});

	test('refuses vanity URLs, unknown names, ambiguous names and empty input', () => {
		expect(resolvePlayer('https://steamcommunity.com/id/alpha', byName)).toMatchObject({
			error: expect.stringContaining('Custom profile URLs')
		});
		expect(resolvePlayer('Nobody', byName)).toMatchObject({
			error: expect.stringContaining('No player named')
		});
		expect(resolvePlayer('twin', byName)).toMatchObject({
			error: expect.stringContaining('2 players share')
		});
		expect(resolvePlayer('   ', byName)).toMatchObject({
			error: expect.stringContaining('Give a SteamID64')
		});
	});
});

describe('runCommand', () => {
	const make = (): StatsSource & { links: Map<string, string> } => {
		const links = new Map<string, string>();
		const stats: PeriodStats = { kills: 10, deaths: 4, cash: 1500, rank: 2 };
		return {
			links,
			link: (id) => links.get(id) ?? null,
			setLink: (id, steamId) => void links.set(id, steamId),
			clearLink: (id) => links.delete(id),
			playerName: (steamId) => (steamId === '76561198000000001' ? 'Alpha' : null),
			byName: (name) => (name === 'Alpha' ? [{ steamId: '76561198000000001', name: 'Alpha' }] : []),
			stats: (_steamId, sinces) =>
				sinces.map((since) => (since === null ? { ...stats, kills: 40, rank: 1 } : stats))
		};
	};

	test('link, stats, unlink', () => {
		const s = make();
		const linked = runCommand('link', { player: 'Alpha' }, 'd1', s, now);
		expect(linked.ephemeral).toBe(true);
		expect(linked.embed.title).toBe('Linked');
		expect(linked.embed.description).toContain('**Alpha** (76561198000000001)');
		expect(s.links.get('d1')).toBe('76561198000000001');

		const { embed: stats, ephemeral } = runCommand('stats', {}, 'd1', s, now);
		expect(ephemeral).toBe(false);
		expect(stats.title).toBe('Stats · Alpha');
		expect(stats.fields?.map((f) => f.name)).toEqual([
			'Today',
			'This week',
			'This month',
			'All time'
		]);
		expect(stats.fields?.[0]?.value).toBe(
			'10 kills · 4 deaths · K/D 2.50\n$1,500 earned · #2 by kills'
		);
		expect(stats.fields?.[3]?.value).toBe(
			'40 kills · 4 deaths · K/D 10.00\n$1,500 earned · #1 by kills'
		);

		expect(runCommand('unlink', {}, 'd1', s, now).embed.title).toBe('Unlinked');
		expect(runCommand('unlink', {}, 'd1', s, now).embed.title).toBe('Nothing to unlink');
	});

	test('stats without a link and a bad link input', () => {
		const s = make();
		const missing = runCommand('stats', {}, 'd2', s, now);
		expect(missing.embed.title).toBe('Not linked yet');
		expect(missing.ephemeral).toBe(true);
		expect(runCommand('link', { player: 'Nobody' }, 'd2', s, now).embed.title).toBe('Not linked');
		expect(s.links.size).toBe(0);
		expect(runCommand('bogus', {}, 'd2', s, now).embed.title).toBe('Unknown command');
	});
});
