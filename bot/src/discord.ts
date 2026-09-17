// Discord REST (bot token) for posting and editing messages, plus the interactions endpoint
// side: Ed25519 request verification and the button handler. No gateway connection is needed.
import { parseBoard, type Board, type Period } from './leaderboard';

export interface EmbedField {
	name: string;
	value: string;
	inline?: boolean;
}

export interface Embed {
	title?: string;
	description?: string;
	color?: number;
	fields?: EmbedField[];
	footer?: { text: string };
	timestamp?: string;
}

export interface Button {
	type: 2;
	/** 1 primary (blurple), 2 secondary (grey) */
	style: 1 | 2;
	label: string;
	custom_id: string;
}

export interface ActionRow {
	type: 1;
	components: Button[];
}

export interface MessageBody {
	content?: string;
	embeds?: Embed[];
	components?: ActionRow[];
}

export class DiscordError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
	}
}

export const DISCORD_API = 'https://discord.com/api/v10';

/** Requests go out one at a time; a 429 is retried once after the wait Discord asks for. */
export class Discord {
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly token: string,
		private readonly apiBase = DISCORD_API
	) {}

	createMessage(channelId: string, body: MessageBody): Promise<string> {
		return this.call('POST', `/channels/${channelId}/messages`, body).then((r) => messageId(r));
	}

	editMessage(channelId: string, messageId: string, body: MessageBody): Promise<void> {
		return this.call('PATCH', `/channels/${channelId}/messages/${messageId}`, body).then(() => {});
	}

	private call(method: string, path: string, body: MessageBody): Promise<unknown> {
		const run = async (): Promise<unknown> => {
			for (let attempt = 0; ; attempt++) {
				const res = await fetch(`${this.apiBase}${path}`, {
					method,
					headers: {
						authorization: `Bot ${this.token}`,
						'content-type': 'application/json',
						'user-agent': 'DiscordBot (https://github.com/jaymaart/warcon, 0.1)'
					},
					body: JSON.stringify(body),
					signal: AbortSignal.timeout(15_000)
				});
				const text = await res.text();
				if (res.status === 429 && attempt === 0) {
					const wait = Number(res.headers.get('retry-after')) || 1;
					await Bun.sleep(wait * 1000);
					continue;
				}
				if (!res.ok) throw new DiscordError(`${method} ${path}: ${res.status} ${text}`, res.status);
				return text ? JSON.parse(text) : null;
			}
		};
		const next = this.queue.then(run, run);
		this.queue = next.catch(() => {});
		return next;
	}
}

function messageId(doc: unknown): string {
	const id = doc !== null && typeof doc === 'object' ? (doc as { id?: unknown }).id : undefined;
	if (typeof id !== 'string') throw new DiscordError('Discord answered without a message id.', 0);
	return id;
}

function hex(s: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[0-9a-f]*$/i.test(s) || s.length % 2 !== 0) return null;
	const out = new Uint8Array(s.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
	return out;
}

/** True when `signature` (X-Signature-Ed25519) signs timestamp + body under the app's public key. */
export async function verifyInteraction(
	publicKeyHex: string,
	signatureHex: string,
	timestamp: string,
	body: string
): Promise<boolean> {
	const key = hex(publicKeyHex);
	const signature = hex(signatureHex);
	if (!key || key.length !== 32 || !signature || signature.length !== 64) return false;
	try {
		const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'Ed25519' }, false, [
			'verify'
		]);
		return await crypto.subtle.verify(
			'Ed25519',
			cryptoKey,
			signature,
			new TextEncoder().encode(timestamp + body)
		);
	} catch {
		return false;
	}
}

/** Discord message flag: only the person who clicked sees the reply. */
const EPHEMERAL = 64;

export type InteractionResponse =
	| { type: 1 }
	| { type: 4; data: { embeds: Embed[]; flags: number } }
	| { type: 5; data: { flags: number } };

