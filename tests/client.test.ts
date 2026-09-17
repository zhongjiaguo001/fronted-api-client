import { describe, expect, test } from 'bun:test';
import { ApiError, createEnvelopeDecoder } from '../src/index.js';
import { fixture, json } from './helpers.js';

describe('完整请求链路', () => {
	test('业务错误只通知一次，保留错误体和状态', async () => {
		const { client, messages } = fixture(() => json({ code: 500, msg: '库存不足' }));
		const error = await client.get('/biz/list').catch((error: unknown) => error);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ kind: 'business', code: 500, status: 200, msg: '库存不足', data: { code: 500, msg: '库存不足' } });
		expect(messages).toEqual(['库存不足']);
	});
	test('HTTP JSON 错误和非 JSON 错误均通知一次', async () => {
		const first = fixture(() => json({ code: 403, msg: '无权限' }, 403));
		await expect(first.client.get('/sys/user')).rejects.toMatchObject({ kind: 'http', status: 403 });
		expect(first.messages).toEqual(['无权限']);
		const second = fixture(() => new Response('bad gateway', { status: 502 }));
		await expect(second.client.get('/sys/user')).rejects.toMatchObject({ kind: 'http', status: 502 });
		expect(second.messages).toHaveLength(1);
		expect(second.requests).toHaveLength(1);
	});
	test('解析错误只通知一次，optional 仅允许空响应', async () => {
		const invalid = fixture(() => new Response('not-json'));
		await expect(invalid.client.get('/sys/user', undefined, { responseType: 'optional' })).rejects.toMatchObject({ kind: 'parse' });
		expect(invalid.messages).toEqual(['响应解析失败']);
		const empty = fixture(() => new Response(null, { status: 204 }));
		expect(await empty.client.get('/sys/user', undefined, { responseType: 'optional' })).toBeUndefined();
	});
	test('单次静默和全局会话静默仍抛出错误', async () => {
		const a = fixture(() => json({ code: 500, msg: '失败' }));
		await expect(a.client.post('/biz/action', {}, { showErrorMessage: false })).rejects.toBeInstanceOf(ApiError);
		expect(a.messages).toEqual([]);
		const b = fixture(() => json({ code: 500 }), { shouldNotify: () => false });
		await expect(b.client.get('/sys/user')).rejects.toBeInstanceOf(ApiError);
		expect(b.messages).toEqual([]);
	});
	test('支持数据、业务响应体、原始响应、文本和 Blob', async () => {
		const envelope = { code: 200, data: { id: 1 }, msg: '成功' };
		const { client, messages } = fixture(() => json(envelope));
		expect(await client.get('/sys/user')).toEqual({ id: 1 });
		expect(await client.get('/sys/user', undefined, { responseType: 'envelope', showSuccessMessage: true })).toEqual(envelope);
		expect(await client.get('/sys/user', undefined, { returnFullResponse: true })).toBeInstanceOf(Response);
		expect(await client.get('/sys/user', undefined, { responseType: 'text' })).toBe(JSON.stringify(envelope));
		expect(await client.get('/sys/user', undefined, { responseType: 'blob' })).toBeInstanceOf(Blob);
		expect(messages).toEqual(['成功']);
	});
	test('支持自定义协议字段、成功码、单次解析器和禁用解析', async () => {
		const body = { status: 'OK', payload: [1], message: '完成' };
		const { client } = fixture(() => json(body), {
			decodeResponse: createEnvelopeDecoder({ codeKey: 'status', dataKey: 'payload', messageKey: 'message', successCodes: ['OK'] }),
		});
		expect(await client.get('/sys/user')).toEqual([1]);
		expect(await client.get('/sys/user', undefined, { decodeResponse: false })).toEqual(body);
		expect(await client.get('/sys/user', undefined, { decodeResponse: async () => ({ data: 42 }) })).toBe(42);
	});
	test('合并请求头和钩子，单次配置覆盖默认值', async () => {
		const order: string[] = [];
		const { client, requests } = fixture(() => json({ code: 200, data: true }), {
			defaults: { cacheBust: true, headers: { 'x-default': '1', 'x-remove': '1' }, hooks: { beforeRequest: [() => { order.push('default'); }] } },
			getHeaders: () => ({ 'x-tenant': 'tenant' }),
		});
		await client.get('/sys/user?existing=1', { page: 2, omitted: undefined }, {
			cacheBust: false, headers: { 'x-default': '2', 'x-remove': undefined }, hooks: { beforeRequest: [() => { order.push('request'); }] },
		});
		const request = requests[0];
		expect(request.url).toBe('https://api.test/api/webapp/sys/user?existing=1&page=2');
		expect(request.headers.get('x-default')).toBe('2');
		expect(request.headers.get('x-tenant')).toBe('tenant');
		expect(request.headers.has('x-remove')).toBe(false);
		expect(order).toEqual(['default', 'request']);
	});
	test('动态地址、自定义地址解析和时间戳键', async () => {
		let base = 'https://one.test';
		const { client, requests } = fixture(() => json({ code: 200 }), {
			baseUrl: () => base, resolveUrl: (path, base) => `${base}/v2${path}`, defaults: { cacheBust: 'timestamp' },
		});
		await client.get('/a');
		base = 'https://two.test';
		await client.get('/a');
		expect(new URL(requests[0].url).origin).toBe('https://one.test');
		expect(new URL(requests[1].url).origin).toBe('https://two.test');
		expect(new URL(requests[1].url).searchParams.has('timestamp')).toBe(true);
	});
	test('重试默认禁用，可针对请求显式开启', async () => {
		let attempts = 0;
		const { client } = fixture(() => ++attempts === 1 ? json({}, 503) : json({ code: 200, data: true }));
		expect(await client.get('/sys/user', undefined, { retry: { limit: 1, delay: () => 0 } })).toBe(true);
		expect(attempts).toBe(2);
	});
	test('网络错误走统一通知，禁止新请求时保持静默', async () => {
		const failed = fixture(() => { throw new TypeError('连接失败'); });
		await expect(failed.client.get('/sys/user')).rejects.toMatchObject({ kind: 'network' });
		expect(failed.messages).toEqual(['连接失败']);
		const blocked = fixture(() => json({}), { canRequest: () => false });
		await expect(blocked.client.get('/sys/user')).rejects.toMatchObject({ kind: 'abort' });
		expect(blocked.requests).toHaveLength(0);
		expect(blocked.messages).toHaveLength(0);
	});
});
