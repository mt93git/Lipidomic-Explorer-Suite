import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { UploadDataset } from './UploadDataset';
it('offers an Excel workbook dialog', () => {
 const html = renderToStaticMarkup(createElement(UploadDataset, { onUploaded() {}, onCancel() {} }));
 expect(html).toContain('Upload an Excel workbook');
 expect(html).toContain('role="dialog"');
 expect(html).toContain('<dialog');
 expect(html).toContain('.xlsx,.xls');
 expect(html).toContain('Cancel');
});
