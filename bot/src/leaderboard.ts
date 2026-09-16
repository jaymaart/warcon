// Leaderboard periods (UTC) and the Discord embed + buttons that show them.
import type { ActionRow, Embed } from './discord';

export type Period = 'daily' | 'weekly' | 'monthly' | 'all';
export const PERIODS: readonly Period[] = ['daily', 'weekly', 'monthly', 'all'];

const LABELS: Record<Period, string> = {
	daily: 'Today',
	weekly: 'This week',
	monthly: 'This month',
	all: 'All time'
};

export interface Row {
	steamId: string;
	name: string;
	kills: number;
	deaths: number;
	/** the Discord account linked with /link, shown as a mention; null when none */
	discordId: string | null;
}

/** "Name" or "Name (@user)" for a linked player. Mentions inside embeds render but never ping. */
export const playerLabel = (r: {
	name: string;
	steamId: string;
	discordId: string | null;
}): string => `${escape(r.name || r.steamId)}${r.discordId ? ` (<@${r.discordId}>)` : ''}`;

/** Start of the period in UTC (weeks start on Monday); null for all time. */
export function periodStart(period: Period, now: Date): Date | null {
	const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	switch (period) {
		case 'daily':
			return new Date(day);
		case 'weekly': {
			const sinceMonday = (now.getUTCDay() + 6) % 7;
			return new Date(day - sinceMonday * 86_400_000);
		}
		case 'monthly':
			return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
		case 'all':
			return null;
	}
}

export const periodLabel = (period: Period): string => LABELS[period];

/** The two standing leaderboards; each has its own message and buttons. */
export type Board = 'kills' | 'cash';
const PREFIX: Record<Board, string> = { kills: 'lb', cash: 'cash' };

export function parseBoard(customId: string): { board: Board; period: Period } | null {
	const i = customId.indexOf(':');
	if (i < 0) return null;
	const prefix = customId.slice(0, i);
	const p = customId.slice(i + 1);
	const board = (Object.keys(PREFIX) as Board[]).find((b) => PREFIX[b] === prefix);
	if (!board || !(PERIODS as readonly string[]).includes(p)) return null;
	return { board, period: p as Period };
}

const kd = (kills: number, deaths: number): string =>
	(deaths === 0 ? kills : kills / deaths).toFixed(2);

const every = (seconds: number): string =>
	seconds % 3600 === 0
		? `${seconds / 3600} h`
		: seconds % 60 === 0
			? `${seconds / 60} min`
			: `${seconds} s`;

export function leaderboardEmbed(
	period: Period,
	rows: Row[],
	now: Date,
	/** shown in the footer of the standing message; null for a one-off reply */
	refreshSeconds: number | null
): Embed {
	const start = periodStart(period, now);
	const lines = rows.map(
		(r, i) =>
			`**${i + 1}.** ${playerLabel(r)} · ${r.kills} kills · ${r.deaths} deaths · K/D ${kd(r.kills, r.deaths)}`
	);
	const since = start ? `Since ${start.toISOString().slice(0, 10)} UTC` : 'All time';
	const footer =
		refreshSeconds === null ? since : `Updates every ${every(refreshSeconds)} · ${since}`;
	return {
		title: `Leaderboard · ${LABELS[period]}`,
		description: lines.length ? lines.join('\n') : 'No kills recorded yet.',
		color: 0xd9a441,
		footer: { text: footer },
		timestamp: now.toISOString()
	};
}

export interface CashRow {
	steamId: string;
	name: string;
	cash: number;
	discordId: string | null;
}

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** Top earners: cash gained in the period (spending is never subtracted). */
export function cashEmbed(
	period: Period,
	rows: CashRow[],
	now: Date,
	refreshSeconds: number | null
): Embed {
	const start = periodStart(period, now);
	const lines = rows.map((r, i) => `**${i + 1}.** ${playerLabel(r)} · ${money(r.cash)}`);
	const since = start ? `Since ${start.toISOString().slice(0, 10)} UTC` : 'All time';
	return {
		title: `Cash earned · ${LABELS[period]}`,
		description: lines.length ? lines.join('\n') : 'No cash earned yet.',
		color: 0x3ba55d,
		footer: {
			text: refreshSeconds === null ? since : `Updates every ${every(refreshSeconds)} · ${since}`
		},
		timestamp: now.toISOString()
	};
}

export function leaderboardComponents(board: Board, active: Period): ActionRow[] {
	return [
		{
			type: 1,
			components: PERIODS.map((p) => ({
				type: 2,
				style: p === active ? 1 : 2,
				label: LABELS[p],
				custom_id: `${PREFIX[board]}:${p}`
			}))
		}
	];
}

/** Player names are untrusted text: keep Discord markdown inert. */
export const escape = (s: string): string => s.replace(/([\\*_~`|>])/g, '\\$1');
