import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { applicationIdFromToken, handleInteraction, verifyInteraction } from './discord';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
// SPKI DER for Ed25519 is a 12-byte prefix followed by the 32 raw key bytes.
const publicKeyHex = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
	.subarray(12)
	.toString('hex');

const signed = (timestamp: string, body: string) =>
	sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');

describe('verifyInteraction', () => {
	test('accepts a valid signature', async () => {
		const body = '{"type":1}';
		const ts = '1758000000';
		expect(await verifyInteraction(publicKeyHex, signed(ts, body), ts, body)).toBe(true);
	});

	test('rejects a tampered body, timestamp or key', async () => {
		const body = '{"type":1}';
		const ts = '1758000000';
		const sig = signed(ts, body);
		expect(await verifyInteraction(publicKeyHex, sig, ts, '{"type":2}')).toBe(false);
		expect(await verifyInteraction(publicKeyHex, sig, '1758000001', body)).toBe(false);
		expect(await verifyInteraction('00'.repeat(32), sig, ts, body)).toBe(false);
		expect(await verifyInteraction(publicKeyHex, 'zz', ts, body)).toBe(false);
	});
});

describe('handleInteraction', () => {
	const handlers = {
		board: (board: string, period: string) => ({ title: `${board} ${period}` }),
		command: (name: string, options: Record<string, string>, id: string) => ({
			embed: { title: `${name} ${id} ${JSON.stringify(options)}` },
			ephemeral: name !== 'stats'
		})
	};

	test('answers a ping with a pong', () => {
		expect(handleInteraction({ type: 1 }, handlers)).toEqual({ type: 1 });
	});

	test('a leaderboard button gets an ephemeral reply', () => {
		expect(
			handleInteraction({ type: 3, data: { custom_id: 'lb:weekly', component_type: 2 } }, handlers)
		).toEqual({ type: 4, data: { embeds: [{ title: 'kills weekly' }], flags: 64 } });
		expect(
			handleInteraction({ type: 3, data: { custom_id: 'cash:all', component_type: 2 } }, handlers)
		).toEqual({ type: 4, data: { embeds: [{ title: 'cash all' }], flags: 64 } });
	});

	test('a slash command reaches the command handler with its options and user', () => {
		expect(
			handleInteraction(
				{
					type: 2,
					data: { name: 'link', options: [{ name: 'player', type: 3, value: 'Alpha' }] },
					member: { user: { id: '99' } }
				},
				handlers
			)
		).toEqual({ type: 4, data: { embeds: [{ title: 'link 99 {"player":"Alpha"}' }], flags: 64 } });
		expect(
			handleInteraction({ type: 2, data: { name: 'stats' }, user: { id: '5' } }, handlers)
		).toEqual({
			type: 4,
			data: { embeds: [{ title: 'stats 5 {}' }], flags: 0 }
		});
	});

	test('anything else is refused', () => {
		expect(handleInteraction({ type: 3, data: { custom_id: 'nope' } }, handlers)).toBeNull();
		expect(handleInteraction({ type: 2 }, handlers)).toBeNull();
		expect(handleInteraction({ type: 2, data: { name: 'stats' } }, handlers)).toBeNull();
		expect(handleInteraction('junk', handlers)).toBeNull();
	});
});

describe('applicationIdFromToken', () => {
	test('decodes the first token segment', () => {
		const id = '123456789012345678';
		expect(applicationIdFromToken(`${Buffer.from(id).toString('base64')}.abc.def`)).toBe(id);
		expect(applicationIdFromToken('nope')).toBeNull();
	});
});
