/**
 * Scanning a barcode with the device's camera, for tills without a USB
 * scanner: a tablet, a phone, a laptop's webcam.
 *
 * Chrome on Android and most new browsers have a built-in BarcodeDetector;
 * where there is none, the ZXing reader is fetched from the CDN on first use.
 */
import { h, modal, toast } from './dom.js';
import { t } from './i18n.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf', 'codabar'];

/** Opens the camera and resolves the first barcode it reads, or null. */
export function scanWithCamera() {
  return new Promise((resolve) => {
    let result = null;
    let stream = null;
    let stopped = false;
    let zxingControls = null;
    const video = h('video', { autoplay: true, playsinline: true, muted: true, style: { width: '100%', borderRadius: '10px', background: '#000', maxHeight: '60vh' } });
    const status = h('p', { class: 'muted', style: { margin: 0, textAlign: 'center' } }, t('pointCamera'));

    const stop = () => {
      stopped = true;
      zxingControls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };

    const close = modal((closeFn) => [
      h('h2', {}, t('scanCamera')),
      video,
      status,
      h('div', { class: 'actions' }, h('button', { onclick: closeFn }, t('cancel'))),
    ], { onClose: () => { stop(); resolve(result); } });

    const found = (code) => {
      if (stopped || !code) return;
      result = String(code).trim();
      try { navigator.vibrate?.(80); } catch { /* not on every device */ }
      close();
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        video.srcObject = stream;
        await video.play();
      } catch {
        status.textContent = t('errCamera');
        return;
      }
      if ('BarcodeDetector' in window) {
        let detector;
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          detector = new window.BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
        } catch {
          detector = null;
        }
        if (detector) {
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (codes.length) return found(codes[0].rawValue);
            } catch { /* a frame that was not ready */ }
            setTimeout(tick, 150);
          };
          tick();
          return;
        }
      }
      try {
        const { BrowserMultiFormatReader } = await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm');
        stream.getTracks().forEach((track) => track.stop());
        const reader = new BrowserMultiFormatReader();
        zxingControls = await reader.decodeFromVideoDevice(undefined, video, (res) => { if (res) found(res.getText()); });
        if (stopped) zxingControls.stop();
      } catch {
        status.textContent = t('errCameraScan');
        toast(t('errCameraScan'), 'error');
      }
    })();
  });
}
