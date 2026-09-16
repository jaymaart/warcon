// The live server card: one message per server, edited in place.
import { colorSquare, hexToInt } from './colors';
import type { Embed } from './discord';
import type { Status } from './game';
import { escape } from './leaderboard';

const COLORS = { offline: 0xed4245, idle: 0x99aab5 };

export const clock = (seconds: number | null): string => {
	if (seconds === null) return 'unknown';
	const m = Math.floor(seconds / 60);
	return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

const every = (seconds: number): string =>
	seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;

export interface ServerCard {
	name: string;
	status: Status | null;
	error: string;
}

export function statusEmbed(card: ServerCard, now: Date, refreshSeconds: number): Embed {
	const footer = { text: `Updates every ${every(refreshSeconds)}` };
	const timestamp = now.toISOString();
	const s = card.status;
	if (!s) {
		return {
			title: escape(card.name),
			description: `**Offline** · ${escape(card.error || 'not reachable')}`,
			color: COLORS.offline,
			footer,
			timestamp
		};
	}
	const ranked = [...s.scores].sort((a, b) => b.score - a.score);
	const leader = ranked[0];
	const tie = leader !== undefined && ranked[1] !== undefined && ranked[1].score === leader.score;
	const scores = s.scores.map((f) => {
		const square = colorSquare(f.colorHex);
		return `${square ? `${square} ` : ''}${escape(f.name)} **${f.score}**`;
	});
	return {
		title: escape(s.serverName || card.name),
		description: `**${s.playerCount} / ${s.maxPlayers}** players on **${escape(s.map || 'unknown map')}**`,
		color: leader && !tie ? (hexToInt(leader.colorHex) ?? COLORS.idle) : COLORS.idle,
		fields: [
			{ name: 'Scores', value: scores.join('\n') || 'none', inline: false },
			{ name: 'Match time', value: clock(s.matchSeconds), inline: true },
			{ name: 'Score cap', value: s.scoreCap === null ? 'none' : String(s.scoreCap), inline: true }
		],
		footer,
		timestamp
	};
}
