import { describe, expect, test } from 'bun:test';
import { createGatewayResolver, resolveApiUrl } from '../src/index.js';

const ROUTES = {
	'/mobile': '/api/webapp',
	'/sys': '/api/webapp',
	'/biz': '/api/bizapp',
	'/sample': '/api/sampleProcessing',
	'/collection': '/api/collection',
};

describe('网关路由', () => {
	test('未提供路由表时地址原样返回', () => {
		expect(createGatewayResolver()('/sys/user')).toBe('/sys/user');
		expect(createGatewayResolver({ routes: {} })('/sys/user')).toBe('/sys/user');
	});

	test('按最长前缀匹配，保留查询参数和已有网关路径', () => {
		const resolve = createGatewayResolver({ routes: ROUTES });
		expect(resolve('sys/user?q=1')).toBe('/api/webapp/sys/user?q=1');
		expect(resolve('/sys?x=1')).toBe('/api/webapp/sys?x=1');
		expect(resolve('/biz/order')).toBe('/api/bizapp/biz/order');
		expect(resolve('/collectionOther')).toBe('/collectionOther');
		expect(resolve('/api/collection/api/sse')).toBe('/api/collection/api/sse');
		expect(resolve('/api/webapp/sys/user')).toBe('/api/webapp/sys/user');
		expect(resolve('https://other.test/sys/user')).toBe('https://other.test/sys/user');
		expect(resolve('//other.test/sys')).toBe('//other.test/sys');
	});

	test('最长优先：更具体的前缀覆盖父前缀', () => {
		const resolve = createGatewayResolver({ routes: { '/sys': '/v2', '/sys/a': '/v3', '/extra': '/external' } });
		expect(resolve('/sys/a/list')).toBe('/v3/sys/a/list');
		expect(resolve('/sys/b')).toBe('/v2/sys/b');
		expect(resolve('/extra/list')).toBe('/external/extra/list');
	});

	test('bypassPrefix 支持多个，命中后剥掉前缀直连', () => {
		const resolve = createGatewayResolver({ routes: ROUTES, bypassPrefix: ['/custom', '/raw'] });
		expect(resolve('/custom/wms/open')).toBe('/wms/open');
		expect(resolve('/raw/x?a=1')).toBe('/x?a=1');
		expect(resolve('/sys/user')).toBe('/api/webapp/sys/user');
	});

	test('未配置 bypassPrefix 时不剥前缀；false 同样关闭', () => {
		expect(createGatewayResolver({ routes: ROUTES })('/custom/sys/a')).toBe('/custom/sys/a');
		expect(createGatewayResolver({ routes: ROUTES, bypassPrefix: false })('/custom/sys/a')).toBe('/custom/sys/a');
	});

	test('路由目标可为函数，按运行时条件决定前缀', () => {
		const resolve = createGatewayResolver({
			routes: { '/sys': ({ pathname }) => (pathname.startsWith('/sys/legacy') ? '/api/v1' : '/api/v2') },
		});
		expect(resolve('/sys/legacy/user')).toBe('/api/v1/sys/legacy/user');
		expect(resolve('/sys/user')).toBe('/api/v2/sys/user');
		expect(createGatewayResolver({ routes: { '/sys': () => undefined } })('/sys/a')).toBe('/sys/a');
	});

	test('统一处理绝对地址、尾部斜杠和部署路径', () => {
		expect(resolveApiUrl('https://api.test/root/', '/api/sys?a=1')).toBe('https://api.test/root/api/sys?a=1');
		expect(resolveApiUrl('https://api.test/root', 'https://other.test/a')).toBe('https://other.test/a');
		expect(resolveApiUrl('https://api.test', '//other.test/a')).toBe('https://other.test/a');
		expect(() => resolveApiUrl('https://api.test', 'file:///tmp/a')).toThrow();
	});
});
