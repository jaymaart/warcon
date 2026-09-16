// Polls each game server, posts match results and kicks/bans to Discord, keeps one leaderboard
// message with period buttons, and serves Discord's interactions endpoint plus /health.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newEntries, parseModeration, type AuditCursor } from './audit';
import { Discord, DiscordError, handleInteraction, verifyInteraction } from './discord';
import { loadConfig } from './env';
import { matchEndEmbed, moderationEmbed } from './events';
import { GameClient, type GameServer } from './game';
import {
	leaderboardComponents,
	leaderboardEmbed,
	periodStart,
	PERIODS,
	type Period
} from './leaderboard';
import { Store } from './store';
import { observe, type Snapshot } from './tracker';

const cfg = loadConfig();
mkdirSync(cfg.dataDir, { recursive: true });
const store = new Store(join(cfg.dataDir, 'bot.sqlite'));
const discord = new Discord(cfg.token, cfg.apiBase);

interface Watched {
	server: GameServer;
	client: GameClient;
	snapshot: Snapshot | null;
	cursor: AuditCursor | null;
	ok: boolean;
	error: string;
	players: number;
}

const watched: Watched[] = cfg.servers.map((server) => ({
	server,
	client: new GameClient(server),
	snapshot: null,
	cursor: readCursor(server.name),
	ok: false,
	error: 'not polled yet',
	players: 0
}));

function readCursor(name: string): AuditCursor | null {
	const raw = store.getState(`audit:${name}`);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as AuditCursor;
	} catch {
		return null;
	}
}

const log = (msg: string): void => console.log(`[bot] ${new Date().toISOString()} ${msg}`);

async function poll(w: Watched): Promise<void> {
	try {
		const [status, players] = await Promise.all([w.client.status(), w.client.players()]);
		const now = new Date();
		const { snapshot, result } = observe(w.snapshot, status, players);
		w.snapshot = snapshot;
		w.players = players.length;
		store.touchPlayers(now, players);
		store.recordDeltas(now, w.server.name, result.deltas);
		if (result.matchEnd) {
			log(
				`${w.server.name}: match over on ${result.matchEnd.map}, winner ${result.matchEnd.winner ?? 'draw'}`
			);
			await discord.createMessage(cfg.eventsChannelId, {
				embeds: [matchEndEmbed(status.serverName || w.server.name, result.matchEnd)]
			});
			await refreshLeaderboard();
		}
		await pollAudit(w, status.serverName || w.server.name);
		if (!w.ok) log(`${w.server.name}: reachable (${players.length} players on ${status.map})`);
		w.ok = true;
		w.error = '';
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (w.ok || w.error !== message) log(`${w.server.name}: ${message}`);
		w.ok = false;
		w.error = message;
	}
}

async function pollAudit(w: Watched, serverName: string): Promise<void> {
	const { fresh, cursor } = newEntries(await w.client.audit(), w.cursor);
	w.cursor = cursor;
	store.setState(`audit:${w.server.name}`, JSON.stringify(cursor));
	for (const entry of fresh) {
		const ev = parseModeration(entry);
		if (!ev) continue;
		log(`${w.server.name}: ${ev.kind} ${ev.steamId} ${ev.reason}`);
		await discord.createMessage(cfg.eventsChannelId, {
			embeds: [moderationEmbed(serverName, ev, store.playerName(ev.steamId))]
		});
	}
}

const isPeriod = (v: string | null): v is Period =>
	(PERIODS as readonly string[]).includes(v ?? '');

function render(period: Period): ReturnType<typeof renderNow> {
	store.setState('lb:period', period);
	return renderNow(period);
}

function renderNow(period: Period) {
	const now = new Date();
	return {
		embeds: [
			leaderboardEmbed(
				period,
				store.leaderboard(periodStart(period, now), cfg.leaderboardSize),
				now
			)
		],
		components: leaderboardComponents(period)
	};
}

let refreshing: Promise<void> | null = null;
function refreshLeaderboard(): Promise<void> {
	if (refreshing) return refreshing;
	refreshing = (async () => {
		const saved = store.getState('lb:period');
		const body = renderNow(isPeriod(saved) ? saved : 'all');
		const id = store.getState('lb:message');
		try {
			if (id) {
				await discord.editMessage(cfg.leaderboardChannelId, id, body);
				return;
			}
		} catch (err) {
			if (!(err instanceof DiscordError) || err.status !== 404) throw err;
			log('leaderboard message is gone; posting a new one');
		}
		store.setState('lb:message', await discord.createMessage(cfg.leaderboardChannelId, body));
		log('leaderboard message posted');
	})().finally(() => {
		refreshing = null;
	});
	return refreshing;
}

async function loop(fn: () => Promise<void>, everyMs: number, what: string): Promise<void> {
	for (;;) {
		try {
			await fn();
		} catch (err) {
			log(`${what}: ${err instanceof Error ? err.message : String(err)}`);
		}
		await Bun.sleep(everyMs);
	}
}

const server = Bun.serve({
	port: cfg.port,
	hostname: '0.0.0.0',
	async fetch(req) {
		const url = new URL(req.url);
		if (url.pathname === '/health') {
			return Response.json({
				ok: watched.some((w) => w.ok),
				servers: watched.map((w) => ({
					name: w.server.name,
					ok: w.ok,
					error: w.error,
					players: w.players
				}))
			});
		}
		if (url.pathname === '/interactions' && req.method === 'POST') {
			const body = await req.text();
			const valid = await verifyInteraction(
				cfg.publicKey,
				req.headers.get('x-signature-ed25519') ?? '',
				req.headers.get('x-signature-timestamp') ?? '',
				body
			);
			if (!valid) return new Response('invalid request signature', { status: 401 });
			let payload: unknown;
			try {
				payload = JSON.parse(body);
			} catch {
				return new Response('bad json', { status: 400 });
			}
			const answer = handleInteraction(payload, render);
			return answer ? Response.json(answer) : new Response('unknown interaction', { status: 400 });
		}
		return new Response('not found', { status: 404 });
	}
});

log(`listening on :${server.port}; watching ${watched.map((w) => w.server.name).join(', ')}`);
for (const w of watched) void loop(() => poll(w), cfg.pollSeconds * 1000, w.server.name);
void loop(refreshLeaderboard, cfg.leaderboardRefreshSeconds * 1000, 'leaderboard');

const shutdown = (): void => {
	log('shutting down');
	server.stop(true);
	store.close();
	process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
