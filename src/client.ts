import ky, { HTTPError } from 'ky';
import { parseContentDispositionFilename } from './download.js';
import { normalizeError } from './errors.js';
import type { ApiError } from './errors.js';
import { buildFormData, buildUploadFormData } from './forms.js';
import { createRequestTracker } from './inflight.js';
import { resolveMessages } from './messages.js';
import { mergeHeaders, mergeHooks } from './options.js';
import { createEnvelopeDecoder } from './protocol.js';
import { createHttpError, readResponse } from './response.js';
import { createGatewayResolver, resolveApiUrl } from './routing.js';
import { serializeSearchParams } from './search-params.js';
import type {
	ApiClient,
	ApiClientOptions,
	CustomRequestOptions,
	DownloadOptions,
	QueryParams,
	RequestBody,
	RequestContext,
	RequestMethod,
	UploadMethod,
} from './types.js';

/** 请求层私有选项，不透传给 ky。 */
const OWN_OPTION_KEYS: ReadonlyArray<keyof CustomRequestOptions> = [
	'showSuccessMessage', 'showErrorMessage', 'returnFullResponse', 'responseType', 'auth',
	'cacheBust', 'decodeResponse', 'form', 'searchParams', 'searchParamsOptions', 'meta',
];

const stripOwnOptions = (options: CustomRequestOptions) => {
	const transport: Record<string, unknown> = { ...options };
	for (const key of OWN_OPTION_KEYS) delete transport[key];
	return transport;
};

