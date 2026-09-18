/** 路由目标：固定网关前缀，或按路径动态计算（返回空值表示不改写）。 */
export type GatewayTarget = string | ((match: GatewayMatchContext) => string | undefined);

/** 路径前缀 → 网关目标的映射表，由调用方提供。 */
export type GatewayRoutes = Readonly<Record<string, GatewayTarget>>;

export interface GatewayMatchContext {
	/** 用于匹配的路径部分，不含查询串。 */
	pathname: string;
	/** 调用方传入的原始路径。 */
	input: string;
}

export interface GatewayOptions {
	/** 路径前缀 → 网关前缀。库不内置任何路由；未命中时地址原样返回。 */
	routes: GatewayRoutes;
	/** 跳过网关的路径前缀，可给多个（命中后剥掉前缀直连）。false 关闭。 */
	bypassPrefix?: string | readonly string[] | false;
}

const isAbsolute = (value: string) => /^[a-z][a-z\d+.-]*:/i.test(value);
const normalizePath = (value: string) => `/${value.replace(/^\/+|\/+$/g, '')}`;
const trimTail = (value: string) => value.replace(/\/+$/, '');
const matchesPath = (pathname: string, prefix: string) =>
	pathname === prefix || pathname.startsWith(`${prefix}/`);
const toList = (value: string | readonly string[]): readonly string[] =>
	typeof value === 'string' ? [value] : value;
const byLongestFirst = (a: string, b: string) => b.length - a.length;

/**
 * 用调用方提供的路由表生成路径解析器。
 *
 * - 按最长前缀匹配；未命中路由表时地址原样返回。
 * - 目标可以是函数，按运行时条件（环境、租户）动态决定网关前缀。
 * - 地址已带网关前缀时保持幂等，不会重复追加。
 * - `bypassPrefix` 命中的路径会剥掉该前缀直接请求，不经过网关。
 */
export function createGatewayResolver(options?: GatewayOptions) {
	const entries = Object.entries(options?.routes ?? {})
		.map(([prefix, target]) => [normalizePath(prefix), target] as const)
		.sort(([a], [b]) => byLongestFirst(a, b));

	// 只有字符串目标能参与幂等预判；函数目标需要先匹配再求值。
	const fixedTargets = entries
		.map(([, target]) => (typeof target === 'string' ? trimTail(target) : ''))
		.filter((target) => target.length > 0);

	const bypasses = (options?.bypassPrefix === false
		? []
		: toList(options?.bypassPrefix ?? []).map(normalizePath)
	).sort(byLongestFirst);

	const evaluate = (target: GatewayTarget, pathname: string, input: string) =>
		trimTail(typeof target === 'function' ? target({ pathname, input }) ?? '' : target);

	return (input: string): string => {
		if (isAbsolute(input) || input.startsWith('//')) return input;
		const normalized = input.startsWith('/') ? input : `/${input}`;
		const pathname = normalized.split(/[?#]/, 1)[0];

		const bypass = bypasses.find((prefix) => matchesPath(pathname, prefix));
		if (bypass) {
			const rest = normalized.slice(bypass.length);
			return rest.startsWith('/') ? rest : `/${rest}`;
		}

		// 已带网关路径时保持幂等，避免二次调用追加前缀。
		if (fixedTargets.some((target) => matchesPath(pathname, target))) return normalized;

		const matched = entries.find(([prefix]) => matchesPath(pathname, prefix));
		if (!matched) return normalized;

		const target = evaluate(matched[1], pathname, input);
		return !target || matchesPath(pathname, target) ? normalized : `${target}${normalized}`;
	};
}

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