/** What to send back now, and for a deferred command, the work to finish afterwards. */
export interface Handled {
	response: InteractionResponse;
	followUp?: { token: string; run: () => Embed };
}

export interface InteractionHandlers {
	/** a leaderboard period button */
	board: (board: Board, period: Period) => Embed;
	/** a slash command from `discordId` with its string options; ephemeral false posts in the channel */
	command: (
		name: string,
		options: Record<string, string>,
		discordId: string
	) => { embed: Embed; ephemeral: boolean };
	/** non-null: acknowledge first, then edit the reply in with the command's embed */
	deferred: (name: string) => { ephemeral: boolean } | null;
}

/**
 * PING gets PONG; a leaderboard button gets an ephemeral reply with that period, leaving the
 * message itself unchanged. Anything else: null (400).
 */
export function handleInteraction(payload: unknown, handlers: InteractionHandlers): Handled | null {
	if (payload === null || typeof payload !== 'object') return null;
	const p = payload as {
		type?: unknown;
		token?: unknown;
		data?: { custom_id?: unknown; name?: unknown; options?: unknown };
		member?: { user?: { id?: unknown } };
		user?: { id?: unknown };
	};
	if (p.type === 1) return { response: { type: 1 } };
	const reply = (embed: Embed, ephemeral = true): Handled => ({
		response: { type: 4, data: { embeds: [embed], flags: ephemeral ? EPHEMERAL : 0 } }
	});
	if (p.type === 3) {
		const target = typeof p.data?.custom_id === 'string' ? parseBoard(p.data.custom_id) : null;
		return target ? reply(handlers.board(target.board, target.period)) : null;
	}
	if (p.type === 2) {
		const name = p.data?.name;
		const id = p.member?.user?.id ?? p.user?.id;
		if (typeof name !== 'string' || typeof id !== 'string') return null;
		const options: Record<string, string> = {};
		for (const o of Array.isArray(p.data?.options) ? p.data.options : []) {
			const r = o as { name?: unknown; value?: unknown };
			if (typeof r.name === 'string' && typeof r.value === 'string') options[r.name] = r.value;
		}
		const deferred = handlers.deferred(name);
		if (deferred && typeof p.token === 'string') {
			const token = p.token;
			return {
				response: { type: 5, data: { flags: deferred.ephemeral ? EPHEMERAL : 0 } },
				followUp: { token, run: () => handlers.command(name, options, id).embed }
			};
		}
		const r = handlers.command(name, options, id);
		return reply(r.embed, r.ephemeral);
	}
	return null;
}

/** Replaces a deferred reply with the finished embed (PATCH the original via the interaction webhook). */
export async function editDeferredReply(
	applicationId: string,
	token: string,
	embed: Embed,
	apiBase = DISCORD_API
): Promise<void> {
	const res = await fetch(`${apiBase}/webhooks/${applicationId}/${token}/messages/@original`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ embeds: [embed] }),
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok)
		throw new DiscordError(`PATCH deferred reply: ${res.status} ${await res.text()}`, res.status);
}

/** Overwrites the application's global slash commands; returns how many Discord now has. */
export async function registerCommands(
	token: string,
	applicationId: string,
	commands: readonly unknown[],
	apiBase = DISCORD_API
): Promise<number> {
	const res = await fetch(`${apiBase}/applications/${applicationId}/commands`, {
		method: 'PUT',
		headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify(commands),
		signal: AbortSignal.timeout(15_000)
	});
	const text = await res.text();
	if (!res.ok) throw new DiscordError(`PUT commands: ${res.status} ${text}`, res.status);
	const doc: unknown = JSON.parse(text);
	return Array.isArray(doc) ? doc.length : 0;
}

/** The application id is the bot user's id, which is the first segment of the token. */
export function applicationIdFromToken(token: string): string | null {
	const first = token.split('.')[0] ?? '';
	try {
		const id = Buffer.from(first, 'base64').toString('utf8');
		return /^\d{15,22}$/.test(id) ? id : null;
	} catch {
		return null;
	}
}
