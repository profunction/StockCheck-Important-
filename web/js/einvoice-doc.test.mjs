// node web/js/einvoice-doc.test.mjs -- one e-invoice for MyInvois.
import assert from 'node:assert/strict';
import { eInvoiceJson, GENERAL_PUBLIC_TIN, missing } from './einvoice-doc.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const seller = { name: 'Kedai Maju Sdn Bhd', tin: 'C21234567080', brn: '202001012345', sstNo: 'W10-1808-32000123', msic: '47111', msicName: 'Retail', address: 'No. 12, Jalan Pasar', city: 'Ipoh', postcode: '30000', state: '08', phone: '+60152418888' };
const buyer = { name: 'Restoran Ali', tin: 'IG12345678901', idType: 'NRIC', idNo: '800101085555', address: 'Jalan Besar', city: 'Ipoh', postcode: '30100', state: '08', phone: '+60123456789' };
const inv = {
  type: 'INVOICE', no: 'INV-2026-00001', contact: buyer, dueDate: Date.UTC(2026, 9, 31),
  lines: [
    { description: 'Catering', qtyMilli: 3000, unitPriceSen: 1000, discountSen: 300, taxPct: 6, taxType: '02', classCode: '022' },
    { description: 'Beras 5kg', qtyMilli: 2000, unitPriceSen: 450, taxType: 'E' },
  ],
};

test('an invoice: type 01, both parties, totals that add up', () => {
  const j = eInvoiceJson(inv, seller, { issuedAt: Date.UTC(2026, 9, 9, 4, 5, 6) }).Invoice[0];
  assert.deepEqual(j.InvoiceTypeCode, [{ _: '01', listVersionID: '1.0' }]);
  assert.equal(j.ID[0]._, 'INV-2026-00001');
  assert.equal(j.IssueTime[0]._, '04:05:06Z');
  assert.equal(j.AccountingSupplierParty[0].Party[0].PartyIdentification[0].ID[0]._, 'C21234567080');
  assert.deepEqual(j.AccountingCustomerParty[0].Party[0].PartyIdentification[1].ID[0], { _: '800101085555', schemeID: 'NRIC' });
  assert.equal(j.AccountingSupplierParty[0].Party[0].IndustryClassificationCode[0]._, '47111');
  assert.equal(j.LegalMonetaryTotal[0].TaxExclusiveAmount[0]._, 36);
  assert.equal(j.LegalMonetaryTotal[0].PayableAmount[0]._, 37.62);
  assert.equal(j.TaxTotal[0].TaxAmount[0]._, 1.62);
  assert.deepEqual(j.TaxTotal[0].TaxSubtotal.map((x) => x.TaxCategory[0].ID[0]._), ['02', 'E']);
  const l1 = j.InvoiceLine[0];
  assert.equal(l1.InvoicedQuantity[0]._, 3);
  assert.equal(l1.LineExtensionAmount[0]._, 27);
  assert.equal(l1.AllowanceCharge[0].Amount[0]._, 3);
  assert.equal(l1.ItemPriceExtension[0].Amount[0]._, 30);
  assert.equal(l1.Item[0].CommodityClassification[0].ItemClassificationCode[0].listID, 'CLASS');
  assert.equal(j.InvoiceLine[1].TaxTotal[0].TaxSubtotal[0].TaxCategory[0].TaxExemptionReason[0]._, 'Exempted goods or services');
});

test('a credit note refers to its invoice; a self-billed invoice swaps the parties', () => {
  const cn = eInvoiceJson({ ...inv, type: 'CREDIT_NOTE', no: 'CN-1', refNo: 'INV-2026-00001', refUuid: 'ABC123' }, seller).Invoice[0];
  assert.equal(cn.InvoiceTypeCode[0]._, '02');
  assert.deepEqual(cn.BillingReference[0].InvoiceDocumentReference[0], { ID: [{ _: 'INV-2026-00001' }], UUID: [{ _: 'ABC123' }] });
  const sb = eInvoiceJson({ ...inv, type: 'SELF_BILLED', no: 'SB-1' }, seller).Invoice[0];
  assert.equal(sb.InvoiceTypeCode[0]._, '11');
  assert.equal(sb.AccountingSupplierParty[0].Party[0].PartyLegalEntity[0].RegistrationName[0]._, 'Restoran Ali');
  assert.equal(sb.AccountingCustomerParty[0].Party[0].PartyLegalEntity[0].RegistrationName[0]._, 'Kedai Maju Sdn Bhd');
  assert.throws(() => eInvoiceJson({ ...inv, type: 'BILL' }, seller), /not an e-invoice/);
});

test('what is missing before LHDN would take it', () => {
  assert.deepEqual(missing(inv, seller), []);
  assert.deepEqual(missing({ ...inv, contact: { name: 'X' } }, {}).slice(0, 3), ['seller.name', 'seller.tin', 'seller.brn']);
  assert.ok(missing({ ...inv, type: 'CREDIT_NOTE' }, seller).includes('ref'));
  // A walk-in buyer with the general public TIN needs no ID number.
  assert.ok(!missing({ ...inv, contact: { ...buyer, tin: GENERAL_PUBLIC_TIN, idNo: '' } }, seller).includes('buyer.idNo'));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n', e.message); }
}
process.exit(failed ? 1 : 0);
