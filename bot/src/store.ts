// SQLite (bun:sqlite): kill/death deltas per poll, the latest name per Steam ID, and a small
// key-value state (audit cursors, the leaderboard message). One file on the volume.
import { Database } from 'bun:sqlite';
import type { CashRow, Row } from './leaderboard';
import type { StatDelta } from './tracker';

export class Store {
	private readonly db: Database;

	constructor(path: string) {
		this.db = new Database(path, { create: true });
		this.db.exec(`
			PRAGMA journal_mode = WAL;
			CREATE TABLE IF NOT EXISTS players (
				steam_id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				last_seen TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS stats (
				id INTEGER PRIMARY KEY,
				at TEXT NOT NULL,
				server TEXT NOT NULL,
				steam_id TEXT NOT NULL,
				kills INTEGER NOT NULL,
				deaths INTEGER NOT NULL,
				cash INTEGER NOT NULL DEFAULT 0
			);
			CREATE INDEX IF NOT EXISTS stats_at ON stats (at);
			CREATE TABLE IF NOT EXISTS state (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS links (
				discord_id TEXT PRIMARY KEY,
				steam_id TEXT NOT NULL,
				linked_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS uptime (
				day TEXT NOT NULL,
				server TEXT NOT NULL,
				ok INTEGER NOT NULL,
				total INTEGER NOT NULL,
				PRIMARY KEY (day, server)
			);
		`);
		// Added after the first release: databases created before it lack the column.
		const columns = this.db
			.query<{ name: string }, []>('PRAGMA table_info(players)')
			.all()
			.map((c) => c.name);
		if (!columns.includes('cash')) this.db.exec('ALTER TABLE players ADD COLUMN cash INTEGER');
		if (!columns.includes('faction')) this.db.exec('ALTER TABLE players ADD COLUMN faction TEXT');
		const statColumns = this.db
			.query<{ name: string }, []>('PRAGMA table_info(stats)')
			.all()
			.map((c) => c.name);
		if (!statColumns.includes('cash'))
			this.db.exec('ALTER TABLE stats ADD COLUMN cash INTEGER NOT NULL DEFAULT 0');
	}

	/**
	 * Latest name, faction and cash balance per player; a call without cash or faction keeps the
	 * stored values.
	 */
	touchPlayers(
		at: Date,
		players: { steamId: string; name: string; cash?: number; faction?: string | null }[]
	): void {
		const upsert = this.db.query<void, [string, string, string, number | null, string | null]>(
			`INSERT INTO players (steam_id, name, last_seen, cash, faction) VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT (steam_id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen,
			   cash = COALESCE(excluded.cash, players.cash),
			   faction = COALESCE(excluded.faction, players.faction)`
		);
		const iso = at.toISOString();
		this.db.transaction(() => {
			for (const p of players)
				if (p.name) upsert.run(p.steamId, p.name, iso, p.cash ?? null, p.faction ?? null);
		})();
	}

	/** Top players by cash earned since `since` (all time when null). */
	cashEarned(since: Date | null, limit: number): CashRow[] {
		return this.db
			.query<CashRow, [string | null, string | null, number]>(
				`SELECT s.steam_id AS steamId, COALESCE(p.name, s.steam_id) AS name, SUM(s.cash) AS cash,
				        (SELECT l.discord_id FROM links l WHERE l.steam_id = s.steam_id LIMIT 1) AS discordId
				 FROM stats s LEFT JOIN players p ON p.steam_id = s.steam_id
				 WHERE ?1 IS NULL OR s.at >= ?2
				 GROUP BY s.steam_id
				 HAVING SUM(s.cash) > 0
				 ORDER BY cash DESC, name ASC
				 LIMIT ?3`
			)
			.all(since ? since.toISOString() : null, since ? since.toISOString() : null, limit);
	}

	recordDeltas(at: Date, server: string, deltas: StatDelta[]): void {
		if (!deltas.length) return;
		const insert = this.db.query<void, [string, string, string, number, number, number]>(
			'INSERT INTO stats (at, server, steam_id, kills, deaths, cash) VALUES (?, ?, ?, ?, ?, ?)'
		);
		const iso = at.toISOString();
		this.db.transaction(() => {
			for (const d of deltas) insert.run(iso, server, d.steamId, d.kills, d.deaths, d.cash);
		})();
	}

