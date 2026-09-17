import type { QueryParams } from './types.js';

export type ArrayFormat = 'comma' | 'repeat' | 'brackets' | 'indices';

export interface SearchParamsOptions {
	/** 数组参数的编码方式，默认 comma（a=1,2）。 */
	arrayFormat?: ArrayFormat;
	/** 是否跳过 null（undefined 始终跳过），默认跳过。 */
	skipNull?: boolean;
	/** 完全自定义序列化，优先于以上选项。 */
	serialize?: (params: QueryParams) => URLSearchParams;
}

const appendArray = (target: URLSearchParams, key: string, values: unknown[], format: ArrayFormat) => {
	const items = values.filter((item) => item !== undefined && item !== null);
	if (items.length === 0) return;
	switch (format) {
		case 'comma':
			target.append(key, items.map(String).join(','));
			break;
		case 'repeat':
			for (const item of items) target.append(key, String(item));
			break;
		case 'brackets':
			for (const item of items) target.append(`${key}[]`, String(item));
			break;
		case 'indices':
			items.forEach((item, index) => target.append(`${key}[${index}]`, String(item)));
			break;
	}
};

export function serializeSearchParams(params: QueryParams, options: SearchParamsOptions = {}): URLSearchParams {
	if (params === undefined || params === null) return new URLSearchParams();
	if (options.serialize) return options.serialize(params);
	if (params instanceof URLSearchParams) return new URLSearchParams(params);
	if (typeof params === 'string' || Array.isArray(params)) return new URLSearchParams(params as string | string[][]);
	const target = new URLSearchParams();
	const { arrayFormat = 'comma', skipNull = true } = options;
	for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
		if (value === undefined || (skipNull && value === null)) continue;
		if (Array.isArray(value)) appendArray(target, key, value, arrayFormat);
		else if (value instanceof Date) target.append(key, value.toISOString());
		else if (typeof value === 'object' && value !== null) target.append(key, JSON.stringify(value));
		else target.append(key, String(value));
	}
	return target;
}
