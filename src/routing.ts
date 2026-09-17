export type GatewayRoutes = Readonly<Record<string, string>>;

export const DEFAULT_GATEWAY_ROUTES: GatewayRoutes = Object.freeze({
	'/mobile': '/api/webapp',
	'/sys': '/api/webapp',
	'/auth': '/api/webapp',
	'/client': '/api/webapp',
	'/dev': '/api/webapp',
	'/gen': '/api/webapp',
	'/biz': '/api/bizapp',
	'/sample': '/api/sampleProcessing',
	'/collection': '/api/collection',
	'/scheduling': '/api/schedulingsystem',
	'/schedulingsystem': '/api/schedulingsystem',
	'/message': '/api/messageCenter',
});

export interface GatewayOptions {
	/** 自定义映射默认与内置映射合并。 */
	routes?: GatewayRoutes;
	useDefaultRoutes?: boolean;
	/** false 表示禁用跳过网关的路径标记。 */
	bypassPrefix?: string | false;
}

const isAbsolute = (value: string) => /^[a-z][a-z\d+.-]*:/i.test(value);
const normalizePath = (value: string) => `/${value.replace(/^\/+|\/+$/g, '')}`;
const matchesPath = (pathname: string, prefix: string) =>
	pathname === prefix || pathname.startsWith(`${prefix}/`);

export function createGatewayResolver(options: GatewayOptions | false = {}) {
	const config = options === false ? { useDefaultRoutes: false, bypassPrefix: false as const } : options;
	const routes = Object.entries({
		...(config.useDefaultRoutes === false ? {} : DEFAULT_GATEWAY_ROUTES),
		...config.routes,
	})
		.map(([prefix, target]) => [normalizePath(prefix), target.replace(/\/+$/, '')] as const)
		.sort(([a], [b]) => b.length - a.length);
	const bypass = config.bypassPrefix === false ? undefined : normalizePath(config.bypassPrefix ?? '/custom');

	return (input: string): string => {
		if (isAbsolute(input) || input.startsWith('//')) return input;
		const normalized = input.startsWith('/') ? input : `/${input}`;
		const pathname = normalized.split(/[?#]/, 1)[0];
		if (bypass && matchesPath(pathname, bypass)) {
			const rest = normalized.slice(bypass.length);
			return rest.startsWith('/') ? rest : `/${rest}`;
		}
		// 已带网关路径时保持幂等，避免二次调用追加前缀。
		if (routes.some(([, target]) => target && matchesPath(pathname, target))) return normalized;
		const match = routes.find(([prefix]) => matchesPath(pathname, prefix));
		return match ? `${match[1]}${normalized}` : normalized;
	};
}

export const convertUrl = createGatewayResolver();

/** 相对路径追加到 baseUrl 路径后；绝对 HTTP(S) 地址保持不变。 */
export function resolveApiUrl(baseUrl: string, input: string, invalidProtocolMessage = '请求地址必须使用 HTTP 或 HTTPS'): string {
	const base = new URL(baseUrl);
	const resolved = isAbsolute(input) || input.startsWith('//')
		? new URL(input, base)
		: new URL(input.replace(/^\/+/, ''), `${base.href.replace(/\/+$/, '')}/`);
	if (!['http:', 'https:'].includes(resolved.protocol)) {
		throw new TypeError(invalidProtocolMessage);
	}
	return resolved.href;
}

export const join = (prefix: string, segment: string) =>
	`${prefix.replace(/\/+$/, '')}/${segment.replace(/^\/+/, '')}`;
export const path = (prefix: string) => (segment: string) => join(prefix, segment);
