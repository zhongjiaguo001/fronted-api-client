import type { Options } from 'ky';

export function mergeHeaders(...sources: Array<Options['headers']>): Headers {
	const headers = new Headers();
	for (const source of sources) {
		if (!source) continue;
		if (source instanceof Headers || Array.isArray(source)) {
			new Headers(source).forEach((value, key) => headers.set(key, value));
		} else {
			for (const [key, value] of Object.entries(source)) {
				if (value === undefined) headers.delete(key);
				else headers.set(key, value);
			}
		}
	}
	return headers;
}

export function mergeHooks(defaults: Options['hooks'], overrides: Options['hooks']): Options['hooks'] {
	return {
		beforeRequest: [...(defaults?.beforeRequest ?? []), ...(overrides?.beforeRequest ?? [])],
		afterResponse: [...(defaults?.afterResponse ?? []), ...(overrides?.afterResponse ?? [])],
		beforeRetry: [...(defaults?.beforeRetry ?? []), ...(overrides?.beforeRetry ?? [])],
		beforeError: [...(defaults?.beforeError ?? []), ...(overrides?.beforeError ?? [])],
	};
}
