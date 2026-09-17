export function createRequestTracker() {
	const controllers = new Set<AbortController>();
	const track = (source?: AbortSignal | null) => {
		const controller = new AbortController();
		controllers.add(controller);
		const abort = () => controller.abort(source?.reason);
		if (source?.aborted) abort();
		else source?.addEventListener('abort', abort, { once: true });
		return {
			signal: controller.signal,
			cleanup: () => {
				source?.removeEventListener('abort', abort);
				controllers.delete(controller);
			},
		};
	};
	const abortAll = (reason: unknown = new DOMException('请求已取消', 'AbortError')) => {
		for (const controller of controllers) controller.abort(reason);
		controllers.clear();
	};
	return { track, abortAll };
}

export type RequestTracker = ReturnType<typeof createRequestTracker>;
