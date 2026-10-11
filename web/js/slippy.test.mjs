// node web/js/slippy.test.mjs -- the street map's sums.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitView, metres, navLinks, project, unproject } from './slippy.js';

test('a place to map pixels and back', () => {
  assert.deepEqual(project(0, 0, 0), [128, 128]);
  const [x, y] = project(3.139, 101.6869, 12);
  const [lat, lng] = unproject(x, y, 12);
  assert.ok(Math.abs(lat - 3.139) < 1e-9 && Math.abs(lng - 101.6869) < 1e-9);
  // North is up: a place further north is higher on the map.
  assert.ok(project(5.4, 100.3, 8)[1] < project(1.5, 103.7, 8)[1]);
});

test('fitting: every point in view, as close as that allows; Malaysia when there are none', () => {
  const kl = [3.139, 101.6869];
  const ipoh = [4.5975, 101.0901];
  const v = fitView([kl, ipoh], 800, 600);
  assert.ok(v.zoom >= 7 && v.zoom <= 10, String(v.zoom));
  const [x1, y1] = project(ipoh[0], kl[1], v.zoom);
  const [x2, y2] = project(kl[0], ipoh[1], v.zoom);
  assert.ok(Math.abs(x2 - x1) <= 800 && Math.abs(y2 - y1) <= 600);
  assert.equal(fitView([kl], 800, 600).zoom, 15);
  assert.deepEqual(fitView([[NaN, 1]], 800, 600).center, [4.2, 101.9]);
});

test('driving there: Waze and Google Maps, by place or by address', () => {
  assert.deepEqual(navLinks([3.139, 101.6869]), {
    waze: 'https://waze.com/ul?ll=3.139000,101.686900&navigate=yes',
    google: 'https://www.google.com/maps/dir/?api=1&destination=3.139000,101.686900',
  });
  assert.equal(navLinks('No. 12, Jalan Pasar, Ipoh').waze, 'https://waze.com/ul?q=No.%2012%2C%20Jalan%20Pasar%2C%20Ipoh&navigate=yes');
});

test('distance', () => {
  const d = metres([3.139, 101.6869], [4.5975, 101.0901]);
  assert.ok(d > 170_000 && d < 180_000, String(d));
});