	/** Top players by kills since `since` (all time when null); ties break by fewer deaths. */
	leaderboard(since: Date | null, limit: number): Row[] {
		return this.db
			.query<Row, [string | null, string | null, number]>(
				`SELECT s.steam_id AS steamId, COALESCE(p.name, s.steam_id) AS name,
				        SUM(s.kills) AS kills, SUM(s.deaths) AS deaths,
				        (SELECT l.discord_id FROM links l WHERE l.steam_id = s.steam_id LIMIT 1) AS discordId
				 FROM stats s LEFT JOIN players p ON p.steam_id = s.steam_id
				 WHERE ?1 IS NULL OR s.at >= ?2
				 GROUP BY s.steam_id
				 HAVING SUM(s.kills) > 0
				 ORDER BY kills DESC, deaths ASC, name ASC
				 LIMIT ?3`
			)
			.all(since ? since.toISOString() : null, since ? since.toISOString() : null, limit);
	}

	/** Counts one poll for the UTC day: reachable or not. */
	recordPoll(at: Date, server: string, ok: boolean): void {
		this.db
			.query<void, [string, string, number]>(
				`INSERT INTO uptime (day, server, ok, total) VALUES (?, ?, ?, 1)
				 ON CONFLICT (day, server) DO UPDATE SET ok = ok + excluded.ok, total = total + 1`
			)
			.run(at.toISOString().slice(0, 10), server, ok ? 1 : 0);
	}

	/** Share of polls that reached the servers since the UTC day (0 to 1); null with no polls. */
	uptime(sinceDay: string): number | null {
		const row = this.db
			.query<{ ok: number; total: number }, [string]>(
				'SELECT COALESCE(SUM(ok), 0) AS ok, COALESCE(SUM(total), 0) AS total FROM uptime WHERE day >= ?'
			)
			.get(sinceDay);
		return row && row.total > 0 ? row.ok / row.total : null;
	}

	link(discordId: string): string | null {
		const row = this.db
			.query<{ steam_id: string }, [string]>('SELECT steam_id FROM links WHERE discord_id = ?')
			.get(discordId);
		return row ? row.steam_id : null;
	}

	setLink(discordId: string, steamId: string, at = new Date()): void {
		this.db
			.query<void, [string, string, string]>(
				`INSERT INTO links (discord_id, steam_id, linked_at) VALUES (?, ?, ?)
				 ON CONFLICT (discord_id) DO UPDATE SET steam_id = excluded.steam_id, linked_at = excluded.linked_at`
			)
			.run(discordId, steamId, at.toISOString());
	}

	/** True when a link existed. */
	clearLink(discordId: string): boolean {
		return (
			this.db.query<void, [string]>('DELETE FROM links WHERE discord_id = ?').run(discordId)
				.changes > 0
		);
	}

	/** Players whose stored name matches, case-insensitively. */
	playersNamed(name: string): { steamId: string; name: string }[] {
		return this.db
			.query<{ steamId: string; name: string }, [string]>(
				'SELECT steam_id AS steamId, name FROM players WHERE lower(name) = lower(?) ORDER BY last_seen DESC'
			)
			.all(name);
	}

	/** One player's totals since `since` and their place by kills among players with kills. */
	playerStats(
		steamId: string,
		since: Date | null
	): { kills: number; deaths: number; cash: number; rank: number | null } {
		const iso = since ? since.toISOString() : null;
		const totals = this.db
			.query<
				{ kills: number; deaths: number; cash: number },
				[string, string | null, string | null]
			>(
				`SELECT COALESCE(SUM(kills), 0) AS kills, COALESCE(SUM(deaths), 0) AS deaths,
				        COALESCE(SUM(cash), 0) AS cash
				 FROM stats WHERE steam_id = ?1 AND (?2 IS NULL OR at >= ?3)`
			)
			.get(steamId, iso, iso) ?? { kills: 0, deaths: 0, cash: 0 };
		if (totals.kills === 0) return { ...totals, rank: null };
		const above = this.db
			.query<{ n: number }, [string | null, string | null, number]>(
				`SELECT COUNT(*) AS n FROM (
				   SELECT steam_id FROM stats WHERE ?1 IS NULL OR at >= ?2
				   GROUP BY steam_id HAVING SUM(kills) > ?3)`
			)
			.get(iso, iso, totals.kills);
		return { ...totals, rank: (above?.n ?? 0) + 1 };
	}

	player(steamId: string): { name: string; faction: string | null } | null {
		return this.db
			.query<{ name: string; faction: string | null }, [string]>(
				'SELECT name, faction FROM players WHERE steam_id = ?'
			)
			.get(steamId);
	}

	getState(key: string): string | null {
		const row = this.db
			.query<{ value: string }, [string]>('SELECT value FROM state WHERE key = ?')
			.get(key);
		return row ? row.value : null;
	}

	setState(key: string, value: string): void {
		this.db
			.query<void, [string, string]>(
				'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
			)
			.run(key, value);
	}

	close(): void {
		this.db.close();
	}
}
