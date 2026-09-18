import type { KyInstance, Options } from 'ky';
import type { ApiError } from './errors.js';
import type { FormOptions } from './forms.js';
import type { RequestTracker } from './inflight.js';
import type { ApiClientMessages } from './messages.js';
import type { ResponseDecoder } from './protocol.js';
import type { GatewayOptions } from './routing.js';
import type { SearchParamsOptions } from './search-params.js';

export type { KyInstance };
export type QueryParams = Options['searchParams'] | Record<string, unknown> | null;
export type RequestData = Record<string, string | number | boolean | undefined>;
export type RequestBody = object | null;
export interface ApiResponse<T = unknown> { code: number; data: T; msg: string }
export interface ListResponse<T = unknown> { list: T[]; total: number; page?: number; size?: number }
export interface PageResponse<T> { records: T[]; total: number; size: number; current: number; pages: number }

export type ResponseType = 'data' | 'envelope' | 'response' | 'blob' | 'text' | 'optional';

export interface CustomRequestOptions extends Omit<Options, 'prefixUrl' | 'fetch' | 'throwHttpErrors' | 'searchParams'> {
	searchParams?: QueryParams;
	showSuccessMessage?: boolean;
	showErrorMessage?: boolean;
	/** 兼容旧接口；等价于 responseType: 'response'，跳过业务解析。 */
	returnFullResponse?: boolean;
	responseType?: ResponseType;
	auth?: boolean;
	/** true 使用 `_` 作为时间戳键；字符串为自定义键名。 */
	cacheBust?: boolean | string;
	/** false 表示不解析业务协议，返回 JSON 本身。 */
	decodeResponse?: ResponseDecoder | false;
	form?: FormOptions;
	/** 单次覆盖查询参数序列化策略。 */
	searchParamsOptions?: SearchParamsOptions;
	/** 附加到上下文中的任意元数据，回调可读取（如埋点、静默标记）。 */
	meta?: Record<string, unknown>;
}

export type FullResponseRequestOptions = CustomRequestOptions & { returnFullResponse: true; responseType?: never };
export type BlobResponseRequestOptions = CustomRequestOptions & { returnFullResponse?: false; responseType: 'blob' };
export type OptionalResponseRequestOptions = CustomRequestOptions & { returnFullResponse?: false; responseType: 'optional' };
type ModeOptions<M extends ResponseType> = CustomRequestOptions & { returnFullResponse?: false; responseType: M };

export interface RequestMethod<A> {
	<T = unknown>(url: string, data: A | undefined, options: FullResponseRequestOptions | ModeOptions<'response'>): Promise<Response>;
	<T = unknown>(url: string, data: A | undefined, options: BlobResponseRequestOptions): Promise<Blob>;
	<T = unknown>(url: string, data: A | undefined, options: ModeOptions<'text'>): Promise<string>;
	<T = unknown>(url: string, data: A | undefined, options: OptionalResponseRequestOptions): Promise<T | undefined>;
	<T = unknown>(url: string, data?: A, options?: CustomRequestOptions): Promise<T>;
}

export interface UploadMethod {
	<T = unknown>(url: string, files: File | File[], data: RequestBody | undefined, options: FullResponseRequestOptions | ModeOptions<'response'>): Promise<Response>;
	<T = unknown>(url: string, files: File | File[], data: RequestBody | undefined, options: BlobResponseRequestOptions): Promise<Blob>;
	<T = unknown>(url: string, files: File | File[], data: RequestBody | undefined, options: ModeOptions<'text'>): Promise<string>;
	<T = unknown>(url: string, files: File | File[], data: RequestBody | undefined, options: OptionalResponseRequestOptions): Promise<T | undefined>;
	<T = unknown>(url: string, files: File | File[], data?: RequestBody, options?: CustomRequestOptions): Promise<T>;
}

export interface RequestContext {
	/** 解析前为调用方传入的路径，解析后为完整地址。 */
	url: string;
	options: CustomRequestOptions;
	method: string;
	meta: Record<string, unknown>;
}
export interface UnauthorizedContext extends RequestContext { source: 'http' | 'business'; error: ApiError }
export interface MessageContext extends RequestContext { level: 'success' | 'error'; message: string; error?: ApiError }
export interface ResponseObserverContext extends RequestContext { response: Response; durationMs: number }

