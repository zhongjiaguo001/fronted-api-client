import { createApiClient } from '../src/index.js';
import type { ApiClientOptions } from '../src/index.js';

/** 库不再内置路由，测试用例自行声明需要网关映射的前缀。 */
export const TEST_GATEWAY_ROUTES = {
	'/mobile': '/api/webapp',
	'/sys': '/api/webapp',
	'/biz': '/api/bizapp',
	'/collection': '/api/collection',
} as const;

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
	status, headers: { 'content-type': 'application/json' },
});

export function fixture(handler: (request: Request) => Response | Promise<Response>, options: Partial<ApiClientOptions> = {}) {
	const messages: string[] = [];
	const requests: Request[] = [];
	const client = createApiClient({
		baseUrl: 'https://api.test',
		gateway: { routes: TEST_GATEWAY_ROUTES },
		onMessage: ({ message }) => { messages.push(message); },
		fetch: (async (input, init) => {
			const request = new Request(input, init);
			requests.push(request);
			return handler(request);
		}) as typeof fetch,
		...options,
	});
	return { client, messages, requests };
}

export function deferred<T>() {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((done) => { resolve = done; });
	return { promise, resolve };
}
