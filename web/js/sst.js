/**
 * SST on a bill, line by line, and the monthly consolidated e-invoice for
 * LHDN MyInvois. Pure: no Firebase, no page (sst.test.mjs).
 *
 * Whole sen throughout. The per-line figures come from the same tax engine
 * as the till (money.js taxEngine), so the receipt, the tax report and the
 * e-invoice can never disagree by a sen.
 */
import { allocate, formatSen, taxEngine } from './money.js';

/**
 * A bill's SST, ready to print.
 *
 * [lineItems]: { name, qtyMilli, unitPriceSen, discountSen?, taxIds? }.
 * [serviceChargeConfig]: { pct, taxIds? } -- taxIds taxes the service charge
 * as one line of its own; without it the charge is shared over the lines and
 * taxed with each. [opts]: { taxes, pricesIncludeTax, discountSen, discountPct }.
 *
 * Discounts come off before tax. Tax-free lines are marked '*', as Malaysian
 * receipts show them.
 */
export function calculateSSTBreakdown(lineItems, serviceChargeConfig = {}, opts = {}) {
  const e = taxEngine(lineItems, {
    ...opts,
    serviceChargePct: Number(serviceChargeConfig.pct) || 0,
    serviceChargeTaxIds: Array.isArray(serviceChargeConfig.taxIds) ? serviceChargeConfig.taxIds : null,
  });
  const lines = lineItems.map((l, i) => {
    const p = e.parts[i];
    return {
      name: l.name || l.barcode || '',
      qtyMilli: l.qtyMilli,
      amountSen: p.grossSen - p.serviceChargeSen + p.discountSen,
      discountSen: p.discountSen,
      netSen: p.grossSen - p.serviceChargeSen,
      exempt: p.taxIds.length === 0,
      mark: p.taxIds.length === 0 ? '*' : '',
      taxes: p.taxes,
      taxSen: p.taxSen,
    };
  });
  // The tax on the service charge: its own line's tax, or each line's tax
  // split between the goods and the charge in proportion.
  const serviceChargeTaxSen = e.parts.reduce((sum, p) => {
    if (p.isServiceCharge) return sum + p.taxSen;
    if (!p.serviceChargeSen || !p.taxSen) return sum;
    return sum + allocate(p.taxSen, [p.grossSen - p.serviceChargeSen, p.serviceChargeSen])[1];
  }, 0);
  const taxedParts = e.parts.filter((p) => p.taxIds.length);
  return {
    lines,
    subtotalSen: e.subtotalSen,
    discountSen: e.discountSen,
    serviceChargeSen: e.serviceChargeSen,
    serviceChargeTaxSen,
    // Amounts as charged (after discount, with their share of service charge).
    taxableSen: taxedParts.reduce((s, p) => s + p.grossSen, 0),
    exemptSen: e.untaxedSen,
    taxes: e.taxes,
    taxSen: e.taxSen,
    totalSen: e.totalSen,
    taxIncluded: e.taxIncluded,
    hasExempt: lines.some((l) => l.exempt),
  };
}

// ------------------------------------------------------------- e-invoice

/** General public, as LHDN asks a consolidated e-invoice to name the buyer. */
export const GENERAL_PUBLIC_TIN = 'EI00000000010';
/** Classification code 004: consolidated e-invoice. */
export const CONSOLIDATED_CLASS = '004';

/**
 * MyInvois tax type for one of the shop's taxes: 01 sales tax, 02 service
 * tax. A tax can say so itself (einvoiceType); otherwise its name decides.
 */
export function taxTypeOf(tax) {
  if (tax?.einvoiceType) return String(tax.einvoiceType);
  return /service|perkhidmatan|服务/i.test(tax?.name || '') ? '02' : '01';
}

