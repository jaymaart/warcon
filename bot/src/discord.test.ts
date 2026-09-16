import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { handleInteraction, verifyInteraction } from './discord';

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
	const render = (period: string) => ({ title: `Leaderboard ${period}` });

	test('answers a ping with a pong', () => {
		expect(handleInteraction({ type: 1 }, render)).toEqual({ type: 1 });
	});

	test('a leaderboard button gets an ephemeral reply', () => {
		expect(
			handleInteraction({ type: 3, data: { custom_id: 'lb:weekly', component_type: 2 } }, render)
		).toEqual({ type: 4, data: { embeds: [{ title: 'Leaderboard weekly' }], flags: 64 } });
	});

	test('anything else is refused', () => {
		expect(handleInteraction({ type: 3, data: { custom_id: 'nope' } }, render)).toBeNull();
		expect(handleInteraction({ type: 2 }, render)).toBeNull();
		expect(handleInteraction('junk', render)).toBeNull();
	});
});
