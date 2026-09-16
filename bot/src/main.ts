// Polls each game server, posts match results and kicks/bans to Discord, keeps one leaderboard
// message with period buttons, and serves Discord's interactions endpoint plus /health.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newEntries, parseModeration, type AuditCursor } from './audit';
import { Discord, DiscordError, handleInteraction, verifyInteraction, type Embed } from './discord';
import { loadConfig } from './env';
import { matchEndEmbed, moderationEmbed } from './events';
import { GameClient, type GameServer } from './game';
import {
	leaderboardComponents,
	leaderboardEmbed,
	periodStart,
	richestEmbed,
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

/** "type 3 lb:daily" for the log line; never the payload itself. */
function summarize(payload: unknown): string {
	const p = payload as { type?: unknown; data?: { custom_id?: unknown } } | null;
	const id = typeof p?.data?.custom_id === 'string' ? ` ${p.data.custom_id}` : '';
	return `type ${String(p?.type)}${id}`;
}

/** The standing message always shows today; buttons answer privately with any period. */
const MAIN_PERIOD: Period = 'daily';

function leaderboardFor(period: Period, refreshSeconds: number | null): Embed {
	const now = new Date();
	return leaderboardEmbed(
		period,
		store.leaderboard(periodStart(period, now), cfg.leaderboardSize),
		now,
		refreshSeconds
	);
}

const render = (period: Period): Embed => leaderboardFor(period, null);

let refreshing: Promise<void> | null = null;
function refreshLeaderboard(): Promise<void> {
	if (refreshing) return refreshing;
	refreshing = (async () => {
		const body = {
			embeds: [
				leaderboardFor(MAIN_PERIOD, cfg.leaderboardRefreshSeconds),
				richestEmbed(store.richest(cfg.leaderboardSize), new Date())
			],
			components: leaderboardComponents(MAIN_PERIOD)
		};
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
			if (!valid) {
				log('interaction rejected: bad signature');
				return new Response('invalid request signature', { status: 401 });
			}
			let payload: unknown;
			try {
				payload = JSON.parse(body);
			} catch {
				log('interaction rejected: bad json');
				return new Response('bad json', { status: 400 });
			}
			const answer = handleInteraction(payload, render);
			log(
				`interaction ${summarize(payload)}: ${answer ? `answered type ${answer.type}` : 'unknown'}`
			);
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