const amt = (sen) => Number(formatSen(sen));
const money = (sen) => [{ _: amt(sen), currencyID: 'MYR' }];
const v = (x) => [{ _: x }];
const ymd = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** What one receipt adds up to for the e-invoice. Voided receipts add nothing. */
export function receiptAmounts(sale) {
  const taxSen = (sale.taxes || []).reduce((s, x) => s + (x.taxSen || 0), 0) || sale.taxSen || 0;
  const totalSen = sale.totalSen || 0;
  // Tax inside the prices or added on top, the total holds it either way.
  const exclusiveSen = totalSen - taxSen;
  return {
    receiptNo: sale.receiptNo,
    at: sale.createdAt,
    exclusiveSen,
    taxSen,
    totalSen,
    roundingSen: sale.roundingSen || 0,
    exemptSen: sale.untaxedSen || 0,
    taxes: (sale.taxes || []).map((x) => ({ id: x.id, name: x.name, pct: x.pct, baseSen: x.baseSen || 0, taxSen: x.taxSen || 0 })),
  };
}

/**
 * The consolidated e-invoice for [sales] between [from] and [to] (ms):
 * one line per receipt, the buyer the general public, in the MyInvois UBL
 * 2.1 JSON layout, and the same as CSV for the accountant or the portal's
 * batch upload. Voided receipts are left out.
 *
 * [seller]: { name, tin, brn, sstNo, msic, msicName, address, city, state,
 * postcode, phone, email }. [taxes]: the shop's tax list, for the tax types.
 */
