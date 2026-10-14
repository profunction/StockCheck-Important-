/**
 * One e-invoice document for LHDN MyInvois, in its UBL 2.1 JSON form
 * (document version 1.0): an invoice, credit note, debit note, refund note
 * or self-billed invoice made in JSOX Books. The monthly consolidated
 * e-invoice from the till is sst.js; this is for a named buyer.
 *
 * Pure: tested in einvoice-doc.test.mjs. The same JSON is what the books
 * download for the MyInvois portal and what the API submits (api/).
 *
 * [doc]: a books document (books.js), its lines in sen and thousandths.
 * [seller]: the company (name, tin, brn, sstNo, ttxNo, msic, msicName,
 * address, city, postcode, state, phone, email). The buyer is doc.contact.
 */
import { DOC_TYPES, docTotals, lineTotals } from './books.js';

export const GENERAL_PUBLIC_TIN = 'EI00000000010';
export const FOREIGN_BUYER_TIN = 'EI00000000020';
/** LHDN's classification for goods and services not otherwise listed. */
export const DEFAULT_CLASS = '022';

const amt = (sen) => Math.round(sen) / 100;
const money = (sen) => [{ _: amt(sen), currencyID: 'MYR' }];
const v = (x) => [{ _: x }];
const ymd = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);

/** What an e-invoice still lacks before LHDN would take it: a list of field keys. */
export function missing(doc, seller) {
  const out = [];
  for (const [k, ok] of [
    ['seller.name', seller?.name], ['seller.tin', seller?.tin], ['seller.brn', seller?.brn], ['seller.msic', seller?.msic],
    ['seller.address', seller?.address], ['seller.phone', seller?.phone],
    ['buyer.name', doc.contact?.name], ['buyer.tin', doc.contact?.tin], ['buyer.idNo', doc.contact?.idNo || doc.contact?.tin === GENERAL_PUBLIC_TIN],
    ['buyer.address', doc.contact?.address], ['buyer.phone', doc.contact?.phone],
    ['lines', doc.lines?.length],
  ]) if (!ok) out.push(k);
  if (DOC_TYPES[doc.type]?.sign < 0 || doc.type === 'DEBIT_NOTE') if (!doc.refNo) out.push('ref');
  return out;
}

const party = (p, { msic = false } = {}) => [{ Party: [{
  ...(msic ? { IndustryClassificationCode: [{ _: p.msic || '00000', name: p.msicName || 'NOT APPLICABLE' }] } : {}),
  PartyIdentification: [
    { ID: [{ _: p.tin || 'NA', schemeID: 'TIN' }] },
    { ID: [{ _: p.idNo || p.brn || 'NA', schemeID: p.idType || 'BRN' }] },
    { ID: [{ _: p.sstNo || 'NA', schemeID: 'SST' }] },
    { ID: [{ _: p.ttxNo || 'NA', schemeID: 'TTX' }] },
  ],
  PostalAddress: [{
    CityName: v(p.city || 'NA'),
    PostalZone: v(p.postcode || ''),
    CountrySubentityCode: v(p.state || '17'),
    AddressLine: [{ Line: v(p.address || 'NA') }],
    Country: [{ IdentificationCode: [{ _: p.country || 'MYS', listID: 'ISO3166-1', listAgencyID: '6' }] }],
  }],
  PartyLegalEntity: [{ RegistrationName: v(p.name || 'NA') }],
  Contact: [{ Telephone: v(p.phone || 'NA'), ...(p.email ? { ElectronicMail: v(p.email) } : {}) }],
}] }];

const taxCategory = (type, pct) => [{
  ID: v(type),
  ...(type === 'E' ? { TaxExemptionReason: v('Exempted goods or services') } : type === '06' ? {} : { Percent: v(pct) }),
  TaxScheme: [{ ID: [{ _: 'OTH', schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }] }],
}];

/** The UBL JSON for [doc], issued at [issuedAt]. */
export function eInvoiceJson(doc, seller, { issuedAt = Date.now() } = {}) {
  const kind = DOC_TYPES[doc.type];
  if (!kind?.code) throw new Error(`${doc.type} is not an e-invoice`);
  const t = docTotals(doc.lines);
  const issued = new Date(issuedAt);
  // A self-billed invoice is made by the buyer: the other party is the supplier.
  const selfBilled = doc.type === 'SELF_BILLED';
  const supplier = selfBilled ? doc.contact : seller;
  const customer = selfBilled ? seller : doc.contact;
  return {
    _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    Invoice: [{
      ID: v(doc.no),
      IssueDate: v(issued.toISOString().slice(0, 10)),
      IssueTime: v(`${issued.toISOString().slice(11, 19)}Z`),
      InvoiceTypeCode: [{ _: kind.code, listVersionID: '1.0' }],
      DocumentCurrencyCode: v('MYR'),
      TaxCurrencyCode: v('MYR'),
      ...(doc.refNo ? { BillingReference: [{ InvoiceDocumentReference: [{ ID: v(doc.refNo), ...(doc.refUuid ? { UUID: v(doc.refUuid) } : {}) }] }] } : {}),
      AccountingSupplierParty: party(supplier || {}, { msic: true }),
      AccountingCustomerParty: party(customer || {}),
      ...(doc.dueDate ? { PaymentTerms: [{ Note: v(`Due ${ymd(doc.dueDate)}`) }] } : {}),
      TaxTotal: [{
        TaxAmount: money(t.taxSen),
        TaxSubtotal: t.byTax.map((x) => ({ TaxableAmount: money(x.baseSen), TaxAmount: money(x.taxSen), TaxCategory: taxCategory(x.taxType, x.taxPct) })),
      }],
      LegalMonetaryTotal: [{
        LineExtensionAmount: money(t.netSen),
        TaxExclusiveAmount: money(t.netSen),
        TaxInclusiveAmount: money(t.totalSen),
        PayableAmount: money(t.totalSen),
      }],
      InvoiceLine: (doc.lines || []).map((l, i) => {
        const lt = lineTotals(l);
        const type = l.taxType || (l.taxPct ? '01' : '06');
        return {
          ID: v(String(i + 1)),
          InvoicedQuantity: [{ _: (l.qtyMilli ?? 1000) / 1000, unitCode: l.unitCode || 'C62' }],
          LineExtensionAmount: money(lt.netSen),
          ...(l.discountSen ? { AllowanceCharge: [{ ChargeIndicator: v(false), AllowanceChargeReason: v('Discount'), Amount: money(l.discountSen) }] } : {}),
          TaxTotal: [{ TaxAmount: money(lt.taxSen), TaxSubtotal: [{ TaxableAmount: money(lt.netSen), TaxAmount: money(lt.taxSen), TaxCategory: taxCategory(type, Number(l.taxPct) || 0) }] }],
          Item: [{
            CommodityClassification: [{ ItemClassificationCode: [{ _: l.classCode || DEFAULT_CLASS, listID: 'CLASS' }] }],
            Description: v(l.description || 'Item'),
          }],
          Price: [{ PriceAmount: money(l.unitPriceSen || 0) }],
          ItemPriceExtension: [{ Amount: money(lt.grossSen) }],
        };
      }),
    }],
  };
}
