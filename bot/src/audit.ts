// Kicks and bans from the listener's audit log (GET /v1/audit), which records every COMMAND from
// every admin tool. Entries carry no id, so the cursor is the newest timestamp plus the keys of
// the entries seen at that timestamp.
import type { AuditEntry } from './game';

export type ModerationKind = 'kick' | 'ban' | 'unban';

export interface ModerationEvent {
	kind: ModerationKind;
	steamId: string;
	reason: string;
	at: string;
}

const MODERATION = /^(kick|ban|unban)\s+(\S+)\s*(.*)$/i;

export function parseModeration(entry: AuditEntry): ModerationEvent | null {
	if (entry.event !== 'COMMAND') return null;
	const m = MODERATION.exec(entry.detail.trim());
	if (!m) return null;
	return {
		kind: m[1]!.toLowerCase() as ModerationKind,
		steamId: m[2]!,
		reason: (m[3] ?? '').trim(),
		at: entry.timestampUtc
	};
}

export interface AuditCursor {
	at: string;
	keys: string[];
}

export const entryKey = (e: AuditEntry): string =>
	`${e.timestampUtc}|${e.sessionId}|${e.event}|${e.detail}`;

/**
 * Entries newer than the cursor, oldest first, and the cursor to store. Without a cursor (first
 * run) nothing is fresh: history is not replayed into the channel.
 */
export function newEntries(
	entries: AuditEntry[],
	cursor: AuditCursor | null
): { fresh: AuditEntry[]; cursor: AuditCursor } {
	const sorted = [...entries].sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));
	const newest = sorted[sorted.length - 1];
	if (!newest) return { fresh: [], cursor: cursor ?? { at: '', keys: [] } };
	const next: AuditCursor = {
		at: newest.timestampUtc,
		keys: sorted.filter((e) => e.timestampUtc === newest.timestampUtc).map(entryKey)
	};
	if (!cursor) return { fresh: [], cursor: next };
	if (newest.timestampUtc < cursor.at) return { fresh: [], cursor };
	const seen = new Set(cursor.keys);
	const fresh = sorted.filter(
		(e) => e.timestampUtc > cursor.at || (e.timestampUtc === cursor.at && !seen.has(entryKey(e)))
	);
	if (newest.timestampUtc === cursor.at) next.keys = [...new Set([...cursor.keys, ...next.keys])];
	return { fresh, cursor: next };
}
