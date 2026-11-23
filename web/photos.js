/* =====================================================================
   松果 照片：市集貼文、美食店家可以放照片（Supabase Storage bucket「photos」）
   - 上傳前在瀏覽器壓縮：長邊 1280px、JPEG 品質 0.8，每張 300KB 以內（太大就再降畫質、縮小）
   - 每篇最多 4 張；只能上傳到自己的資料夾 photos/<uid>/…；每人每小時最多 20 張（資料庫擋）
   - 列表顯示縮圖，點開可以左右滑動看大圖
   用法：
     const pick = PH.picker({ max: 4, value: [], onChange: urls => st.photos = urls })   // 發文表單裡的選照片區
     PH.thumbs(post.photos)                                                            // 列表縮圖（沒有照片時回傳 null）
     PH.viewer(urls, 0)                                                                // 直接打開大圖
   權限與 bucket 的設定在 supabase/schema.sql。
   ===================================================================== */
(() => {
  "use strict";
  const MAX_SIDE = 1280, QUALITY = 0.8, MAX_BYTES = 300 * 1024, MAX_PHOTOS = 4, BUCKET = "photos";
  let app = { toast: () => {}, tr: s => s, translate: () => {} };

  function el(tag, attrs, ...kids){
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})){
      if (v == null || v === false) continue;
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "class") e.className = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)){ if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return e;
  }

  /* ---------- 壓縮：長邊 1280px、JPEG 0.8，超過 300KB 就再降畫質、縮小 ---------- */
  async function decode(file){
    if (window.createImageBitmap){ try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {} }
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const toBlob = (canvas, q) => new Promise(r => canvas.toBlob(r, "image/jpeg", q));
  async function compress(file){
    if (!file || !/^image\//.test(file.type)) throw { code: "not_image" };
    const img = await decode(file).catch(() => { throw { code: "not_image" }; });
    const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    let scale = Math.min(1, MAX_SIDE / Math.max(w0, h0)), q = QUALITY, blob = null;
    for (let i = 0; i < 8; i++){
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w0 * scale)); c.height = Math.max(1, Math.round(h0 * scale));
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);   // 透明 PNG 轉 JPEG 時底色用白色
      ctx.drawImage(img, 0, 0, c.width, c.height);
      blob = await toBlob(c, q);
      if (blob && blob.size <= MAX_BYTES) break;
      if (q > 0.6) q = Math.round((q - 0.1) * 10) / 10; else scale *= 0.8;
    }
    if (img.close) img.close();
    if (!blob || blob.size > MAX_BYTES) throw { code: "too_big" };
    return blob;
  }

  /* ---------- 上傳到 Supabase Storage ---------- */
  async function client(){ const ctx = window.songguoReady ? await window.songguoReady : null; if (!ctx) throw { code: "offline" }; return ctx; }
  const rid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 20);
  async function upload(file){
    const blob = await compress(file);
    const { sb, uid } = await client();
    const path = `${uid}/${Date.now().toString(36)}-${rid()}.jpg`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (error){
      const msg = String(error.message || error.error || "");
      throw { code: /row-level security|policy|quota|403|Unauthorized/i.test(msg) ? "quota" : /size|large|413/i.test(msg) ? "too_big" : "upload" };
    }
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  async function remove(url){
    try {
      const m = String(url).match(/\/object\/public\/photos\/(.+)$/); if (!m) return;
      const { sb } = await client(); await sb.storage.from(BUCKET).remove([decodeURIComponent(m[1])]);
    } catch {}
  }
  const ERR = {
    not_image: "這個檔案不是照片，請選 JPG、PNG 或 HEIC 照片。",
    too_big: "照片太大了，壓縮後還是超過 300KB，請換一張。",
    quota: "上傳太多照片了（每小時最多 20 張），請稍後再試。",
    offline: "連不上松果，請檢查網路後再試。",
    upload: "照片上傳失敗，請稍後再試。",
  };

  /* ---------- 發文表單的選照片區 ---------- */
  function picker(opts = {}){
    const max = Math.min(opts.max || MAX_PHOTOS, MAX_PHOTOS);
    const items = (opts.value || []).slice(0, max).map(url => ({ url }));
    const box = el("div", { class: "ph-picker" });
    const input = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
    const emit = () => opts.onChange && opts.onChange(items.filter(i => i.url).map(i => i.url));
    const draw = () => {
      const kids = items.map((it, i) => el("div", { class: "ph-slot" + (it.busy ? " busy" : "") },
        it.url ? el("img", { src: it.url, alt: "", loading: "lazy" }) : it.preview ? el("img", { src: it.preview, alt: "" }) : null,
        it.busy ? el("span", { class: "ph-busy" }, app.tr("上傳中…")) : null,
        !it.busy ? el("button", { type: "button", class: "ph-x", "aria-label": app.tr("移除照片"), onclick: () => {
          if (it.url && !(opts.value || []).includes(it.url)) remove(it.url);   // 剛上傳但還沒發布的照片，移除時一起刪掉
          items.splice(i, 1); draw(); emit(); } }, "×") : null));
      if (items.length < max) kids.push(el("button", { type: "button", class: "ph-add", onclick: () => input.click() },
        el("span", { class: "ph-plus", "aria-hidden": "true" }, "＋"), el("span", {}, app.tr("加照片")), el("small", {}, `${items.length}/${max}`)));
      box.replaceChildren(input, ...kids);
    };
    input.addEventListener("change", async () => {
      const all = [...input.files], files = all.slice(0, max - items.length); input.value = "";
      if (all.length > files.length) app.toast("每篇最多 4 張照片");
      await Promise.all(files.map(async f => {
        const it = { busy: true, preview: URL.createObjectURL(f) }; items.push(it); draw();
        try { it.url = await upload(f); }
        catch (e){ app.toast(ERR[e && e.code] || ERR.upload); items.splice(items.indexOf(it), 1); }
        finally { it.busy = false; URL.revokeObjectURL(it.preview); it.preview = null; }
        draw(); emit();
      }));
    });
    box.busy = () => items.some(i => i.busy);      // 發布按鈕可以先檢查：還在上傳就等一下
    draw();
    return box;
  }

  /* ---------- 列表縮圖 ---------- */
  function okUrl(u){
    if (typeof u !== "string") return false;
    if (/^data:image\/(jpeg|png|webp);/.test(u)) return true;
    const base = ((window.SONGGUO_CONFIG || {}).supabaseUrl || "").replace(/\/+$/, "");
    return !!base && u.startsWith(base + "/storage/v1/object/public/" + BUCKET + "/");
  }
  function thumbs(urls, opts = {}){
    // 只顯示我們自己 Supabase「photos」bucket 的照片（以及預覽頁用的 data: 圖），避免有人在貼文裡塞外部網址追蹤讀者
    const list = (Array.isArray(urls) ? urls : []).filter(okUrl).slice(0, MAX_PHOTOS);
    if (!list.length) return null;
    return el("div", { class: "ph-thumbs n" + list.length + (opts.small ? " small" : "") },
      list.map((u, i) => el("button", { type: "button", class: "ph-thumb", "aria-label": app.tr("看大圖") + ` ${i + 1}/${list.length}`, onclick: e => { e.stopPropagation(); viewer(list, i); } },
        el("img", { src: u, alt: "", loading: "lazy", decoding: "async" }),
        i === 3 && urls.length > 4 ? el("span", { class: "ph-more" }, `+${urls.length - 4}`) : null)));
  }

  /* ---------- 大圖：左右滑動（手機用手指滑、電腦用方向鍵或按鈕） ---------- */
  function viewer(urls, start = 0){
    const prevFocus = document.activeElement;
    const track = el("div", { class: "ph-track" }, urls.map(u => el("figure", {}, el("img", { src: u, alt: "", decoding: "async" }))));
    const count = el("span", { class: "ph-count" });
    const close = () => { scrim.remove(); document.removeEventListener("keydown", key); document.body.classList.remove("ph-open"); if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); };
    const go = i => { i = Math.max(0, Math.min(urls.length - 1, i)); track.scrollTo({ left: i * track.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
    const cur = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const upd = () => { count.textContent = `${cur() + 1} / ${urls.length}`; };
    const key = e => { if (e.key === "Escape") close(); else if (e.key === "ArrowRight") go(cur() + 1); else if (e.key === "ArrowLeft") go(cur() - 1); };
    const scrim = el("div", { class: "ph-viewer", role: "dialog", "aria-modal": "true", "aria-label": app.tr("照片") },
      track,
      el("div", { class: "ph-bar" }, count, el("button", { type: "button", class: "ph-close", "aria-label": app.tr("關閉"), onclick: close }, "×")),
      urls.length > 1 ? el("button", { type: "button", class: "ph-nav prev", "aria-label": app.tr("上一張"), onclick: () => go(cur() - 1) }, "‹") : null,
      urls.length > 1 ? el("button", { type: "button", class: "ph-nav next", "aria-label": app.tr("下一張"), onclick: () => go(cur() + 1) }, "›") : null);
    track.addEventListener("scroll", upd, { passive: true });
    track.addEventListener("click", e => { if (e.target === track) close(); });
    document.addEventListener("keydown", key);
    document.body.append(scrim); document.body.classList.add("ph-open");
    app.translate(scrim);
    requestAnimationFrame(() => { track.scrollLeft = start * track.clientWidth; upd(); scrim.querySelector(".ph-close").focus({ preventScroll: true }); });
    return scrim;
  }

  window.sgPhotos = { init(o){ app = { ...app, ...o }; }, compress, upload, remove, picker, thumbs, viewer, MAX_BYTES, MAX_SIDE };
})();
