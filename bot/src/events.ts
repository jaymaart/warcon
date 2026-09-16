// Embeds for what the bot reports: a match ending, and kicks / bans / unbans from the audit log.
import type { ModerationEvent } from './audit';
import { colorSquare, hexToInt } from './colors';
import type { Embed } from './discord';
import { escape } from './leaderboard';
import type { MatchEnd } from './tracker';

const COLORS = { win: 0x3ba55d, draw: 0x99aab5, kick: 0xe67e22, ban: 0xed4245, unban: 0x3ba55d };

const duration = (seconds: number | null): string => {
	if (seconds === null) return '';
	const m = Math.floor(seconds / 60);
	return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

/** "[square] Name": the faction's coloured square, when its colour is known, before the name. */
const tagged = (name: string, colorHex: string): string => {
	const square = colorSquare(colorHex);
	return `${square ? `${square} ` : ''}${escape(name)}`;
};

export function matchEndEmbed(serverName: string, end: MatchEnd): Embed {
	const scoreline = end.scores.map((f) => `${tagged(f.name, f.colorHex)} ${f.score}`).join(' – ');
	const winner = end.scores.find((f) => f.name === end.winner);
	const headline = winner ? `${tagged(winner.name, winner.colorHex)} **won**` : 'Draw';
	const took = duration(end.durationSeconds);
	return {
		title: `Match over on ${escape(end.map || 'unknown map')}`,
		description: `${headline}${scoreline ? ` · ${scoreline}` : ''}`,
		color: winner ? (hexToInt(winner.colorHex) ?? COLORS.win) : COLORS.draw,
		footer: { text: took ? `${serverName} · ${took}` : serverName },
		timestamp: new Date().toISOString()
	};
}

const TITLES: Record<ModerationEvent['kind'], string> = {
	kick: 'Player kicked',
	ban: 'Player banned',
	unban: 'Player unbanned'
};

export function moderationEmbed(
	serverName: string,
	ev: ModerationEvent,
	player: { name: string; colorHex: string } | null
): Embed {
	const who = player
		? `${colorSquare(player.colorHex) ? `${colorSquare(player.colorHex)} ` : ''}**${escape(player.name)}** (${ev.steamId})`
		: `**${ev.steamId}**`;
	const reason = ev.reason ? `\nReason: ${escape(ev.reason)}` : '';
	return {
		title: TITLES[ev.kind],
		description: `${who}${reason}`,
		color: COLORS[ev.kind],
		footer: { text: serverName },
		timestamp: toIso(ev.at)
	};
}

const toIso = (s: string): string => {
	const t = Date.parse(s);
	return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
};
