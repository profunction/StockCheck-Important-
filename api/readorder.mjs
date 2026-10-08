/**
 * Reading a Pinduoduo order from screenshots (拼多多截图读单), for SuXin WMS's
 * Pinduoduo purchases page. Pinduoduo gives buyers no way for another
 * program to read their orders, so the buyer shows us the order instead:
 * one or a few screenshots of it, which Claude reads into items, options,
 * prices, quantities, order and tracking numbers.
 *
 *   POST /app/read-order   { images: [{ mediaType, data (base64) }] }
 *                          Authorization: Bearer <Firebase ID token>
 *
 * Only someone who may raise purchase orders, in a company whose plan has
 * the warehouse, may ask; the answer is only read, never saved -- the
 * buyer checks it on the review screen before anything is written. Needs
 * the ANTHROPIC_API_KEY secret (anthropic-api-key in Secret Manager).
 *
 * The pure parts (checking the images, turning the answer into the review
 * screen's order) are tested in readorder.test.mjs.
 */
import { ApiError } from './lib.mjs';

export const MODEL = 'claude-opus-5-5';
const MAX_IMAGES = 4;
const MAX_BYTES = 3_500_000;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** The screenshots as sent, checked: 1-4 images of a known type and a sane size. */
export function checkImages(images) {
  if (!Array.isArray(images) || !images.length) throw new ApiError(400, 'Send at least one screenshot.', 'NO_IMAGE');
  if (images.length > MAX_IMAGES) throw new ApiError(400, `At most ${MAX_IMAGES} screenshots at a time.`, 'TOO_MANY');
  return images.map((img) => {
    const mediaType = String(img?.mediaType || '');
    const data = String(img?.data || '').replace(/^data:[^,]*,/, '');
    if (!TYPES.includes(mediaType)) throw new ApiError(400, 'A screenshot must be JPEG, PNG or WebP.', 'BAD_IMAGE');
    if (!data || !/^[A-Za-z0-9+/=\s]+$/.test(data) || data.length * 0.75 > MAX_BYTES) throw new ApiError(400, 'A screenshot is too big or broken.', 'BAD_IMAGE');
    return { mediaType, data: data.replace(/\s/g, '') };
  });
}

const yuanToCents = (n) => Math.max(0, Math.round((Number(n) || 0) * 100));

/** Claude's answer -> the order the review screen takes (web/js/onlineorder.js's shape). */
export function toOrder(read) {
  const lines = (read?.lines || [])
    .filter((l) => String(l?.title || '').trim())
    .map((l) => ({
      title: String(l.title).trim().slice(0, 160),
      variation: String(l.variation || '').trim().slice(0, 120),
      qty: Math.max(1, Math.round(Number(l.qty) || 1)),
      priceCents: yuanToCents(l.unitPriceYuan),
    }));
  return {
    platform: 'pdd',
    orderNo: String(read?.orderNo || '').trim().slice(0, 60),
    trackingNo: String(read?.trackingNo || '').trim().slice(0, 60),
    currency: 'CNY',
    lines,
    shippingCents: yuanToCents(read?.shippingYuan),
    totalCents: read?.totalYuan == null ? null : yuanToCents(read.totalYuan),
  };
}

const PROMPT = `These are screenshots of one order the shop bought on Pinduoduo (拼多多), a Chinese shopping app. Read the order exactly as shown.

For each item bought: its title as shown (keep the Chinese), the chosen option or specification (规格, e.g. colour, size, pack) if any, the price paid for ONE unit in yuan after any discount shown on that item, and the quantity (x2 means 2).
Also read: the order number (订单编号), the tracking number (快递单号 / 运单号) if shown, the shipping charged in yuan (运费, 0 if free), and the total paid (实付) in yuan.

Read only what is on the screenshots. Do not guess: leave a text field empty and a number 0 when it is not shown. If several screenshots show the same item, list it once.`;

/** The reader, given a key (or a stand-in client for tests). */
let format = null;
/** The answer's shape, for structured outputs: the order as the review screen needs it. */
export async function outputFormat() {
  if (!format) {
    const [{ z }, { zodOutputFormat }] = await Promise.all([import('zod/v4'), import('@anthropic-ai/sdk/helpers/zod')]);
    format = zodOutputFormat(z.object({
      orderNo: z.string(),
      trackingNo: z.string(),
      shippingYuan: z.number(),
      totalYuan: z.number(),
      lines: z.array(z.object({
        title: z.string(),
        variation: z.string(),
        unitPriceYuan: z.number(),
        qty: z.number(),
      })),
    }));
  }
  return format;
}

export function orderReader({ apiKey = process.env.ANTHROPIC_API_KEY, client = null } = {}) {
  let ready = client ? Promise.resolve(client) : null;
  const sdk = async () => {
    if (!ready) {
      ready = (async () => {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        return new Anthropic({ apiKey });
      })();
    }
    return ready;
  };
  return {
    configured: () => !!(client || apiKey),
    async read(images) {
      if (!client && !apiKey) throw new ApiError(503, 'Reading screenshots is not set up: the anthropic-api-key secret is missing.', 'NOT_SET_UP');
      const shots = checkImages(images);
      const anthropic = await sdk();
      const message = await anthropic.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        // Reading what is on the screen: little to think about.
        output_config: { effort: 'low', format: client ? undefined : await outputFormat() },
        messages: [{
          role: 'user',
          content: [
            ...shots.map((s) => ({ type: 'image', source: { type: 'base64', media_type: s.mediaType, data: s.data } })),
            { type: 'text', text: PROMPT },
          ],
        }],
      });
      if (message.stop_reason === 'refusal') throw new ApiError(422, 'These screenshots could not be read. Try copying the order text instead.', 'NOT_READ');
      if (!message.parsed_output) throw new ApiError(422, 'Nothing could be read from these screenshots. Try clearer ones, or copy the order text.', 'NOT_READ');
      return toOrder(message.parsed_output);
    },
  };
}
