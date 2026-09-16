import { describe, expect, test } from 'bun:test';
import { loadConfig } from './env';

const base = {
	DISCORD_BOT_TOKEN: 't',
	DISCORD_PUBLIC_KEY: 'k',
	DISCORD_EVENTS_CHANNEL_ID: '123'
};

describe('loadConfig', () => {
	test('single server shorthand with defaults', () => {
		const c = loadConfig({ ...base, GAME_URL: 'http://1.2.3.4:7776/', GAME_PASSWORD: 'p' });
		expect(c.servers).toEqual([
			{ name: 'Server', url: 'http://1.2.3.4:7776', password: 'p', insecureTls: false }
		]);
		expect(c.leaderboardChannelId).toBe('123');
		expect(c.pollSeconds).toBe(10);
		expect(c.leaderboardLiveSeconds).toBe(60);
		expect(
			loadConfig({
				...base,
				GAME_URL: 'http://h:1',
				GAME_PASSWORD: 'p',
				LEADERBOARD_LIVE_SECONDS: '5'
			}).leaderboardLiveSeconds
		).toBe(15);
		expect(c.leaderboardSize).toBe(10);
		expect(c.dataDir).toBe('./data');
	});

	test('GAME_SERVERS json list', () => {
		const c = loadConfig({
			...base,
			GAME_TLS_INSECURE: 'true',
			GAME_SERVERS:
				'[{"name":"EU","url":"https://h:7776","password":"x"},{"url":"http://i:1","password":"y"}]'
		});
		expect(c.servers.map((s) => [s.name, s.url, s.insecureTls])).toEqual([
			['EU', 'https://h:7776', true],
			['Server 2', 'http://i:1', true]
		]);
	});

	test('missing or malformed values fail with the variable name', () => {
		expect(() => loadConfig({ ...base })).toThrow('GAME_SERVERS');
		expect(() => loadConfig({ ...base, GAME_URL: 'h:7776' })).toThrow('GAME_URL');
		expect(() => loadConfig({ ...base, GAME_URL: 'http://h:7776' })).toThrow('GAME_PASSWORD');
		expect(() => loadConfig({ ...base, GAME_SERVERS: '[' })).toThrow('GAME_SERVERS');
		expect(() => loadConfig({ ...base, GAME_SERVERS: '[{"url":"http://h"}]' })).toThrow(
			'GAME_SERVERS[0]'
		);
		expect(() => loadConfig({ DISCORD_BOT_TOKEN: 't', DISCORD_EVENTS_CHANNEL_ID: '1' })).toThrow(
			'DISCORD_PUBLIC_KEY'
		);
	});
});
