/**
 * Connections to other systems: a friend's POS, someone else's WMS or TMS,
 * an accounting program. Two ways in:
 *
 *   PULL  we fetch their REST API on a schedule (or when asked): their
 *         address and paths, their key kept on our server only
 *         (connectionSecrets/, which no screen can read);
 *   PUSH  they send to POST /v1/import/{kind} with one of our API keys.
 *
 * Either way their JSON is read through a field map (which of their fields
 * is the receipt number, the barcode, the quantity...) into the records
 * JSOX already keeps -- sales, stock counts, products, delivery trips -- so
 * Every Data, Books, Barcode Scan and TMS show them like their own. Each
 * record keeps where it came from (source CONNECTOR, connectionId) and a
 * fixed id, so fetching the same thing twice changes nothing.
 *
 * Pure: no network, no Firestore. server.mjs does the fetching and writing.
 */

export const KINDS = ['sales', 'stock', 'items', 'deliveries'];

/** Field maps to start from: the names most systems use. */
export const PRESETS = {
  sales: { list: 'data', id: 'id', receiptNo: 'receipt_no', at: 'created_at', branch: 'store_id', total: 'total', status: 'status', payment: 'payment_method', lines: 'items', line: { barcode: 'sku', name: 'name', qty: 'quantity', price: 'price' } },
  stock: { list: 'data', barcode: 'sku', name: 'name', qty: 'quantity', branch: 'location' },
  items: { list: 'data', barcode: 'sku', name: 'name', price: 'price', cost: 'cost', category: 'category' },
  deliveries: { list: 'data', id: 'id', ref: 'do_no', to: 'customer', address: 'address', status: 'status', plate: 'plate', driver: 'driver', at: 'date', receivedBy: 'received_by' },
};

