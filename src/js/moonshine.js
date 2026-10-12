// On-device speech recognition (Moonshine tiny, English) running in the browser through
// ONNX Runtime Web. The learner's voice never leaves the phone.
//
// createMoonshine(ort, { encoder, decoder, tokensText }) -> { transcribe(Float32Array @16 kHz) -> string }

const LAYERS = 6, HEADS = 8, HEAD_DIM = 36, BOS = 1, EOS = 2;

export function parseTokens(tokensText) {
  const table = [];
  for (const line of tokensText.split('\n')) {
    const i = line.lastIndexOf(' ');
    if (i < 0) continue;
    const id = Number(line.slice(i + 1));
    if (!Number.isInteger(id)) continue;
    table[id] = line.slice(0, i);
  }
  return table;
}

function b64bytes(s) {
  if (typeof atob === 'function') { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  return new Uint8Array(Buffer.from(s, 'base64'));
}

export function detokenize(ids, table) {
  const chunks = [];
  let n = 0;
  for (const id of ids) {
    const t = table[id];
    if (t == null) continue;
    let bytes;
    try { bytes = b64bytes(t); } catch { bytes = new TextEncoder().encode(t); }
    chunks.push(bytes); n += bytes.length;
  }
  const all = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return new TextDecoder('utf-8').decode(all).replace(/▁/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function createMoonshine(ort, { encoder, decoder, tokensText }) {
  const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  const enc = await ort.InferenceSession.create(encoder, opts);
  const dec = await ort.InferenceSession.create(decoder, opts);
  const table = parseTokens(tokensText);
  const ones = (n) => new ort.Tensor('int64', BigInt64Array.from({ length: n }, () => 1n), [1, n]);
  const empty = () => new ort.Tensor('float32', new Float32Array(0), [1, HEADS, 0, HEAD_DIM]);

  async function transcribe(samples) {
    const n = samples.length;
    if (n < 1600) return '';                                   // under 0.1 s: nothing to recognise
    const h = (await enc.run({ input_values: new ort.Tensor('float32', samples, [1, n]), attention_mask: ones(n) })).last_hidden_state;
    const T = h.dims[1];
    const past = {};
    for (let i = 0; i < LAYERS; i++) for (const k of ['decoder', 'encoder']) { past[`past_key_values.${i}.${k}.key`] = empty(); past[`past_key_values.${i}.${k}.value`] = empty(); }
    const maxLen = Math.min(120, Math.ceil((n / 16000) * 6.5) + 4);  // caps run-away repetition
    const out = [];
    let last = BOS;
    for (let step = 0; step < maxLen; step++) {
      const res = await dec.run({
        input_ids: new ort.Tensor('int64', BigInt64Array.from([BigInt(last)]), [1, 1]),
        encoder_hidden_states: h, encoder_attention_mask: ones(T),
        use_cache_branch: new ort.Tensor('bool', Uint8Array.from([step > 0 ? 1 : 0]), [1]),
        ...past,
      });
      const logits = res.logits.data, V = res.logits.dims[2], off = logits.length - V;
      let best = 0, bv = -Infinity;
      for (let v = 0; v < V; v++) { const x = logits[off + v]; if (x > bv) { bv = x; best = v; } }
      for (let i = 0; i < LAYERS; i++) {
        past[`past_key_values.${i}.decoder.key`] = res[`present.${i}.decoder.key`];
        past[`past_key_values.${i}.decoder.value`] = res[`present.${i}.decoder.value`];
        if (step === 0) { past[`past_key_values.${i}.encoder.key`] = res[`present.${i}.encoder.key`]; past[`past_key_values.${i}.encoder.value`] = res[`present.${i}.encoder.value`]; }
      }
      if (best === EOS) break;
      out.push(best); last = best;
    }
    return detokenize(out, table);
  }
  return { transcribe };
}
