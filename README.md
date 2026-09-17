# @snowy/api-client

基于 [ky](https://github.com/sindresorhus/ky) 的统一后端请求客户端。把「网关前缀路由、`code/data/msg` 信封解码、Token 注入、在途请求取消、成功/失败提示」做成可配置内核，把「弹窗、跳登录、Tauri fetch、文件保存」等平台细节留给调用方通过回调注入。

## 安装

```bash
bun add @snowy/api-client ky
# 本地联调（同级目录）
bun add @snowy/api-client@link:../snowy-api-client
```

## 快速开始

```ts
import { createApiClient } from '@snowy/api-client';

export const client = createApiClient({
	baseUrl: () => import.meta.env.PUBLIC_API_URL,
	getToken: () => store.get(tokenAtom),
	defaults: { cacheBust: true },
	onMessage: ({ level, message }) => toast[level](message),
	onUnauthorized: ({ source }) => (source === 'http' ? redirectToLogin() : showReloginModal()),
	saveFile: (blob, name) => downloadBlob(blob, name),
});

const user = await client.get<User>('/sys/user/detail', { id: 1 });
await client.post('/biz/order', { sku: 'A' }, { showSuccessMessage: true });
await client.download('/biz/order/export', { month: '2026-09' }); // 文件名可从 Content-Disposition 推断
```

`/sys/...` 会按内置网关表映射为 `/api/webapp/sys/...`；`/custom/x` 会跳过网关直接请求 `/x`。

## 配置项一览（`ApiClientOptions`）

| 分组 | 选项 | 说明 |
| --- | --- | --- |
| 地址 | `baseUrl` | 绝对 HTTP(S) 地址或返回地址的函数（每次请求重新读取） |
| | `gateway` | `{ routes, useDefaultRoutes, bypassPrefix }` 覆盖/扩展网关映射；`false` 关闭 |
| | `resolveUrl(path, base)` | 完全接管路径解析，优先于 `gateway` |
| 传输 | `fetch` | 自定义 fetch（浏览器 / Tauri plugin-http / 测试桩） |
| | `transport` | 透传给 `ky.create` 的选项：`timeout`、`retry` 等，单次可覆盖 |
| | `defaults` | 所有请求的默认 `CustomRequestOptions`（headers、hooks、cacheBust、meta…） |
| 鉴权 | `getToken` | 同步或异步取 Token |
| | `auth` | `{ headerName, formatToken, allowedOrigins }`；默认头名 `token`，仅向 baseUrl 同源发送 |
| | `getHeaders(ctx)` | 每次请求追加的动态头（租户、语言、traceId…） |
| 协议 | `decodeResponse` | 响应解码器，见 `createEnvelopeDecoder`；`false` 返回原始 JSON |
| | `searchParams` | `{ arrayFormat: 'comma' \| 'repeat' \| 'brackets' \| 'indices', skipNull, serialize }` |
| | `form` | `{ fileField, filesField, serialize }` 上传表单字段名与序列化 |
| | `messages` | 覆盖内置文案（`businessFailed`、`networkFailed`、`parseFailed`、`httpFailed(status)` 等） |
| 会话 | `unauthorized` | `{ httpStatuses: [401], businessCodes: [401] }` 定义失效判定；`false` 关闭 |
| | `onUnauthorized(ctx)` | 失效处理；并发触发时合并为一次，`ctx.source` 区分 `http` / `business` |
| | `canRequest(ctx)` | 返回 `false` 时以 `abort` 错误拒绝新请求（登出过渡期） |
| | `requestTracker` | 传入共享的 `createRequestTracker()` 让多个实例一起 `abortAll` |
| 反馈 | `onMessage({ level, message })` | 成功/错误提示出口 |
| | `shouldNotify(ctx)` | 全局静默开关 |
| | `onError(error, ctx)` | 所有失败的兜底观察 |
| | `onRequest` / `onResponse` | 发出前 / 收到后观察（日志、埋点、耗时） |
| 文件 | `saveFile(blob, name)` | `download()` 的保存适配器 |

### 单次请求选项（`CustomRequestOptions`）

在 ky 选项之上增加：`showSuccessMessage`、`showErrorMessage`、`responseType`（`data` | `envelope` | `response` | `blob` | `text` | `optional`）、`returnFullResponse`、`auth: false`、`cacheBust`、`decodeResponse`、`form`、`searchParamsOptions`、`meta`。

### 信封解码器

```ts
createEnvelopeDecoder({
	codeKey: 'status', dataKey: 'payload', messageKey: 'message', successCodes: ['OK'],
	// 或完全自定义
	isSuccess: (body) => body.success === true,
	getData: (body) => body.result.items,
	allowRawBody: false, // 缺少 code 字段即视为业务错误
});
```

### 错误模型

所有失败统一抛出 `ApiError`，`kind` 取值 `business | http | parse | network | timeout | abort`，附带 `code`、`status`、`data`（原始响应体）、`response`、`msg`（等于 `message`，兼容旧调用方）。

### 派生实例

```ts
const silent = client.extend({ shouldNotify: () => false });
const v2 = client.extend({ gateway: { routes: { '/sys': '/api/v2' } } });
```

## 开发

```bash
bun install
bun test
bun run build
```
