import { ApiError } from './errors.js';
import type { ApiClientMessages } from './messages.js';
import { DEFAULT_MESSAGES } from './messages.js';
import { defaultDecoder } from './protocol.js';
import type { ResponseDecoder } from './protocol.js';
import type { CustomRequestOptions } from './types.js';

async function parseJson(response: Response, options: CustomRequestOptions, messages: ApiClientMessages): Promise<unknown> {
	const text = await response.text();
	if (!text.trim() && options.responseType === 'optional') return undefined;
	try {
		return options.parseJson ? options.parseJson(text) : JSON.parse(text);
	} catch (cause) {
		throw new ApiError(messages.parseFailed, { kind: 'parse', status: response.status, response, cause });
	}
}

export async function readResponse(
	response: Response,
	options: CustomRequestOptions,
	decoder: ResponseDecoder | false = defaultDecoder,
	messages: ApiClientMessages = DEFAULT_MESSAGES,
): Promise<{ value: unknown; message?: string }> {
	if (options.returnFullResponse || options.responseType === 'response') return { value: response };
	if (options.responseType === 'text') return { value: await response.text() };
	const decode = options.decodeResponse ?? decoder;
	if (options.responseType === 'blob') {
		// 导出接口可能以 HTTP 200 返回 JSON 业务错误，确认成功后才交给保存适配器。
		if (decode && /\bjson\b/i.test(response.headers.get('content-type') ?? '')) {
			await decode(await parseJson(response.clone(), options, messages), { response, url: response.url });
		}
		return { value: await response.blob() };
	}
	const body = await parseJson(response, options, messages);
	const decoded = decode ? await decode(body, { response, url: response.url }) : { data: body };
	return { value: options.responseType === 'envelope' ? body : decoded.data, message: decoded.message };
}

export async function createHttpError(
	response: Response,
	decoder: ResponseDecoder | false,
	messages: ApiClientMessages = DEFAULT_MESSAGES,
): Promise<ApiError> {
	const body: unknown = await response.clone().json().catch(() => undefined);
	let businessError: ApiError | undefined;
	if (decoder && body !== undefined) {
		try {
			await decoder(body, { response, url: response.url });
		} catch (error) {
			if (error instanceof ApiError) businessError = error;
		}
	}
	return new ApiError(businessError?.message ?? messages.httpFailed(response.status), {
		kind: 'http', status: response.status, code: businessError?.code, data: body, response,
	});
}