/** obj at "a.b.0.c"; '' or '$' is obj itself. */
export function pick(obj, path) {
  if (path == null || path === '' || path === '$') return obj;
  return String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

const num = (v) => {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

/** Ringgit (12.50, "RM 12.50") or sen (1250, with unit 'SEN') to sen. */
export function toSen(v, unit = 'RM') {
  const n = num(v);
  if (!Number.isFinite(n)) return 0;
  return unit === 'SEN' ? Math.round(n) : Math.round(n * 100);
}

/** A quantity to thousandths. */
export const toMilli = (v) => { const n = num(v); return Number.isFinite(n) ? Math.round(n * 1000) : 0; };

/** A time: milliseconds, seconds, or a date string; null when unreadable. */
export function toMs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v < 1e12 ? Math.round(v * 1000) : Math.round(v);
  if (/^\d+$/.test(String(v))) return toMs(Number(v));
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

const text = (v, max = 200) => (v == null ? '' : String(v).trim().slice(0, max));
/** A document id from their id: letters, digits, - and _ only. */
export const safeId = (v) => text(v, 120).replace(/[^A-Za-z0-9_-]/g, '_');

/** The list in a response: at [map.list], or the body itself if that is a list. */
export function listOf(body, map) {
  const at = pick(body, map?.list);
  if (Array.isArray(at)) return at;
  if (Array.isArray(body)) return body;
  return [];
}

/**
 * Their records as ours, for [kind], through [map] (PRESETS overridden).
 * Returns { records, problems } -- a record with no id or barcode is
 * skipped and said so, never guessed.
 */
export function mapRecords(kind, body, map = {}, { unit = 'RM', max = 2000 } = {}) {
  const m = { ...PRESETS[kind], ...map, line: { ...(PRESETS[kind]?.line || {}), ...(map.line || {}) } };
  const records = [];
  const problems = [];
  const list = listOf(body, m).slice(0, max);
  list.forEach((r, i) => {
    if (kind === 'sales') {
      const id = text(pick(r, m.id)) || text(pick(r, m.receiptNo));
      if (!id) { problems.push(`#${i + 1}: no id`); return; }
      const lines = (Array.isArray(pick(r, m.lines)) ? pick(r, m.lines) : []).map((l) => {
        const qtyMilli = toMilli(pick(l, m.line.qty) ?? 1);
        const unitPriceSen = toSen(pick(l, m.line.price), unit);
        return { barcode: text(pick(l, m.line.barcode), 64), name: text(pick(l, m.line.name)), qtyMilli, unitPriceSen, lineTotalSen: Math.round(qtyMilli * unitPriceSen / 1000) };
      });
      const total = pick(r, m.total);
      records.push({
        id: safeId(id), receiptNo: text(pick(r, m.receiptNo)) || id, at: toMs(pick(r, m.at)), branch: text(pick(r, m.branch), 80),
        totalSen: total == null || total === '' ? lines.reduce((s, l) => s + l.lineTotalSen, 0) : toSen(total, unit),
        voided: /void|cancel|refund/i.test(text(pick(r, m.status))), payment: text(pick(r, m.payment), 40), lines,
      });
    } else if (kind === 'stock') {
      const barcode = text(pick(r, m.barcode), 64);
      if (!barcode) { problems.push(`#${i + 1}: no barcode`); return; }
      records.push({ barcode, name: text(pick(r, m.name)), qtyMilli: toMilli(pick(r, m.qty)), branch: text(pick(r, m.branch), 80) });
    } else if (kind === 'items') {
      const barcode = text(pick(r, m.barcode), 64);
      if (!barcode) { problems.push(`#${i + 1}: no barcode`); return; }
      const price = pick(r, m.price);
      const cost = pick(r, m.cost);
      records.push({ barcode, name: text(pick(r, m.name)) || barcode, ...(price != null && price !== '' ? { priceSen: toSen(price, unit) } : {}),
        ...(cost != null && cost !== '' ? { costSen: toSen(cost, unit) } : {}), category: text(pick(r, m.category), 80) });
    } else if (kind === 'deliveries') {
      const id = text(pick(r, m.id)) || text(pick(r, m.ref));
      if (!id) { problems.push(`#${i + 1}: no id`); return; }
      records.push({ id: safeId(id), ref: text(pick(r, m.ref)) || id, to: text(pick(r, m.to)), address: text(pick(r, m.address), 300), status: text(pick(r, m.status), 40),
        plate: text(pick(r, m.plate), 20).toUpperCase(), driver: text(pick(r, m.driver), 80), at: toMs(pick(r, m.at)), receivedBy: text(pick(r, m.receivedBy), 80) });
    }
  });
  return { records, problems };
}

/** Their delivery status in our words. */
export function tripStatus(s) {
  const v = String(s || '').toLowerCase();
  if (/deliver|done|complete|pod|received|签收|送达|完成/.test(v)) return 'DONE';
  if (/cancel|取消/.test(v)) return 'CANCELLED';
  if (/road|transit|out for|dispatch|ship|loaded|在路|出发|运送/.test(v)) return 'ON_ROAD';
  if (/load|pack|pick|装/.test(v)) return 'LOADING';
  return 'PLANNED';
}

const day = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);

/**
 * The documents to write for [records] of [kind] from connection [conn]
 * ({ id, name, branchMap, branchId, moveStock }): [[path, data, merge?]],
 * paths under the company's workspace. [now] for what has no time.
 */
export function writesFor(kind, records, conn, now = Date.now()) {
  const tag = { source: 'CONNECTOR', connectionId: conn.id, connectionName: conn.name || '' };
  const branchOf = (b) => (conn.branchMap && b && b in conn.branchMap ? conn.branchMap[b] : (conn.branchId || ''));
  const out = [];
  const base = `ext-${safeId(conn.id)}-`;
  if (kind === 'sales') {
    for (const r of records) {
      const at = r.at || now;
      const branchId = branchOf(r.branch);
      const lines = r.lines.map((l) => ({ ...l, discountSen: 0, taxIds: [] }));
      out.push([`sales/${base}${r.id}`, {
        receiptNo: r.receiptNo, branchId, createdAt: at, syncedAt: now, status: r.voided ? 'VOIDED' : 'COMPLETED', orderType: 'RETAIL',
        cashierUid: `connector:${conn.id}`, cashierName: conn.name || 'API', tillName: conn.name || 'API',
        lines, subtotalSen: r.totalSen, discountSen: 0, serviceChargeSen: 0, taxSen: 0, taxes: [], totalSen: r.totalSen, roundingSen: 0,
        payments: [{ method: /cash|tunai|现金/i.test(r.payment) ? 'CASH' : /card|kad|visa|master/i.test(r.payment) ? 'CARD' : /qr|duitnow|tng|grab|wallet/i.test(r.payment) ? 'EWALLET' : 'OTHER', amountSen: r.totalSen }],
        paidSen: r.totalSen, changeSen: 0, ...tag,
      }]);
      // The stock goes down with the sale, unless their WMS tells us the stock itself.
      if (conn.moveStock !== false && !r.voided) {
        r.lines.forEach((l, i) => {
          if (!l.barcode || l.qtyMilli <= 0) return;
          out.push([`movements/${base}${r.id}-${i}`, { barcode: l.barcode, productName: l.name, branchId, type: 'SALE', quantityMilli: l.qtyMilli, at,
            reference: r.receiptNo, note: conn.name || '', createdByUid: `connector:${conn.id}`, createdByName: conn.name || 'API', createdAt: now, ...tag }]);
        });
      }
    }
  } else if (kind === 'stock') {
    // Their stock levels are a count, one per place and hour: the ledger starts from it.
    const byBranch = new Map();
    for (const r of records) {
      const b = branchOf(r.branch);
      if (!byBranch.has(b)) byBranch.set(b, []);
      byBranch.get(b).push(r);
    }
    const hour = new Date(now + 8 * 3600_000).toISOString().slice(0, 13).replace(/\D/g, '');
    for (const [branchId, list] of byBranch) {
      const id = `${base}${safeId(branchId || 'main')}-${hour}`;
      out.push([`stockChecks/${id}`, {
        refNo: `${conn.name || 'API'} ${day(now)}`, status: 'COMPLETED', templateName: 'API', zone: '', branchId, branchName: '',
        createdAt: now, updatedAt: now, completedAt: now, createdByUid: `connector:${conn.id}`, createdByName: conn.name || 'API',
        itemCount: list.length, totalQuantityMilli: list.reduce((s, r) => s + r.qtyMilli, 0), photoCount: 0, note: '', ...tag,
      }]);
      for (const r of list) {
        out.push([`stockChecks/${id}/items/${safeId(r.barcode)}`, { barcode: r.barcode, productName: r.name, quantityMilli: r.qtyMilli, unit: '', createdAt: now, updatedAt: now, source: 'CONNECTOR' }]);
      }
    }
  } else if (kind === 'items') {
    for (const r of records) {
      out.push([`products/${safeId(r.barcode)}`, {
        barcode: r.barcode, name: r.name, ...(r.priceSen != null ? { priceSen: r.priceSen } : {}), ...(r.costSen != null ? { costSen: r.costSen } : {}),
        updatedAt: now, ...tag,
      }, true]);
    }
  } else if (kind === 'deliveries') {
    for (const r of records) {
      const status = tripStatus(r.status);
      const done = status === 'DONE';
      out.push([`tmsTrips/${base}${r.id}`, {
        tripNo: r.ref, branchId: conn.branchId || '', date: day(r.at || now), status, plate: r.plate, driverName: r.driver, lorryId: '', driverId: '',
        stops: [{ kind: 'MANUAL', refId: r.id, ref: r.ref, to: r.to, address: r.address, units: 0, status: done ? 'DELIVERED' : status === 'CANCELLED' ? 'FAILED' : 'PENDING',
          ...(done ? { receivedBy: r.receivedBy, deliveredAt: r.at || now } : {}) }],
        createdByUid: `connector:${conn.id}`, createdByName: conn.name || 'API', createdAt: r.at || now, updatedAt: now, ...tag,
      }]);
    }
  }
  return out;
}

const PRIVATE = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::$/, /^::ffff:/i];

