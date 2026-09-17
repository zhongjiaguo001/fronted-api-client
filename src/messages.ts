/** 可覆盖的内置文案，便于多语言或统一措辞。 */
export interface ApiClientMessages {
	businessFailed: string;
	networkFailed: string;
	parseFailed: string;
	aborted: string;
	paused: string;
	downloadUnsupported: string;
	invalidProtocol: string;
	httpFailed: (status: number) => string;
}

export const DEFAULT_MESSAGES: ApiClientMessages = {
	businessFailed: '操作失败',
	networkFailed: '网络请求失败',
	parseFailed: '响应解析失败',
	aborted: '请求已取消',
	paused: '请求已暂停',
	downloadUnsupported: '下载文件需要配置 saveFile 适配器',
	invalidProtocol: '请求地址必须使用 HTTP 或 HTTPS',
	httpFailed: (status) => `请求失败（HTTP ${status}）`,
};

export const resolveMessages = (overrides?: Partial<ApiClientMessages>): ApiClientMessages => ({
	...DEFAULT_MESSAGES,
	...overrides,
});
