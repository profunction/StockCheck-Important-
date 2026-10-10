// node web/js/sheet.test.mjs -- reading a count sheet the way the app does.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countSheetRows, mapColumns, parseCsv, parseQuantity, parseXlsx, readCells } from './sheet.js';
import { xlsx } from './xlsx.js';

test('CSV: quotes, commas inside, semicolons, a BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('headings in three languages find their columns', () => {
  assert.deepEqual(mapColumns(['条码', '品名', '账面数量', '有效期']), { barcode: 0, name: 1, expected: 2, expiry: 3 });
  assert.deepEqual(mapColumns(['Item Code', 'Description', 'Qty On Hand']), { sku: 0, name: 1, expected: 2 });
  assert.deepEqual(mapColumns(['Kod Bar', 'Nama Barang', 'Baki Stok', 'UOM']), { barcode: 0, name: 1, unit: 3, expected: 2 });
});

test('quantities: thousands, decimals, brackets, blanks', () => {
  assert.equal(parseQuantity('1,200'), 1200000);
  assert.equal(parseQuantity(' 3.5 '), 3500);
  assert.equal(parseQuantity('(2)'), -2000);
  assert.equal(parseQuantity(''), null);
  assert.equal(parseQuantity('n/a'), null);
});

test('a count sheet: a title above the headings, a blank figure refused, an expiry read', () => {
  const cells = parseCsv('Kedai Maju stock list,,\nBarcode,Product,Expected,Expiry\n955,Milo,12,03/04/2027\n956,Sugar,,\n,Rice,4,\n\n957,Salt,0,');
  const { rows, problems } = countSheetRows(cells);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { barcode: '955', name: 'Milo', sku: '', unit: '', expected: 12000, expiresAt: Date.UTC(2027, 3, 3), line: 3 });
  assert.equal(rows[1].expected, 0);
  assert.deepEqual(problems, ['4: 956 — no expected quantity', '5: no barcode']);
  assert.deepEqual(countSheetRows(parseCsv('Name,Price\nMilo,3')).problems, ['no-barcode']);
});

test('an Excel file reads back to the same rows', async () => {
  const bytes = xlsx([{ name: 'Stock', rows: [['Barcode', 'Product', 'Expected'], ['955', 'Milo & co', 12], ['956', '白糖', 3.5]] }]);
  const cells = await parseXlsx(bytes);
  assert.deepEqual(cells.map((r) => r.map(String)), [['Barcode', 'Product', 'Expected'], ['955', 'Milo & co', '12'], ['956', '白糖', '3.5']]);
  assert.deepEqual(await readCells(bytes), cells);
  assert.deepEqual(await readCells(new TextEncoder().encode('a,b\n1,2')), [['a', 'b'], ['1', '2']]);
});

test('a compressed Excel file (what Excel itself saves) reads too', async () => {
  const { deflateRawSync } = await import('node:zlib');
  const { crc32 } = await import('./xlsx.js');
  const enc = new TextEncoder();
  const files = {
    'xl/workbook.xml': '<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Barcode</t></si><si><r><t>Ex</t></r><r><t>pected</t></r></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>955</t></is></c><c r="C2"><v>7</v></c></row></sheetData></worksheet>',
  };
  const parts = []; const central = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text); const data = deflateRawSync(raw); const nm = enc.encode(name);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(8, 8, true); lh.setUint32(14, crc32(raw), true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, nm.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(10, 8, true); ch.setUint32(16, crc32(raw), true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
    parts.push(new Uint8Array(lh.buffer), nm, data); central.push(new Uint8Array(ch.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, 4, true); end.setUint16(10, 4, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const bytes = new Uint8Array(all.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of all) { bytes.set(p, at); at += p.length; }
  const cells = await readCells(bytes);
  assert.deepEqual(cells, [['Barcode', '', 'Expected'], ['955', '', '7']]);
  assert.equal(countSheetRows(cells).rows[0].expected, 7000);
});
