// Configuration from the environment. Fails fast with a message naming the missing variable.
import type { GameServer } from './game';

export interface Config {
	token: string;
	/** for registering slash commands; derived from the token when unset */
	applicationId: string | null;
	publicKey: string;
	eventsChannelId: string;
	leaderboardChannelId: string;
	/** invite code whose member counts the site shows */
	discordInvite: string;
	servers: GameServer[];
	dataDir: string;
	pollSeconds: number;
	leaderboardRefreshSeconds: number;
	leaderboardSize: number;
	port: number;
	apiBase: string;
}

type Env = Record<string, string | undefined>;

const required = (env: Env, key: string): string => {
	const v = (env[key] ?? '').trim();
	if (!v) throw new Error(`${key} is required.`);
	return v;
};

const positiveInt = (v: string | undefined, fallback: number): number => {
	const n = Number(v);
	return Number.isInteger(n) && n > 0 ? n : fallback;
};

const flag = (v: string | undefined): boolean => /^(1|true|yes|on)$/i.test(v ?? '');

export function loadConfig(env: Env = process.env): Config {
	const eventsChannelId = required(env, 'DISCORD_EVENTS_CHANNEL_ID');
	return {
		token: required(env, 'DISCORD_BOT_TOKEN'),
		applicationId: (env.DISCORD_APPLICATION_ID ?? '').trim() || null,
		publicKey: required(env, 'DISCORD_PUBLIC_KEY'),
		eventsChannelId,
		leaderboardChannelId: (env.DISCORD_LEADERBOARD_CHANNEL_ID ?? '').trim() || eventsChannelId,
		discordInvite: (env.DISCORD_INVITE ?? '').trim() || 'warfrogs',
		servers: parseServers(env),
		dataDir: (env.DATA_DIR ?? '').trim() || './data',
		pollSeconds: positiveInt(env.POLL_SECONDS, 10),
		leaderboardRefreshSeconds: positiveInt(env.LEADERBOARD_REFRESH_SECONDS, 900),
		leaderboardSize: Math.min(25, positiveInt(env.LEADERBOARD_SIZE, 10)),
		port: positiveInt(env.PORT, 3000),
		apiBase: (env.DISCORD_API_BASE ?? '').trim() || 'https://discord.com/api/v10'
	};
}

/**
 * GAME_SERVERS='[{"name":"EU #1","url":"http://1.2.3.4:7776","password":"..."}]', or for one
 * server GAME_URL + GAME_PASSWORD (+ GAME_NAME). GAME_TLS_INSECURE accepts self-signed https.
 */
function parseServers(env: Env): GameServer[] {
	const insecureTls = flag(env.GAME_TLS_INSECURE);
	const json = (env.GAME_SERVERS ?? '').trim();
	if (json) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(json);
		} catch {
			throw new Error('GAME_SERVERS must be a JSON array of {name, url, password}.');
		}
		if (!Array.isArray(parsed) || !parsed.length)
			throw new Error('GAME_SERVERS must be a non-empty JSON array of {name, url, password}.');
		return parsed.map((entry, i) => {
			const r =
				entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
			const url = typeof r.url === 'string' ? r.url : '';
			const password = typeof r.password === 'string' ? r.password : '';
			if (!url || !password) throw new Error(`GAME_SERVERS[${i}] needs url and password.`);
			return {
				name: typeof r.name === 'string' && r.name ? r.name : `Server ${i + 1}`,
				url: normalizeUrl(url, `GAME_SERVERS[${i}].url`),
				password,
				insecureTls
			};
		});
	}
	const url = (env.GAME_URL ?? '').trim();
	if (!url) throw new Error('Set GAME_SERVERS (JSON array) or GAME_URL and GAME_PASSWORD.');
	return [
		{
			name: (env.GAME_NAME ?? '').trim() || 'Server',
			url: normalizeUrl(url, 'GAME_URL'),
			password: required(env, 'GAME_PASSWORD'),
			insecureTls
		}
	];
}

function normalizeUrl(value: string, name: string): string {
	let u: URL;
	try {
		u = new URL(value);
	} catch {
		throw new Error(`${name} must be http(s)://host:port (got ${JSON.stringify(value)}).`);
	}
	if (!/^https?:$/.test(u.protocol))
		throw new Error(`${name} must start with http:// or https://.`);
	return u.origin;
}
