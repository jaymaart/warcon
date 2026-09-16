// The landing page's data: one JSON document the browser polls, built from what the bot already
// knows (last status and players, the kill history, poll uptime, the Discord invite counts).
import type { Player, Status } from './game';
import type { Row } from './leaderboard';

export interface DiscordCounts {
	members: number;
	online: number;
}

export interface SiteInput {
	serverName: string;
	serverId: string;
	status: Status | null;
	players: Player[];
	leaders: Row[];
	/** 0 to 1 over the last 30 days; null before any poll */
	uptime: number | null;
	discord: DiscordCounts | null;
	error: string;
}

export interface SitePayload {
	online: boolean;
	error: string;
	serverName: string;
	serverId: string;
	map: string;
	mode: string;
	players: { current: number; max: number };
	avgPing: number | null;
	uptimePercent: number | null;
	match: { seconds: number | null; scores: { name: string; colorHex: string; score: number }[] };
	leaders: { rank: number; name: string; kills: number; deaths: number; kd: string }[];
	discord: DiscordCounts | null;
	generatedAt: string;
}

const kd = (kills: number, deaths: number): string =>
	(deaths === 0 ? kills : kills / deaths).toFixed(1);

export function sitePayload(input: SiteInput, now: Date): SitePayload {
	const s = input.status;
	const pings = input.players.map((p) => p.ping).filter((p): p is number => p !== null);
	return {
		online: s !== null,
		error: s ? '' : input.error,
		serverName: s?.serverName || input.serverName,
		serverId: input.serverId,
		map: s?.map ?? '',
		mode: s ? [s.experiences.join(' + '), s.lighting].filter(Boolean).join(' · ') : '',
		players: { current: s?.playerCount ?? 0, max: s?.maxPlayers ?? 0 },
		avgPing: pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null,
		uptimePercent: input.uptime === null ? null : Math.round(input.uptime * 1000) / 10,
		match: { seconds: s?.matchSeconds ?? null, scores: s?.scores ?? [] },
		leaders: input.leaders.map((r, i) => ({
			rank: i + 1,
			name: r.name || r.steamId,
			kills: r.kills,
			deaths: r.deaths,
			kd: kd(r.kills, r.deaths)
		})),
		discord: input.discord,
		generatedAt: now.toISOString()
	};
}

/** Member and online counts from a public invite; null when Discord does not answer. */
export async function fetchDiscordCounts(invite: string): Promise<DiscordCounts | null> {
	try {
		const res = await fetch(
			`https://discord.com/api/v10/invites/${encodeURIComponent(invite)}?with_counts=true`,
			{ signal: AbortSignal.timeout(10_000) }
		);
		if (!res.ok) return null;
		const doc = (await res.json()) as {
			approximate_member_count?: unknown;
			approximate_presence_count?: unknown;
		};
		const members = doc.approximate_member_count;
		const online = doc.approximate_presence_count;
		return typeof members === 'number' && typeof online === 'number' ? { members, online } : null;
	} catch {
		return null;
	}
}
