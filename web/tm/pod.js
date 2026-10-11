/**
 * Proof of delivery (签收单): every stop delivered, newest first -- where,
 * which trip and lorry, who received it, when, and their signature. A stop
 * that could not be delivered is listed too, with why.
 */
import { dateTime, h, mount } from '../js/dom.js';
import { t } from '../js/i18n.js';
import { head, inkPicture, loadFleet, pill, STOP_TONE, stopKind, stopTo } from './common.js';

export function render(main) {
  const box = h('div', {}, h('p', { class: 'muted' }, t('loading')));
  const search = h('input', { type: 'search', placeholder: t('tmSearch'), 'data-act': 'pod-search', style: { maxWidth: '260px' } });
  mount(main, head(t('tmPod'), search), h('p', { class: 'muted' }, t('tmPodLead')), box);
  loadFleet().then(({ trips }) => {
    const rows = trips.flatMap((x) => (x.stops || []).filter((s) => ['DELIVERED', 'FAILED'].includes(s.status)).map((s) => ({ ...s, trip: x })))
      .sort((a, b) => (b.deliveredAt || b.failedAt || 0) - (a.deliveredAt || a.failedAt || 0));
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const shown = rows.filter((r) => !q || [r.ref, stopTo(r), r.receivedBy, r.trip.tripNo, r.trip.plate, r.trip.driverName].join(' ').toLowerCase().includes(q));
      mount(box, shown.length ? h('div', { class: 'tm-pods' }, shown.slice(0, 200).map((r) => h('div', { class: 'card tm-podcard', 'data-pod': r.ref },
        h('div', { class: 'row' }, h('b', { class: 'grow' }, stopTo(r)), pill(t(`stop_${r.status}`), STOP_TONE[r.status])),
        h('div', { class: 'muted' }, `${r.ref} · ${stopKind(r)} · ${r.trip.tripNo} · 🚚 ${r.trip.plate} · ${r.trip.driverName}`),
        r.status === 'DELIVERED'
          ? h('div', { class: 'tm-pod' }, h('div', {}, `${t('tmReceivedBy')}: `, h('b', {}, r.receivedBy || ''), ` · ${dateTime(r.deliveredAt)}`),
            r.signature ? inkPicture(r.signature, { w: 240, hgt: 80 }) : h('span', { class: 'muted' }, t('tmNoSignature')), r.note ? h('div', { class: 'muted' }, r.note) : null)
          : h('div', {}, `${t('tmReason')}: ${r.note || ''} · ${dateTime(r.failedAt)}`))))
        : h('p', { class: 'muted' }, t('tmNoPod')));
    };
    search.oninput = draw;
    draw();
  }).catch((err) => mount(box, h('p', { class: 'muted' }, `${t('errLoad')}: ${err.message || err}`)));
  return null;
}
