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
}

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

export function parsePeriod(customId: string): Period | null {
	const p = customId.startsWith('lb:') ? customId.slice(3) : '';
	return (PERIODS as readonly string[]).includes(p) ? (p as Period) : null;
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
			`**${i + 1}.** ${escape(r.name || r.steamId)} · ${r.kills} kills · ${r.deaths} deaths · K/D ${kd(r.kills, r.deaths)}`
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
}

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** Richest players by their cash balance as last seen (a balance, so no period). */
export function richestEmbed(rows: CashRow[], now: Date): Embed {
	const lines = rows.map(
		(r, i) => `**${i + 1}.** ${escape(r.name || r.steamId)} · ${money(r.cash)}`
	);
	return {
		title: 'Richest players',
		description: lines.length ? lines.join('\n') : 'No balances seen yet.',
		color: 0x3ba55d,
		footer: { text: 'Cash balance as last seen on the server' },
		timestamp: now.toISOString()
	};
}

export function leaderboardComponents(active: Period): ActionRow[] {
	return [
		{
			type: 1,
			components: PERIODS.map((p) => ({
				type: 2,
				style: p === active ? 1 : 2,
				label: LABELS[p],
				custom_id: `lb:${p}`
			}))
		}
	];
}

/** Player names are untrusted text: keep Discord markdown inert. */
export const escape = (s: string): string => s.replace(/([\\*_~`|>])/g, '\\$1');
