/** 从 Content-Disposition 中解析文件名，优先 RFC 5987 的 filename*。 */
export function parseContentDispositionFilename(header: string | null | undefined): string | undefined {
	if (!header) return undefined;
	const encoded = /filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/.exec(header);
	if (encoded?.[1]) {
		try {
			return decodeURIComponent(encoded[1].trim());
		} catch {
			// 非法编码时退回普通 filename
		}
	}
	const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header);
	return plain?.[1]?.trim() || undefined;
}
