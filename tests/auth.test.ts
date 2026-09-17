import { describe, expect, test } from 'bun:test';
import { deferred, fixture, json } from './helpers.js';

describe('鉴权与并发', () => {
	test('每次读取最新 Token，支持异步获取、格式化和单次禁用', async () => {
		let token = 'first';
		const { client, requests } = fixture(() => json({ code: 200 }), {
			getToken: async () => token,
			auth: { headerName: 'Authorization', formatToken: (value) => `Bearer ${value}` },
		});
		await client.get('/sys/user');
		token = 'second';
		await client.get('/sys/user');
		await client.get('/sys/user', undefined, { auth: false });
		expect(requests.map((request) => request.headers.get('Authorization'))).toEqual(['Bearer first', 'Bearer second', null]);
		expect(await client.getAuthHeaders()).toEqual({ Authorization: 'Bearer second' });
	});
	test('绝对外部地址默认不携带 Token，可显式允许', async () => {
		const a = fixture(() => json({}), { getToken: () => 'secret' });
		await a.client.get('https://other.test/file');
		expect(a.requests[0].url).toBe('https://other.test/file');
		expect(a.requests[0].headers.has('token')).toBe(false);
		const b = fixture(() => json({}), { getToken: () => 'secret', auth: { allowedOrigins: ['https://other.test'] } });
		await b.client.get('https://other.test/file');
		expect(b.requests[0].headers.get('token')).toBe('secret');
	});
	test('并发 HTTP 与业务 401 在回调完成前合并，后续可再次触发', async () => {
		const gate = deferred<void>();
		let calls = 0;
		const { client, messages } = fixture((request) => request.url.endsWith('/http') ? json({}, 401) : json({ code: 401 }), {
			onUnauthorized: async () => { calls++; await gate.promise; },
		});
		const results = Promise.allSettled([client.get('/http'), client.get('/business')]);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(calls).toBe(1);
		gate.resolve();
		await results;
		expect(messages).toEqual([]);
		await client.get('/business').catch(() => {});
		expect(calls).toBe(2);
	});
	test('自定义失效码和不同实例互不影响', async () => {
		const calls: string[] = [];
		const first = fixture(() => json({ code: 419 }), { unauthorized: { businessCodes: [419] }, onUnauthorized: ({ source }) => { calls.push(`a:${source}`); } });
		const second = fixture(() => json({}, 403), { unauthorized: { httpStatuses: [403] }, onUnauthorized: ({ source }) => { calls.push(`b:${source}`); } });
		await Promise.allSettled([first.client.get('/a'), second.client.get('/b')]);
		expect(calls.sort()).toEqual(['a:business', 'b:http']);
	});
	test('取消覆盖响应体读取，且不影响其他实例', async () => {
		const started = deferred<void>();
		const body = deferred<void>();
		const a = fixture(() => new Response(new ReadableStream({
			async start(controller) {
				controller.enqueue(new TextEncoder().encode('{"code":200,"data":'));
				started.resolve();
				await body.promise;
				controller.enqueue(new TextEncoder().encode('1}'));
				controller.close();
			},
		})));
		const b = fixture(() => json({ code: 200, data: 2 }));
		const pending = a.client.get('/a').catch((error: unknown) => error);
		await started.promise;
		a.client.abortAll();
		body.resolve();
		expect(await pending).toMatchObject({ kind: 'abort' });
		expect(await b.client.get('/b')).toBe(2);
		expect(a.messages).toEqual([]);
	});
	test('已取消的上游 signal 不发送请求', async () => {
		const { client, requests, messages } = fixture(() => json({}));
		const controller = new AbortController();
		controller.abort();
		await expect(client.get('/a', undefined, { signal: controller.signal })).rejects.toMatchObject({ kind: 'abort' });
		expect(requests).toHaveLength(0);
		expect(messages).toHaveLength(0);
	});
});
