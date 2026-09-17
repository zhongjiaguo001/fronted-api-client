import { describe, expect, test } from 'bun:test';
import { createEnvelopeDecoder, parseContentDispositionFilename, serializeSearchParams } from '../src/index.js';
import { fixture, json } from './helpers.js';

describe('可定制项', () => {
	test('自定义文案覆盖内置提示', async () => {
		const { client, messages } = fixture(() => json({ code: 500 }), { messages: { businessFailed: 'Operation failed' } });
		await expect(client.get('/a')).rejects.toMatchObject({ msg: 'Operation failed' });
		expect(messages).toEqual(['Operation failed']);
		const http = fixture(() => new Response('x', { status: 502 }), { messages: { httpFailed: (s) => `HTTP ${s}` } });
		await expect(http.client.get('/a')).rejects.toMatchObject({ msg: 'HTTP 502' });
	});
	test('信封解码支持 isSuccess / getData / getMessage 与禁止裸响应', async () => {
		const decoder = createEnvelopeDecoder({
			codeKey: 'success',
			isSuccess: (body) => body.success === true,
			getData: (body) => (body.result as { items: unknown }).items,
			getMessage: (body) => body.tip as string,
		});
		const { client } = fixture(() => json({ success: true, result: { items: [1, 2] }, tip: 'ok' }), { decodeResponse: decoder });
		expect(await client.get('/a')).toEqual([1, 2]);
		const strict = fixture(() => json({ foo: 1 }), { decodeResponse: createEnvelopeDecoder({ allowRawBody: false }) });
		await expect(strict.client.get('/a')).rejects.toMatchObject({ kind: 'business' });
	});
	test('查询参数序列化策略', () => {
		const params = { ids: [1, 2], n: null, u: undefined, d: new Date(0), o: { a: 1 } };
		expect(serializeSearchParams(params).toString()).toBe('ids=1%2C2&d=1970-01-01T00%3A00%3A00.000Z&o=%7B%22a%22%3A1%7D');
		expect(serializeSearchParams({ ids: [1, 2] }, { arrayFormat: 'repeat' }).toString()).toBe('ids=1&ids=2');
		expect(serializeSearchParams({ ids: [1, 2] }, { arrayFormat: 'brackets' }).toString()).toBe('ids%5B%5D=1&ids%5B%5D=2');
		expect(serializeSearchParams({ ids: [1] }, { arrayFormat: 'indices' }).toString()).toBe('ids%5B0%5D=1');
		expect(serializeSearchParams({ n: null }, { skipNull: false }).toString()).toBe('n=null');
	});
	test('客户端级与单次级查询参数策略', async () => {
		const { client, requests } = fixture(() => json({ code: 200 }), { searchParams: { arrayFormat: 'repeat' } });
		await client.get('/a', { ids: [1, 2] });
		await client.get('/a', { ids: [1, 2] }, { searchParamsOptions: { arrayFormat: 'comma' } });
		expect(new URL(requests[0].url).search).toBe('?ids=1&ids=2');
		expect(new URL(requests[1].url).search).toBe('?ids=1%2C2');
	});
	test('onRequest / onResponse 观察钩子与 meta 透传', async () => {
		const log: string[] = [];
		const { client } = fixture(() => json({ code: 200, data: 1 }), {
			defaults: { meta: { trace: 'default' } },
			onRequest: ({ method, url, meta, headers }) => { log.push(`req ${method} ${new URL(url).pathname} ${meta.trace} ${headers.get('x-a')}`); },
			onResponse: ({ response, durationMs }) => { log.push(`res ${response.status} ${durationMs >= 0}`); },
		});
		await client.post('/sys/a', {}, { meta: { trace: 't1' }, headers: { 'x-a': '1' } });
		expect(log).toEqual(['req POST /api/webapp/sys/a t1 1', 'res 200 true']);
	});
	test('transport 传递给 ky，单次可覆盖', async () => {
		let attempts = 0;
		const { client } = fixture(() => (++attempts < 3 ? json({}, 503) : json({ code: 200, data: true })), {
			transport: { retry: { limit: 2, delay: () => 0 } },
		});
		expect(await client.get('/a')).toBe(true);
		expect(attempts).toBe(3);
	});
	test('extend 派生实例合并 defaults 与文案并共享取消范围', async () => {
		const base = fixture(() => json({ code: 500 }), { defaults: { headers: { 'x-base': '1' } }, messages: { businessFailed: 'base' } });
		const derived = base.client.extend({ defaults: { headers: { 'x-derived': '1' } }, onMessage: ({ message }) => { base.messages.push(`derived:${message}`); } });
		await derived.get('/a').catch(() => {});
		expect(base.requests[0].headers.get('x-base')).toBe('1');
		expect(base.requests[0].headers.get('x-derived')).toBe('1');
		expect(base.messages).toEqual(['derived:base']);
	});
	test('通用 request 与 delete 别名', async () => {
		const { client, requests } = fixture(() => json({ code: 200, data: 'ok' }));
		expect(await client.request('/a', { method: 'options' })).toBe('ok');
		await client.delete('/b', { id: 1 });
		expect(requests.map((r) => r.method)).toEqual(['OPTIONS', 'DELETE']);
	});
	test('下载推断文件名', async () => {
		const saved: string[] = [];
		const { client } = fixture(() => new Response('data', { headers: { 'content-disposition': "attachment; filename*=UTF-8''%E6%8A%A5%E8%A1%A8.csv" } }), {
			saveFile: async (_blob, name) => { saved.push(name); },
		});
		await client.download('/export');
		await client.download('/export', undefined, 'given.csv');
		await client.download('/export', undefined, undefined, { inferFilename: false });
		expect(saved).toEqual(['报表.csv', 'given.csv', 'download']);
		expect(parseContentDispositionFilename('attachment; filename="a b.xlsx"')).toBe('a b.xlsx');
		expect(parseContentDispositionFilename(null)).toBeUndefined();
	});
});
