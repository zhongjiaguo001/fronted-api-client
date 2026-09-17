export interface FormOptions {
	fileField?: string;
	filesField?: string;
	serialize?: (data: object | null | undefined) => FormData;
}

function appendValue(form: FormData, key: string, value: unknown): void {
	if (value == null) return;
	if (Array.isArray(value)) {
		for (const item of value) appendValue(form, key, item);
	} else if (value instanceof Blob) {
		form.append(key, value);
	} else {
		form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
	}
}

export function buildFormData(data?: object | null): FormData {
	const form = new FormData();
	if (data instanceof FormData) {
		data.forEach((value, key) => form.append(key, value));
	} else if (data) {
		for (const [key, value] of Object.entries(data)) appendValue(form, key, value);
	}
	return form;
}

export function buildUploadFormData(file: File | File[], data?: object | null, options: FormOptions = {}): FormData {
	const form = (options.serialize ?? buildFormData)(data);
	if (Array.isArray(file)) {
		for (const item of file) form.append(options.filesField ?? 'files', item);
	} else {
		form.append(options.fileField ?? 'file', file);
	}
	return form;
}
