import { describe, expect, test } from 'bun:test';
import { newEntries, parseModeration } from './audit';
import type { AuditEntry } from './game';

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
	timestampUtc: '2026-09-15T19:00:00Z',
	peer: '10.0.0.5:51022',
	sessionId: 'abc123',
	event: 'COMMAND',
	detail: '',
	...over
});

describe('parseModeration', () => {
	test('kick with a reason', () => {
		expect(parseModeration(entry({ detail: 'kick 76561198000000001 Team killing' }))).toEqual({
			kind: 'kick',
			steamId: '76561198000000001',
			reason: 'Team killing',
			at: '2026-09-15T19:00:00Z'
		});
	});

	test('kick without a reason', () => {
		expect(parseModeration(entry({ detail: 'kick 76561198000000001' }))?.reason).toBe('');
	});

	test('ban and unban', () => {
		expect(parseModeration(entry({ detail: 'ban 76561198000000002 Cheating - aimbot' }))).toEqual({
			kind: 'ban',
			steamId: '76561198000000002',
			reason: 'Cheating - aimbot',
			at: '2026-09-15T19:00:00Z'
		});
		expect(parseModeration(entry({ detail: 'unban 76561198000000002' }))?.kind).toBe('unban');
	});

	test('case-insensitive verb', () => {
		expect(parseModeration(entry({ detail: 'KICK 1 x' }))?.kind).toBe('kick');
	});

	test('other commands and other events are ignored', () => {
		expect(parseModeration(entry({ detail: 'broadcast kick off at 8' }))).toBeNull();
		expect(parseModeration(entry({ detail: 'kill 76561198000000001' }))).toBeNull();
		expect(parseModeration(entry({ event: 'CONNECT', detail: 'kick 1' }))).toBeNull();
	});
});

describe('newEntries', () => {
	const a = entry({ timestampUtc: '2026-09-15T19:00:00Z', detail: 'kick 1' });
	const b = entry({ timestampUtc: '2026-09-15T19:00:00Z', detail: 'kick 2' });
	const c = entry({ timestampUtc: '2026-09-15T19:00:05Z', detail: 'ban 3' });

	test('without a cursor, history is skipped and the cursor lands on the newest entry', () => {
		const { fresh, cursor } = newEntries([a, b, c], null);
		expect(fresh).toEqual([]);
		expect(cursor).toEqual({
			at: '2026-09-15T19:00:05Z',
			keys: [`${c.timestampUtc}|${c.sessionId}|${c.event}|${c.detail}`]
		});
	});

	test('an empty log without a cursor yields an empty cursor', () => {
		expect(newEntries([], null)).toEqual({ fresh: [], cursor: { at: '', keys: [] } });
	});

	test('entries after the cursor are fresh', () => {
		const { cursor } = newEntries([a], null);
		const next = newEntries([a, b, c], cursor);
		expect(next.fresh).toEqual([b, c]);
		expect(next.cursor.at).toBe('2026-09-15T19:00:05Z');
	});

	test('entries already seen at the cursor timestamp are not repeated', () => {
		const { cursor } = newEntries([a, b], null);
		expect(newEntries([a, b], cursor).fresh).toEqual([]);
		expect(newEntries([b, a, c], cursor).fresh).toEqual([c]);
	});

	test('the log being trimmed does not lose the cursor', () => {
		const { cursor } = newEntries([a, b, c], null);
		expect(newEntries([], cursor)).toEqual({ fresh: [], cursor });
	});
});
