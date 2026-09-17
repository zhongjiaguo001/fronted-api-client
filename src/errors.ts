export type ApiErrorKind = 'business' | 'http' | 'parse' | 'network' | 'timeout' | 'abort';

export interface ApiErrorDetails {
	kind: ApiErrorKind;
	code?: string | number;
	status?: number;
	data?: unknown;
	response?: Response;
	cause?: unknown;
}

export class ApiError extends Error {
	readonly kind: ApiErrorKind;
	readonly code?: string | number;
	readonly status?: number;
	readonly data?: unknown;
	readonly response?: Response;
	/** 兼容使用后端 msg 展示错误的调用方。 */
	readonly msg: string;
	override readonly cause?: unknown;

	constructor(message: string, details: ApiErrorDetails) {
		// 不使用 ErrorOptions，兼容 lib 低于 ES2022 的消费方。
		super(message);
		this.name = 'ApiError';
		this.msg = message;
		this.kind = details.kind;
		this.code = details.code;
		this.status = details.status;
		this.data = details.data;
		this.response = details.response;
		this.cause = details.cause;
	}
}

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;

export function normalizeError(error: unknown, signal?: AbortSignal, fallbackMessage = '网络请求失败'): ApiError {
	if (error instanceof ApiError) return error;
	const name = error instanceof Error ? error.name : '';
	const kind = signal?.aborted || name === 'AbortError' ? 'abort' : name === 'TimeoutError' ? 'timeout' : 'network';
	return new ApiError(error instanceof Error ? error.message : typeof error === 'string' ? error : fallbackMessage, {
		kind,
		cause: error,
	});
}
