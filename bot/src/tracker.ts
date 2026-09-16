// Match and per-player kill tracking from successive status + players polls. Pure: the caller
// keeps the snapshot and stores the deltas.
import type { FactionScore, Player, Status } from './game';

export interface PlayerCounts {
	name: string;
	kills: number;
	deaths: number;
	cash: number;
}

export interface Snapshot {
	map: string;
	matchSeconds: number | null;
	scores: FactionScore[];
	players: Map<string, PlayerCounts>;
}

export interface StatDelta {
	steamId: string;
	name: string;
	kills: number;
	deaths: number;
	/** cash gained since the last poll; spending never counts */
	cash: number;
}

export interface MatchEnd {
	map: string;
	/** null on a tie */
	winner: string | null;
	scores: FactionScore[];
	durationSeconds: number | null;
}

export interface Observation {
	newMatch: boolean;
	matchEnd: MatchEnd | null;
	deltas: StatDelta[];
}

/** A restart or rotation advance: the match clock went back by more than this. */
const CLOCK_RESET_SECONDS = 30;

export function observe(
	prev: Snapshot | null,
	status: Status,
	players: Player[]
): { snapshot: Snapshot; result: Observation } {
	const snapshot: Snapshot = {
		map: status.map,
		matchSeconds: status.matchSeconds,
		scores: status.scores,
		players: new Map(
			players.map((p) => [
				p.steamId,
				{ name: p.name, kills: p.kills, deaths: p.deaths, cash: p.cash }
			])
		)
	};
	if (!prev) return { snapshot, result: { newMatch: false, matchEnd: null, deltas: [] } };

	const clockReset =
		status.matchSeconds !== null &&
		prev.matchSeconds !== null &&
		status.matchSeconds < prev.matchSeconds - CLOCK_RESET_SECONDS;
	const newMatch = clockReset || prev.map !== status.map;
	const matchEnd = newMatch ? endOf(prev) : null;

	const deltas: StatDelta[] = [];
	for (const p of players) {
		const before = prev.players.get(p.steamId);
		if (!before) continue; // first sighting: baseline only, so a restart never counts twice
		const base = newMatch ? { kills: 0, deaths: 0 } : before;
		const kills = p.kills < base.kills ? p.kills : p.kills - base.kills;
		const deaths = p.deaths < base.deaths ? p.deaths : p.deaths - base.deaths;
		const cash = Math.max(0, p.cash - before.cash); // the balance survives a new match
		if (kills > 0 || deaths > 0 || cash > 0)
			deltas.push({ steamId: p.steamId, name: p.name, kills, deaths, cash });
	}
	return { snapshot, result: { newMatch, matchEnd, deltas } };
}

function endOf(prev: Snapshot): MatchEnd {
	const sorted = [...prev.scores].sort((a, b) => b.score - a.score);
	const top = sorted[0];
	const tie = top !== undefined && sorted[1] !== undefined && sorted[1].score === top.score;
	return {
		map: prev.map,
		winner: top && !tie ? top.name : null,
		scores: prev.scores,
		durationSeconds: prev.matchSeconds
	};
}