export function createApiClient(config: ApiClientOptions): ApiClient {
	const gateway = createGatewayResolver(config.gateway);
	const tracker = config.requestTracker ?? createRequestTracker();
	const messages = resolveMessages(config.messages);
	const decoder = config.decodeResponse ?? createEnvelopeDecoder({ messages });
	const service = ky.create({ timeout: 60000, retry: 0, ...config.transport, fetch: config.fetch });
	let unauthorizedPending: Promise<void> | undefined;

	const baseUrl = () => (typeof config.baseUrl === 'function' ? config.baseUrl() : config.baseUrl);
	const resolveUrl = (input: string) => {
		const base = baseUrl();
		const target = config.resolveUrl ? config.resolveUrl(input, base) : gateway(input);
		return resolveApiUrl(base, target, messages.invalidProtocol);
	};
	const getAuthHeaders = async (url = baseUrl()): Promise<Record<string, string>> => {
		if (config.auth === false || !config.getToken) return {};
		const auth = config.auth;
		const origins = auth?.allowedOrigins ?? [new URL(baseUrl()).origin];
		if (!origins.includes(new URL(url).origin)) return {};
		const token = await config.getToken();
		return token ? { [auth?.headerName ?? 'token']: auth?.formatToken?.(token) ?? token } : {};
	};
	const notifyError = async (error: ApiError, context: RequestContext) => {
		if (error.kind === 'abort') return;
		const policy = config.unauthorized;
		const unauthorized = policy !== false && (
			(error.kind === 'http' && (policy?.httpStatuses ?? [401]).includes(error.status ?? 0)) ||
			(error.kind === 'business' && (policy?.businessCodes ?? [401]).includes(error.code ?? ''))
		);
		if (unauthorized && config.onUnauthorized) {
			if (!unauthorizedPending) {
				unauthorizedPending = Promise.resolve()
					.then(() => config.onUnauthorized?.({ ...context, source: error.kind === 'http' ? 'http' : 'business', error }))
					.finally(() => { unauthorizedPending = undefined; });
			}
			await unauthorizedPending;
		} else if (context.options.showErrorMessage !== false && config.shouldNotify?.(context) !== false) {
			await config.onMessage?.({ ...context, level: 'error', message: error.message, error });
		}
		await config.onError?.(error, context);
	};

	const request = async (input: string, overrides: CustomRequestOptions): Promise<unknown> => {
		const options: CustomRequestOptions = {
			...config.defaults,
			...overrides,
			headers: mergeHeaders(config.defaults?.headers, overrides.headers),
			hooks: mergeHooks(config.defaults?.hooks, overrides.hooks),
			meta: { ...config.defaults?.meta, ...overrides.meta },
		};
		const tracked = tracker.track(options.signal);
		const context: RequestContext = {
			url: input,
			options,
			method: (options.method ?? 'get').toUpperCase(),
			meta: options.meta ?? {},
		};
		const startedAt = Date.now();
		try {
			tracked.signal.throwIfAborted();
			context.url = resolveUrl(input);
			if (config.canRequest && !(await config.canRequest(context))) throw new DOMException(messages.paused, 'AbortError');
			const headers = mergeHeaders(
				await config.getHeaders?.(context),
				options.auth === false ? undefined : await getAuthHeaders(context.url),
				options.headers,
			);
			const url = new URL(context.url);
			if (options.searchParams !== undefined) {
				serializeSearchParams(options.searchParams, { ...config.searchParams, ...options.searchParamsOptions })
					.forEach((value, key) => url.searchParams.append(key, value));
			}
			if (options.cacheBust && context.method === 'GET') {
				url.searchParams.set(typeof options.cacheBust === 'string' ? options.cacheBust : '_', String(Date.now()));
			}
			context.url = url.href;
			await config.onRequest?.({ ...context, headers });
			tracked.signal.throwIfAborted();
			const response = await service(url, { ...stripOwnOptions(options), headers, signal: tracked.signal });
			await config.onResponse?.({ ...context, response, durationMs: Date.now() - startedAt });
			const result = await readResponse(response, options, decoder, messages);
			tracked.signal.throwIfAborted();
			if (options.showSuccessMessage && result.message && config.shouldNotify?.(context) !== false) {
				await config.onMessage?.({ ...context, level: 'success', message: result.message });
			}
			return result.value;
		} catch (cause) {
			if (cause instanceof HTTPError) {
				await config.onResponse?.({ ...context, response: cause.response, durationMs: Date.now() - startedAt });
			}
			const error = cause instanceof HTTPError
				? await createHttpError(cause.response, options.decodeResponse ?? decoder, messages)
				: normalizeError(cause, tracked.signal, messages.networkFailed);
			await notifyError(error, context);
			throw error;
		} finally {
			tracked.cleanup();
		}
	};

	const queryMethod = (method: string): RequestMethod<QueryParams> =>
		((url: string, params?: QueryParams, options?: CustomRequestOptions) =>
			request(url, { method, searchParams: params, ...options })) as RequestMethod<QueryParams>;
	const bodyMethod = (method: string): RequestMethod<RequestBody> =>
		((url: string, data?: RequestBody, options?: CustomRequestOptions) =>
			request(url, { method, json: data, ...options })) as RequestMethod<RequestBody>;
	const get = queryMethod('get');
	const del = queryMethod('delete');

	const client: ApiClient = {
		get,
		post: bodyMethod('post'),
		put: bodyMethod('put'),
		patch: bodyMethod('patch'),
		del,
		delete: del,
		deleteWithData: bodyMethod('delete'),
		postForm: ((url: string, data?: RequestBody, options?: CustomRequestOptions) => request(url, {
			method: 'post',
			body: (options?.form?.serialize ?? config.form?.serialize ?? buildFormData)(data),
			...options,
		})) as RequestMethod<RequestBody>,
		upload: ((url: string, file: File | File[], data?: RequestBody, options?: CustomRequestOptions) => request(url, {
			method: 'post',
			body: buildUploadFormData(file, data, { ...config.form, ...options?.form }),
			...options,
		})) as UploadMethod,
		getList: (url, params, options) => get(url, params, options),
		request: (url, options) => request(url, options) as Promise<never>,
		download: async (url, params, filename, options: DownloadOptions = {}) => {
			if (!config.saveFile) throw new TypeError(messages.downloadUnsupported);
			const { inferFilename = true, ...rest } = options;
			const response: Response = await get(url, params, { ...rest, returnFullResponse: true, responseType: undefined });
			// 复用 blob 分支的业务错误拦截。
			const blob = (await readResponse(response, { ...rest, responseType: 'blob' }, decoder, messages).catch(async (error) => {
				await notifyError(error as ApiError, { url, options: rest, method: 'GET', meta: rest.meta ?? {} });
				throw error;
			})).value as Blob;
			const inferred = inferFilename ? parseContentDispositionFilename(response.headers.get('content-disposition')) : undefined;
			await config.saveFile(blob, filename || inferred || 'download');
		},
		resolveUrl,
		getAuthHeaders,
		abortAll: tracker.abortAll,
		extend: (overrides) => createApiClient({
			...config,
			...overrides,
			defaults: {
				...config.defaults,
				...overrides.defaults,
				headers: Object.fromEntries(mergeHeaders(config.defaults?.headers, overrides.defaults?.headers)),
				hooks: mergeHooks(config.defaults?.hooks, overrides.defaults?.hooks),
				meta: { ...config.defaults?.meta, ...overrides.defaults?.meta },
			},
			messages: { ...config.messages, ...overrides.messages },
			requestTracker: overrides.requestTracker ?? tracker,
		}),
		options: config,
		service,
	};
	return client;
}