/** An address we may fetch: https, a public name, no odd ports. */
export function safeTarget(url) {
  let u;
  try { u = new URL(url); } catch { return { ok: false, reason: 'Not a web address.' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: 'Only https:// addresses.' };
  if (u.username || u.password) return { ok: false, reason: 'Put the key in the key box, not in the address.' };
  if (u.port && !['443', '8443'].includes(u.port)) return { ok: false, reason: 'Only the usual https port.' };
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|metadata(\.google\.internal)?)$/i.test(host) || host.endsWith('.internal') || host.endsWith('.local')) return { ok: false, reason: 'Not a public address.' };
  if (isPrivateIp(host)) return { ok: false, reason: 'Not a public address.' };
  return { ok: true, url: u };
}

/** Whether [ip] is on a private, loopback or link-local network. */
export const isPrivateIp = (ip) => PRIVATE.some((re) => re.test(String(ip)));

/** The request headers for [conn]'s key. */
export function authHeaders(conn, secret) {
  if (!secret) return {};
  if (conn.auth === 'HEADER') return { [conn.headerName || 'X-API-Key']: secret };
  if (conn.auth === 'BASIC') return { Authorization: `Basic ${Buffer.from(secret).toString('base64')}` };
  return { Authorization: `Bearer ${secret}` };
}

/** The address of [feed] at [conn], with the "since" filter when it has one. */
export function feedUrl(conn, feed, since) {
  const u = new URL(String(feed.path || ''), String(conn.baseUrl || '').replace(/\/?$/, '/'));
  if (feed.sinceParam && since) u.searchParams.set(feed.sinceParam, feed.sinceFormat === 'ms' ? String(since) : new Date(since).toISOString());
  return u.toString();
}
