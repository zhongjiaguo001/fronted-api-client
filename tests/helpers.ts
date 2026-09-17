import { createApiClient } from '../src/index.js';
import type { ApiClientOptions } from '../src/index.js';

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
	status, headers: { 'content-type': 'application/json' },
});

export function fixture(handler: (request: Request) => Response | Promise<Response>, options: Partial<ApiClientOptions> = {}) {
	const messages: string[] = [];
	const requests: Request[] = [];
	const client = createApiClient({
		baseUrl: 'https://api.test',
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
