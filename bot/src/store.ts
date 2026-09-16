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
				deaths INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS stats_at ON stats (at);
			CREATE TABLE IF NOT EXISTS state (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
		`);
		// Added after the first release: databases created before it lack the column.
		const columns = this.db
			.query<{ name: string }, []>('PRAGMA table_info(players)')
			.all()
			.map((c) => c.name);
		if (!columns.includes('cash')) this.db.exec('ALTER TABLE players ADD COLUMN cash INTEGER');
	}

	/** Latest name and cash balance per player; a call without cash keeps the stored balance. */
	touchPlayers(at: Date, players: { steamId: string; name: string; cash?: number }[]): void {
		const upsert = this.db.query<void, [string, string, string, number | null]>(
			`INSERT INTO players (steam_id, name, last_seen, cash) VALUES (?, ?, ?, ?)
			 ON CONFLICT (steam_id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen,
			   cash = COALESCE(excluded.cash, players.cash)`
		);
		const iso = at.toISOString();
		this.db.transaction(() => {
			for (const p of players) if (p.name) upsert.run(p.steamId, p.name, iso, p.cash ?? null);
		})();
	}

	/** Players with the highest cash balance as last seen. */
	richest(limit: number): CashRow[] {
		return this.db
			.query<CashRow, [number]>(
				`SELECT steam_id AS steamId, name, cash FROM players
				 WHERE cash > 0 ORDER BY cash DESC, name ASC LIMIT ?`
			)
			.all(limit);
	}

	recordDeltas(at: Date, server: string, deltas: StatDelta[]): void {
		if (!deltas.length) return;
		const insert = this.db.query<void, [string, string, string, number, number]>(
			'INSERT INTO stats (at, server, steam_id, kills, deaths) VALUES (?, ?, ?, ?, ?)'
		);
		const iso = at.toISOString();
		this.db.transaction(() => {
			for (const d of deltas) insert.run(iso, server, d.steamId, d.kills, d.deaths);
		})();
	}

	/** Top players by kills since `since` (all time when null); ties break by fewer deaths. */
	leaderboard(since: Date | null, limit: number): Row[] {
		return this.db
			.query<Row, [string | null, string | null, number]>(
				`SELECT s.steam_id AS steamId, COALESCE(p.name, s.steam_id) AS name,
				        SUM(s.kills) AS kills, SUM(s.deaths) AS deaths
				 FROM stats s LEFT JOIN players p ON p.steam_id = s.steam_id
				 WHERE ?1 IS NULL OR s.at >= ?2
				 GROUP BY s.steam_id
				 HAVING SUM(s.kills) > 0
				 ORDER BY kills DESC, deaths ASC, name ASC
				 LIMIT ?3`
			)
			.all(since ? since.toISOString() : null, since ? since.toISOString() : null, limit);
	}

	playerName(steamId: string): string | null {
		const row = this.db
			.query<{ name: string }, [string]>('SELECT name FROM players WHERE steam_id = ?')
			.get(steamId);
		return row ? row.name : null;
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