export function buildConsolidatedEInvoice(sales, { seller = {}, from, to, invoiceNo, issuedAt = Date.now(), taxes = [] } = {}) {
  const rows = sales
    .filter((s) => s.status !== 'VOIDED' && (from == null || s.createdAt >= from) && (to == null || s.createdAt <= to))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(receiptAmounts);
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const totals = { exclusiveSen: sum('exclusiveSen'), taxSen: sum('taxSen'), totalSen: sum('totalSen'), roundingSen: sum('roundingSen'), exemptSen: sum('exemptSen') };

  // A shop not registered for SST charges no tax at all: 06, not applicable.
  // A registered one selling tax-free goods: E, exempt.
  const freeType = taxes.length ? 'E' : '06';
  // Per tax type, over the whole invoice.
  const byType = new Map();
  const add = (type, base, tax, pct) => {
    const k = `${type}|${pct}`;
    const x = byType.get(k) || { type, pct, baseSen: 0, taxSen: 0 };
    x.baseSen += base; x.taxSen += tax; byType.set(k, x);
  };
  rows.forEach((r) => {
    r.taxes.forEach((x) => add(taxTypeOf(taxes.find((t) => t.id === x.id) || x), x.baseSen, x.taxSen, x.pct));
    if (r.exemptSen) add(freeType, r.exemptSen, 0, 0);
  });
  const subtotals = [...byType.values()];

  const no = invoiceNo || `CON-${ymd(from ?? issuedAt).slice(0, 7).replace('-', '')}`;
  const issued = new Date(issuedAt);
  const taxCategory = (x) => [{
    ID: v(x.type),
    ...(x.type === 'E' ? { TaxExemptionReason: v('Exempted goods') } : x.type === '06' ? {} : { Percent: v(x.pct) }),
    TaxScheme: [{ ID: [{ _: 'OTH', schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }] }],
  }];
  const party = (ids, name, address, contact, extra = {}) => [{ Party: [{
    ...extra,
    PartyIdentification: ids.map(([id, scheme]) => ({ ID: [{ _: id, schemeID: scheme }] })),
    PostalAddress: [{
      CityName: v(address.city || 'NA'),
      PostalZone: v(address.postcode || ''),
      CountrySubentityCode: v(address.state || '17'),
      AddressLine: [{ Line: v(address.address || 'NA') }],
      Country: [{ IdentificationCode: [{ _: 'MYS', listID: 'ISO3166-1', listAgencyID: '6' }] }],
    }],
    PartyLegalEntity: [{ RegistrationName: v(name) }],
    Contact: [{ Telephone: v(contact.phone || 'NA'), ...(contact.email ? { ElectronicMail: v(contact.email) } : {}) }],
  }] }];

  const json = {
    _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    Invoice: [{
      ID: v(no),
      IssueDate: v(issued.toISOString().slice(0, 10)),
      IssueTime: v(`${issued.toISOString().slice(11, 19)}Z`),
      InvoiceTypeCode: [{ _: '01', listVersionID: '1.0' }],
      DocumentCurrencyCode: v('MYR'),
      TaxCurrencyCode: v('MYR'),
      InvoicePeriod: [{ StartDate: v(ymd(from ?? rows[0]?.at ?? issuedAt)), EndDate: v(ymd(to ?? rows.at(-1)?.at ?? issuedAt)), Description: v('Monthly') }],
      AccountingSupplierParty: party(
        [[seller.tin || 'NA', 'TIN'], [seller.brn || 'NA', 'BRN'], [seller.sstNo || 'NA', 'SST']],
        seller.name || 'NA', seller, seller,
        { IndustryClassificationCode: [{ _: seller.msic || '00000', name: seller.msicName || 'NOT APPLICABLE' }] },
      ),
      AccountingCustomerParty: party([[GENERAL_PUBLIC_TIN, 'TIN'], ['NA', 'BRN'], ['NA', 'SST']], 'General Public', {}, {}),
      TaxTotal: [{
        TaxAmount: money(totals.taxSen),
        TaxSubtotal: subtotals.map((x) => ({ TaxableAmount: money(x.baseSen), TaxAmount: money(x.taxSen), TaxCategory: taxCategory(x) })),
      }],
      LegalMonetaryTotal: [{
        LineExtensionAmount: money(totals.exclusiveSen),
        TaxExclusiveAmount: money(totals.exclusiveSen),
        TaxInclusiveAmount: money(totals.totalSen),
        PayableRoundingAmount: money(totals.roundingSen),
        PayableAmount: money(totals.totalSen + totals.roundingSen),
      }],
      InvoiceLine: rows.map((r, i) => ({
        ID: v(String(i + 1)),
        InvoicedQuantity: [{ _: 1, unitCode: 'C62' }],
        LineExtensionAmount: money(r.exclusiveSen),
        TaxTotal: [{
          TaxAmount: money(r.taxSen),
          TaxSubtotal: [
            ...r.taxes.map((x) => ({ TaxableAmount: money(x.baseSen), TaxAmount: money(x.taxSen), TaxCategory: taxCategory({ type: taxTypeOf(taxes.find((t) => t.id === x.id) || x), pct: x.pct }) })),
            ...(r.exemptSen || !r.taxes.length ? [{ TaxableAmount: money(r.exemptSen || r.exclusiveSen), TaxAmount: money(0), TaxCategory: taxCategory({ type: r.exemptSen ? freeType : '06', pct: 0 }) }] : []),
          ],
        }],
        Item: [{
          CommodityClassification: [{ ItemClassificationCode: [{ _: CONSOLIDATED_CLASS, listID: 'CLASS' }] }],
          Description: v(`Receipt ${r.receiptNo}`),
        }],
        Price: [{ PriceAmount: money(r.exclusiveSen) }],
        ItemPriceExtension: [{ Amount: money(r.exclusiveSen) }],
      })),
    }],
  };

  const q = (x) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
  const header = ['invoice_no', 'line', 'receipt_no', 'date', 'classification', 'buyer_tin', 'buyer_name', 'amount_excl_tax', 'tax', 'tax_free', 'total_incl_tax', 'rounding'];
  const csv = [header, ...rows.map((r, i) => [no, i + 1, r.receiptNo, ymd(r.at), CONSOLIDATED_CLASS, GENERAL_PUBLIC_TIN, 'General Public',
    formatSen(r.exclusiveSen), formatSen(r.taxSen), formatSen(r.exemptSen), formatSen(r.totalSen), formatSen(r.roundingSen)]),
  ['TOTAL', '', `${rows.length} receipts`, '', '', '', '', formatSen(totals.exclusiveSen), formatSen(totals.taxSen), formatSen(totals.exemptSen), formatSen(totals.totalSen), formatSen(totals.roundingSen)]]
    .map((r) => r.map(q).join(',')).join('\r\n');

  return { invoiceNo: no, receipts: rows.length, totals, subtotals, json, csv };
}
