// Client for the game's WDRCON HTTP listener (the same API Warcon talks to): status, players and
// the listener's own audit log, authenticated with `Authorization: Bearer <rcon password>`.

export interface GameServer {
	name: string;
	/** http(s)://host:7776 */
	url: string;
	password: string;
	/** accept a self-signed certificate on an https listener */
	insecureTls: boolean;
}

export interface FactionScore {
	name: string;
	score: number;
}

export interface Status {
	serverName: string;
	map: string;
	matchSeconds: number | null;
	playerCount: number;
	maxPlayers: number;
	scores: FactionScore[];
}

export interface Player {
	steamId: string;
	name: string;
	faction: string | null;
	kills: number;
	deaths: number;
}

export interface AuditEntry {
	timestampUtc: string;
	peer: string;
	sessionId: string;
	event: string;
	detail: string;
}

export class GameError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
	}
}

const rec = (v: unknown): Record<string, unknown> =>
	v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const id = (v: unknown): string | null =>
	typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : null;

export function toStatus(doc: unknown): Status {
	const s = rec(doc);
	const players = rec(s.players);
	return {
		serverName: str(s.serverName),
		map: str(s.map),
		matchSeconds: num(s.matchSeconds),
		playerCount: num(players.current) ?? 0,
		maxPlayers: num(players.max) ?? 0,
		scores: list(s.factionScores).map((f) => {
			const r = rec(f);
			return { name: str(r.name), score: num(r.score) ?? 0 };
		})
	};
}

export function toPlayers(doc: unknown): Player[] {
	const out: Player[] = [];
	for (const p of list(rec(doc).players)) {
		const r = rec(p);
		const steamId = id(r.steamId);
		if (!steamId) continue;
		out.push({
			steamId,
			name: str(r.name),
			faction: typeof r.faction === 'string' ? r.faction : null,
			kills: num(r.kills) ?? 0,
			deaths: num(r.deaths) ?? 0
		});
	}
	return out;
}

export function toAudit(doc: unknown): AuditEntry[] {
	const out: AuditEntry[] = [];
	for (const e of list(rec(doc).entries)) {
		const r = rec(e);
		const timestampUtc = str(r.timestampUtc);
		if (!timestampUtc) continue;
		out.push({
			timestampUtc,
			peer: str(r.peer),
			sessionId: str(r.sessionId),
			event: str(r.event),
			detail: str(r.detail)
		});
	}
	return out;
}

export class GameClient {
	constructor(private readonly server: GameServer) {}

	private async get(path: string): Promise<unknown> {
		const init: BunFetchRequestInit = {
			method: 'GET',
			headers: {
				authorization: `Bearer ${this.server.password}`,
				accept: 'application/json',
				'user-agent': 'warcon-discord-bot/0.1'
			},
			signal: AbortSignal.timeout(10_000),
			redirect: 'manual'
		};
		if (this.server.insecureTls) init.tls = { rejectUnauthorized: false };
		let res: Response;
		try {
			res = await fetch(`${this.server.url}${path}`, init);
		} catch (err) {
			throw new GameError(`Could not reach ${this.server.url} (${(err as Error).message}).`, 0);
		}
		const text = await res.text();
		let body: unknown = null;
		try {
			body = JSON.parse(text);
		} catch {
			/* non-JSON answer: reported below */
		}
		if (!res.ok) {
			const message = str(rec(rec(body).error).message) || `Server answered ${res.status}.`;
			throw new GameError(`${path}: ${message}`, res.status);
		}
		return body;
	}

	status = async (): Promise<Status> => toStatus(await this.get('/v1/status'));
	players = async (): Promise<Player[]> => toPlayers(await this.get('/v1/players'));
	audit = async (limit = 200): Promise<AuditEntry[]> =>
		toAudit(await this.get(`/v1/audit?limit=${limit}`));
}
