import { ApiError } from './errors.js';
import type { ApiClientMessages } from './messages.js';
import { DEFAULT_MESSAGES } from './messages.js';

export interface DecodedResponse {
	data: unknown;
	message?: string;
}

export interface ResponseContext {
	response: Response;
	url: string;
}

export type ResponseDecoder = (body: unknown, context: ResponseContext) => DecodedResponse | Promise<DecodedResponse>;

export interface EnvelopeOptions {
	codeKey?: string;
	dataKey?: string;
	messageKey?: string;
	successCodes?: readonly (string | number)[];
	/** 完全自定义成功判定，优先于 successCodes。 */
	isSuccess?: (body: Record<string, unknown>, context: ResponseContext) => boolean;
	/** 自定义取数据/取文案，用于嵌套结构（如 result.items）。 */
	getData?: (body: Record<string, unknown>, context: ResponseContext) => unknown;
	getMessage?: (body: Record<string, unknown>, context: ResponseContext) => string | undefined;
	/** 缺少 codeKey 的响应是否视为裸数据直接返回；false 时抛业务错误。 */
	allowRawBody?: boolean;
	messages?: Pick<ApiClientMessages, 'businessFailed'>;
}

export function createEnvelopeDecoder(options: EnvelopeOptions = {}): ResponseDecoder {
	const {
		codeKey = 'code',
		dataKey = 'data',
		messageKey = 'msg',
		successCodes = [200],
		isSuccess,
		getData,
		getMessage,
		allowRawBody = true,
		messages = DEFAULT_MESSAGES,
	} = options;
	return (body, context) => {
		const { response } = context;
		if (typeof body !== 'object' || body === null || !(codeKey in body)) {
			if (allowRawBody) return { data: body };
			throw new ApiError(messages.businessFailed, { kind: 'business', status: response.status, data: body, response });
		}
		const record = body as Record<string, unknown>;
		const code = record[codeKey];
		const normalizedCode = typeof code === 'string' || typeof code === 'number' ? code : undefined;
		const message = getMessage
			? getMessage(record, context)
			: typeof record[messageKey] === 'string' ? (record[messageKey] as string) : undefined;
		const ok = isSuccess ? isSuccess(record, context) : normalizedCode !== undefined && successCodes.includes(normalizedCode);
		if (!ok) {
			throw new ApiError(message || messages.businessFailed, {
				kind: 'business',
				code: normalizedCode,
				status: response.status,
				data: body,
				response,
			});
		}
		return { data: getData ? getData(record, context) : record[dataKey], message };
	};
}

export const defaultDecoder = createEnvelopeDecoder();
