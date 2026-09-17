import { describe, expect, test } from 'bun:test';
import { convertUrl, createGatewayResolver, resolveApiUrl } from '../src/index.js';

describe('网关路由', () => {
	test('匹配路径段，保留查询参数和已有网关路径', () => {
		expect(convertUrl('sys/user?q=1')).toBe('/api/webapp/sys/user?q=1');
		expect(convertUrl('/sys?x=1')).toBe('/api/webapp/sys?x=1');
		expect(convertUrl('/collectionOther')).toBe('/collectionOther');
		expect(convertUrl('/api/collection/api/sse')).toBe('/api/collection/api/sse');
		expect(convertUrl('/custom/wms/open')).toBe('/wms/open');
		expect(convertUrl('https://other.test/sys/user')).toBe('https://other.test/sys/user');
	});
	test('支持覆盖、扩展、最长匹配和禁用', () => {
		const resolve = createGatewayResolver({ routes: { '/sys': '/v2', '/sys/a': '/v3', '/extra': '/external' } });
		expect(resolve('/sys/a/list')).toBe('/v3/sys/a/list');
		expect(resolve('/sys/b')).toBe('/v2/sys/b');
		expect(resolve('/extra/list')).toBe('/external/extra/list');
		expect(resolve('/biz/list')).toBe('/api/bizapp/biz/list');
		expect(createGatewayResolver(false)('/custom/sys/a')).toBe('/custom/sys/a');
		expect(createGatewayResolver({ useDefaultRoutes: false })('/sys/a')).toBe('/sys/a');
	});
	test('统一处理绝对地址、尾部斜杠和部署路径', () => {
		expect(resolveApiUrl('https://api.test/root/', '/api/sys?a=1')).toBe('https://api.test/root/api/sys?a=1');
		expect(resolveApiUrl('https://api.test/root', 'https://other.test/a')).toBe('https://other.test/a');
		expect(resolveApiUrl('https://api.test', '//other.test/a')).toBe('https://other.test/a');
		expect(() => resolveApiUrl('https://api.test', 'file:///tmp/a')).toThrow();
	});
});