export interface DownloadOptions extends CustomRequestOptions {
	/** 未传 filename 时从 Content-Disposition 推断，默认开启。 */
	inferFilename?: boolean;
}

export interface ApiClientOptions {
	/** 必须是绝对 HTTP(S) 地址，可包含路径前缀。 */
	baseUrl: string | (() => string);
	/** 网关映射；省略时不改写地址。路由表完全由调用方提供。 */
	gateway?: GatewayOptions;
	/** 完全接管地址解析时使用，优先于 gateway。 */
	resolveUrl?: (path: string, baseUrl: string) => string;
	fetch?: typeof globalThis.fetch;
	/** 传给底层 ky.create 的额外选项（timeout、retry 等），单次请求可覆盖。 */
	transport?: Omit<Options, 'prefixUrl' | 'fetch' | 'throwHttpErrors' | 'hooks' | 'headers' | 'searchParams'>;
	getToken?: () => string | null | undefined | Promise<string | null | undefined>;
	auth?: false | {
		headerName?: string;
		formatToken?: (token: string) => string;
		/** 默认仅向 baseUrl 同源地址发送自动鉴权头；显式请求 headers 不受此限制。 */
		allowedOrigins?: readonly string[];
	};
	getHeaders?: (context: RequestContext) => HeadersInit | Promise<HeadersInit>;
	defaults?: Omit<CustomRequestOptions, 'responseType' | 'returnFullResponse' | 'signal'>;
	decodeResponse?: ResponseDecoder | false;
	searchParams?: SearchParamsOptions;
	messages?: Partial<ApiClientMessages>;
	unauthorized?: false | { httpStatuses?: readonly number[]; businessCodes?: readonly (number | string)[] };
	onUnauthorized?: (context: UnauthorizedContext) => void | Promise<void>;
	onMessage?: (context: MessageContext) => void | Promise<void>;
	onError?: (error: ApiError, context: RequestContext) => void | Promise<void>;
	/** 请求发出前观察（地址、头已就绪），可用于日志、埋点。 */
	onRequest?: (context: RequestContext & { headers: Headers; url: string }) => void | Promise<void>;
	/** 收到响应后、解析前观察。 */
	onResponse?: (context: ResponseObserverContext) => void | Promise<void>;
	/** 会话退出期间可通过此回调阻止新请求。 */
	canRequest?: (context: RequestContext) => boolean | Promise<boolean>;
	shouldNotify?: (context: RequestContext) => boolean;
	saveFile?: (blob: Blob, filename: string) => void | Promise<void>;
	form?: FormOptions;
	/** 多客户端需要共享取消范围时显式传入；默认实例隔离。 */
	requestTracker?: RequestTracker;
}

export interface ApiClient {
	get: RequestMethod<QueryParams>;
	post: RequestMethod<RequestBody>;
	put: RequestMethod<RequestBody>;
	patch: RequestMethod<RequestBody>;
	del: RequestMethod<QueryParams>;
	/** del 的别名。 */
	delete: RequestMethod<QueryParams>;
	deleteWithData: RequestMethod<RequestBody>;
	postForm: RequestMethod<RequestBody>;
	upload: UploadMethod;
	getList<T>(url: string, params?: QueryParams, options?: CustomRequestOptions): Promise<ListResponse<T>>;
	download(url: string, params?: QueryParams, filename?: string, options?: DownloadOptions): Promise<void>;
	/** 通用入口：自行指定 method 与 ky 选项。 */
	request<T = unknown>(url: string, options: CustomRequestOptions): Promise<T>;
	resolveUrl(path: string): string;
	getAuthHeaders(url?: string): Promise<Record<string, string>>;
	abortAll(reason?: unknown): void;
	/** 基于当前配置派生新实例（浅合并；defaults、messages 深一层合并）。 */
	extend(overrides: Partial<ApiClientOptions>): ApiClient;
	readonly options: ApiClientOptions;
	/** 底层逃生接口：不执行 SDK 路由、协议、通知、鉴权或取消管理。 */
	service: KyInstance;
}
