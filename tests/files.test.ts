import { describe, expect, test } from 'bun:test';
import { fixture, json } from './helpers.js';

describe('表单与下载适配', () => {
	test('自定义上传字段，并保留文件和附加表单的序列化', async () => {
		let captured: FormData | undefined;
		const { client } = fixture(async (request) => {
			captured = await request.formData();
			return json({ code: 200 });
		}, { form: { filesField: 'attachments' } });
		await client.upload('/biz/upload', [new File(['hello'], 'a.txt')], { tags: ['a', 'b'], metadata: { id: 1 } });
		expect(captured?.get('attachments')).toBeInstanceOf(File);
		expect(captured?.getAll('tags')).toEqual(['a', 'b']);
		expect(captured?.get('metadata')).toBe('{"id":1}');
	});
	test('单次自定义表单序列化', async () => {
		let captured: FormData | undefined;
		const { client } = fixture(async (request) => { captured = await request.formData(); return json({ code: 200 }); });
		await client.postForm('/biz/form', { id: 1 }, { form: { serialize: (data) => {
			const form = new FormData();
			form.set('payload', JSON.stringify(data));
			return form;
		} } });
		expect(captured?.get('payload')).toBe('{"id":1}');
	});
	test('下载错误 JSON 不保存，成功二进制交给适配器', async () => {
		const saved: string[] = [];
		const { client, messages } = fixture((request) => request.url.endsWith('/bad')
			? json({ code: 500, msg: '导出失败' }) : new Response('file-data'), {
			saveFile: async (blob, name) => { saved.push(`${name}:${await blob.text()}`); },
		});
		await expect(client.download('/bad')).rejects.toMatchObject({ kind: 'business' });
		expect(saved).toEqual([]);
		expect(messages).toEqual(['导出失败']);
		await client.download('/good', undefined, 'report.csv');
		expect(saved).toEqual(['report.csv:file-data']);
	});
});
