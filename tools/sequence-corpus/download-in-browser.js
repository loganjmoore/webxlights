// Downloads a slice of xlightsseq.com's free Christmas sequences, keeping only the .xsq and layout
// XML from each package, gzipped, in one .tar saved to ~/Downloads. Audio, video and images are
// dropped in the browser and never touch the disk.
//
// Run it in the DevTools console of an xlightsseq.com tab while signed in (downloads need an
// account). Chrome allows one automatic download per tab, so run each slice in a fresh tab:
//
//   magicDownload(0, 45, "s00")     // ranks 0-44 by download count
//   magicDownload(45, 90, "s01")    // new tab
//
// Packages hosted on Google Drive or Dropbox can't be fetched from the page; their ids are listed
// in the slice's _log_<tag>.json (ext: true). Resolve their links by opening
// /sequences/<slug>.<id>/download while signed in, put "id<TAB>url" lines in a file, and run
// fetch-external.py on it.
window.magicDownload = async (START, END, TAG, category = "free-christmas-sequences.5") => {
  const st = (window.__st = { tag: TAG, done: 0, recs: [], finished: false });
  const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
  const enc = new TextEncoder();
  const tar = (files) => {
    const parts = [];
    const oct = (n, l) => n.toString(8).padStart(l - 1, "0") + "\0";
    for (const f of files) {
      const h = new Uint8Array(512);
      const put = (s, o, l) => h.set(enc.encode(s).slice(0, l), o);
      let name = f.name.replace(/[^\x20-\x7e]/g, "_"), prefix = "";
      if (name.length > 100) {
        const i = name.indexOf("/");
        prefix = name.slice(0, i);
        name = name.slice(i + 1);
        if (name.length > 99) name = name.slice(0, 60) + "~" + name.slice(-38);
      }
      put(name, 0, 100); put("0000644\0", 100, 8); put("0000000\0", 108, 8); put("0000000\0", 116, 8);
      put(oct(f.data.length, 12), 124, 12); put(oct(Math.floor(Date.now() / 1000), 12), 136, 12);
      put("        ", 148, 8); put("0", 156, 1); put("ustar\0", 257, 6); put("00", 263, 2); put(prefix, 345, 155);
      let sum = 0;
      for (const x of h) sum += x;
      put(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
      parts.push(h, f.data);
      const pad = (512 - (f.data.length % 512)) % 512;
      if (pad) parts.push(new Uint8Array(pad));
    }
    parts.push(new Uint8Array(1024));
    return new Blob(parts);
  };
  const pipe = async (u8, t) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(t)).arrayBuffer());
  const gz = (u8) => pipe(u8, new CompressionStream("gzip"));
  const keep = (n) => /\.(xsq|xml|xtiming|xmodel|xpreset|lms|las|pgo)$/i.test(n) && !/__MACOSX|\/\._/.test(n);
  // Reads a zip's central directory and inflates only the entries worth keeping.
  const unzip = async (buf) => {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let e = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("no EOCD");
    let n = dv.getUint16(e + 10, true), off = dv.getUint32(e + 16, true);
    const out = [], skipped = [], td = new TextDecoder();
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(off + 10, true), cs = dv.getUint32(off + 20, true);
      const nl = dv.getUint16(off + 28, true), xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
      const name = td.decode(buf.subarray(off + 46, off + 46 + nl));
      off += 46 + nl + xl + cl;
      if (name.endsWith("/")) continue;
      if (!keep(name)) { skipped.push(name); continue; }
      if (cs === 0xffffffff || lho === 0xffffffff) { skipped.push(name + ":zip64"); continue; }
      const ln = dv.getUint16(lho + 26, true), lx = dv.getUint16(lho + 28, true);
      const data = buf.subarray(lho + 30 + ln + lx, lho + 30 + ln + lx + cs);
      if (method === 0) out.push({ name, data });
      else if (method === 8) out.push({ name, data: await pipe(data, new DecompressionStream("deflate-raw")) });
      else skipped.push(name + ":m" + method);
    }
    return { out, skipped };
  };
  const fname = (cd) => {
    const f = (cd.match(/filename\*=UTF-8''([^;]+)/i) || [])[1];
    return f ? decodeURIComponent(f) : (cd.match(/filename="?([^";]+)/i) || [])[1] || "download.bin";
  };
  const files = [];
  const take = async (it, r, rec) => {
    const fn = fname(r.headers.get("content-disposition") || "");
    const buf = new Uint8Array(await r.arrayBuffer());
    const f = { fn, size: buf.length };
    rec.files.push(f);
    if (buf[0] === 0x50 && buf[1] === 0x4b) {
      const { out, skipped } = await unzip(buf);
      f.kept = out.map((o) => o.name);
      f.skipped = skipped.length;
      for (const o of out) files.push({ name: it.id + "/" + o.name.split("/").slice(-2).join("__") + ".gz", data: await gz(o.data) });
    } else if (keep(fn)) files.push({ name: it.id + "/" + fn + ".gz", data: await gz(buf) });
    else f.unhandled = true;
  };
  // The category listing, most downloaded first.
  const items = [], seen = new Set();
  for (let p = 1; p <= 10; p++) {
    const d = new DOMParser().parseFromString(await (await fetch(`/sequences/categories/${category}/?order=download_count&direction=desc&page=${p}`)).text(), "text/html");
    const before = items.length;
    for (const si of d.querySelectorAll(".structItem--resource")) {
      const a = [...si.querySelectorAll(".structItem-title a")].find((x) => /^\/sequences\/[^/]+\.\d+\/$/.test(x.getAttribute("href") || ""));
      if (!a) continue;
      const id = +a.getAttribute("href").match(/\.(\d+)\/$/)[1];
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ id, url: a.getAttribute("href"), title: a.textContent.trim(), rank: items.length });
    }
    if (items.length === before) break;
  }
  st.total = Math.min(END, items.length) - START;
  for (const it of items.slice(START, END)) {
    const rec = { id: it.id, rank: it.rank, url: it.url, title: it.title, files: [] };
    st.recs.push(rec);
    try {
      const r = await fetch(it.url + "download", { redirect: "manual" });
      if (r.type === "opaqueredirect") rec.ext = true;
      else if ((r.headers.get("content-type") || "").includes("text/html")) {
        const d = new DOMParser().parseFromString(await r.text(), "text/html");
        const links = [...new Set([...d.querySelectorAll('a[href*="download?file="]')].map((a) => a.getAttribute("href")))];
        rec.multi = links.length;
        if (!links.length) rec.err = "html:" + d.title;
        for (const l of links) {
          await sleep(600);
          const r2 = await fetch(l, { redirect: "manual" });
          if (r2.type === "opaqueredirect") { rec.ext = true; continue; }
          await take(it, r2, rec);
        }
      } else await take(it, r, rec);
    } catch (e) {
      rec.err = String(e);
    }
    st.done++;
    await sleep(700);
  }
  files.push({ name: "_log_" + TAG + ".json", data: enc.encode(JSON.stringify(st.recs, null, 1)) });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(tar(files));
  a.download = "xlseq_" + TAG + ".tar";
  document.body.appendChild(a);
  a.click();
  st.finished = true;
};
