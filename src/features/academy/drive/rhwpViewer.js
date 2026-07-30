import initRhwp, { HwpDocument } from '@rhwp/core';
import rhwpWasmUrl from '@rhwp/core/rhwp_bg.wasm?url';

let initializePromise = null;
let measurementContext = null;
let lastMeasuredFont = '';

function registerTextMeasurement() {
  globalThis.measureTextWidth = (font, text) => {
    if (!measurementContext) {
      measurementContext = document.createElement('canvas').getContext('2d');
    }
    if (!measurementContext) return String(text || '').length * 8;
    if (font !== lastMeasuredFont) {
      measurementContext.font = font || '14px sans-serif';
      lastMeasuredFont = font;
    }
    return measurementContext.measureText(String(text || '')).width;
  };
}

async function initializeRhwp() {
  if (!initializePromise) {
    registerTextMeasurement();
    initializePromise = initRhwp({ module_or_path: rhwpWasmUrl }).catch((error) => {
      initializePromise = null;
      throw error;
    });
  }
  await initializePromise;
}

export async function createRhwpDocument(bytes) {
  await initializeRhwp();
  return new HwpDocument(bytes);
}
