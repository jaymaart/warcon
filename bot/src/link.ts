// Slash commands: /link ties a Discord account to a Steam player, /unlink removes it, /stats
// shows the linked player's numbers privately. Pure apart from the store callbacks passed in.
import type { Embed } from './discord';
import { escape, PERIODS, periodLabel, periodStart, type Period } from './leaderboard';

/** The Discord command definitions registered at startup (PUT /applications/{id}/commands). */
export const COMMANDS = [
	{
		name: 'link',
		description: 'Link your Discord account to your in-game player',
		options: [
			{
				type: 3,
				name: 'player',
				description: 'Your SteamID64, Steam profile URL, or exact in-game name',
				required: true
			}
		]
	},
	{ name: 'unlink', description: 'Remove the link to your in-game player' },
	{ name: 'stats', description: 'Your kills, deaths, K/D and cash earned, posted in the channel' }
] as const;

export type Resolved = { steamId: string } | { error: string };

/** A SteamID64, a steamcommunity.com/profiles/<id> URL, or an exact in-game name seen before. */
export function resolvePlayer(
	input: string,
	byName: (name: string) => { steamId: string; name: string }[]
): Resolved {
	const raw = input.trim();
	if (/^7656119\d{10}$/.test(raw)) return { steamId: raw };
	const url = /steamcommunity\.com\/profiles\/(7656119\d{10})\b/i.exec(raw);
	if (url) return { steamId: url[1]! };
	if (/steamcommunity\.com\/id\//i.test(raw))
		return {
			error:
				'Custom profile URLs cannot be resolved here. Use your SteamID64 (17 digits), the /profiles/ URL, or your exact in-game name.'
		};
	if (!raw) return { error: 'Give a SteamID64, a Steam profile URL, or your in-game name.' };
	const matches = byName(raw);
	if (matches.length === 1) return { steamId: matches[0]!.steamId };
	if (matches.length === 0)
		return {
			error: `No player named "${raw}" has been seen on the server. Check the spelling, or use your SteamID64.`
		};
	return {
		error: `${matches.length} players share the name "${raw}". Use your SteamID64 (17 digits) instead.`
	};
}

export interface PeriodStats {
	kills: number;
	deaths: number;
	cash: number;
	/** 1-based place by kills among players with kills in the period; null without kills */
	rank: number | null;
}

export interface StatsSource {
	link: (discordId: string) => string | null;
	setLink: (discordId: string, steamId: string) => void;
	clearLink: (discordId: string) => boolean;
	playerName: (steamId: string) => string | null;
	byName: (name: string) => { steamId: string; name: string }[];
	stats: (steamId: string, since: Date | null) => PeriodStats;
}

const kd = (kills: number, deaths: number): string =>
	(deaths === 0 ? kills : kills / deaths).toFixed(2);
const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

const COLORS = { ok: 0x8ce02a, error: 0xed4245, info: 0x99aab5 };

export interface CommandReply {
	embed: Embed;
	/** true: only the caller sees it. A successful /stats is public; everything else is private. */
	ephemeral: boolean;
}

export function runCommand(
	name: string,
	options: Record<string, string>,
	discordId: string,
	source: StatsSource,
	now: Date
): CommandReply {
	const embed = commandEmbed(name, options, discordId, source, now);
	return { embed, ephemeral: !(name === 'stats' && embed.title?.startsWith('Stats ·')) };
}

function commandEmbed(
	name: string,
	options: Record<string, string>,
	discordId: string,
	source: StatsSource,
	now: Date
): Embed {
	switch (name) {
		case 'link': {
			const resolved = resolvePlayer(options.player ?? '', source.byName);
			if ('error' in resolved)
				return { title: 'Not linked', description: resolved.error, color: COLORS.error };
			source.setLink(discordId, resolved.steamId);
			const known = source.playerName(resolved.steamId);
			return {
				title: 'Linked',
				description: `Your Discord account is linked to ${known ? `**${escape(known)}** (${resolved.steamId})` : `**${resolved.steamId}**`}. Use /stats any time.`,
				color: COLORS.ok
			};
		}
		case 'unlink':
			return source.clearLink(discordId)
				? {
						title: 'Unlinked',
						description: 'Your Discord account is no longer linked.',
						color: COLORS.info
					}
				: {
						title: 'Nothing to unlink',
						description: 'Your Discord account was not linked.',
						color: COLORS.info
					};
		case 'stats': {
			const steamId = source.link(discordId);
			if (!steamId)
				return {
					title: 'Not linked yet',
					description: 'Run /link with your SteamID64, Steam profile URL, or in-game name first.',
					color: COLORS.error
				};
			const name = source.playerName(steamId) ?? steamId;
			const fields = PERIODS.map((p: Period) => {
				const s = source.stats(steamId, periodStart(p, now));
				const place = s.rank === null ? '' : ` · #${s.rank} by kills`;
				return {
					name: periodLabel(p),
					value: `${s.kills} kills · ${s.deaths} deaths · K/D ${kd(s.kills, s.deaths)}\n${money(s.cash)} earned${place}`,
					inline: false
				};
			});
			return {
				title: `Stats · ${escape(name)}`,
				description: `SteamID64 ${steamId}`,
				color: COLORS.ok,
				fields,
				footer: { text: 'Counted since the bot started watching; periods are UTC' },
				timestamp: now.toISOString()
			};
		}
		default:
			return {
				title: 'Unknown command',
				description: `No such command: ${escape(name)}.`,
				color: COLORS.error
			};
	}
}
