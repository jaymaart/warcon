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
	{ type: 1 } | { type: 4; data: { embeds: Embed[]; flags: number } };

/**
 * PING gets PONG; a leaderboard button gets an ephemeral reply with that period, leaving the
 * message itself unchanged. Anything else: null (400).
 */
export function handleInteraction(
	payload: unknown,
	render: (board: Board, period: Period) => Embed
): InteractionResponse | null {
	if (payload === null || typeof payload !== 'object') return null;
	const p = payload as { type?: unknown; data?: { custom_id?: unknown } };
	if (p.type === 1) return { type: 1 };
	if (p.type !== 3) return null;
	const target = typeof p.data?.custom_id === 'string' ? parseBoard(p.data.custom_id) : null;
	if (!target) return null;
	return { type: 4, data: { embeds: [render(target.board, target.period)], flags: EPHEMERAL } };
}
