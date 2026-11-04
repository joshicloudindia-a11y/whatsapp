/**
 * Public, embeddable WhatsApp chat widget.
 *
 *   <script src="https://www.bulkmarketing.online/widget.js" data-phone="919876543210" async></script>
 *
 * Attributes (all optional except data-phone):
 *   data-phone     WhatsApp number in international format (digits only are kept)
 *   data-message   Prefilled chat message
 *   data-greeting  Text shown in the popup bubble
 *   data-name      Business name shown in the popup header
 *   data-cta       Button label inside the popup (default "Start chat")
 *   data-color     Hex brand colour, e.g. #25D366
 *   data-position  "right" (default) or "left"
 *   data-open      Seconds after which the popup opens automatically (0 = never)
 *
 * The script never uses innerHTML with configured values (DOM + textContent only),
 * validates colour/position, renders inside a Shadow DOM, and sets no cookies/storage.
 */

export const dynamic = "force-static";

const WIDGET_JS = String.raw`(function () {
  "use strict";
  var w = window, d = document;
  var script = d.currentScript;
  if (!script) {
    var all = d.querySelectorAll("script[src*='widget.js'][data-phone]");
    script = all[all.length - 1];
  }
  if (!script) return;
  if (script.getAttribute("data-bm-loaded")) return;
  script.setAttribute("data-bm-loaded", "1");

  function attr(name, fallback, max) {
    var v = script.getAttribute("data-" + name);
    v = v == null ? "" : String(v).trim();
    if (!v) return fallback;
    return v.slice(0, max || 300);
  }

  var phone = attr("phone", "", 32).replace(/\D/g, "");
  if (phone.length < 7 || phone.length > 15) {
    if (w.console) w.console.warn("[WhatsApp widget] data-phone must be a number in international format, e.g. 919876543210");
    return;
  }
  var message = attr("message", "", 1000);
  var greeting = attr("greeting", "Hi there! How can we help you?", 300);
  var name = attr("name", "Chat with us", 60);
  var cta = attr("cta", "Start chat", 40);
  var colorRaw = attr("color", "#25D366", 9);
  var color = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(colorRaw) ? colorRaw : "#25D366";
  var left = attr("position", "right", 10).toLowerCase() === "left";
  var openAfter = parseInt(attr("open", "0", 4), 10);
  openAfter = isFinite(openAfter) && openAfter > 0 && openAfter <= 600 ? openAfter : 0;

  var href = "https://wa.me/" + phone + (message ? "?text=" + encodeURIComponent(message) : "");
  var side = left ? "left" : "right";

  var WA_PATH = "M16.04 3C9.4 3 4 8.38 4 15c0 2.12.56 4.19 1.62 6.01L4 27l6.16-1.6A12.06 12.06 0 0 0 16.04 27C22.66 27 28 21.62 28 15S22.66 3 16.04 3Zm0 21.97c-1.8 0-3.56-.48-5.1-1.4l-.37-.21-3.65.95.98-3.55-.24-.37A9.9 9.9 0 0 1 6.07 15c0-5.5 4.47-9.97 9.97-9.97 5.49 0 9.95 4.47 9.95 9.97 0 5.5-4.46 9.97-9.95 9.97Zm5.46-7.46c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48a9 9 0 0 1-1.66-2.07c-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.48.71.31 1.27.5 1.7.63.72.23 1.37.2 1.88.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z";
  var SVG_NS = "http://www.w3.org/2000/svg";
  function logo(size) {
    var svg = d.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    var p = d.createElementNS(SVG_NS, "path");
    p.setAttribute("d", WA_PATH);
    p.setAttribute("fill", "currentColor");
    svg.appendChild(p);
    return svg;
  }
  function closeIcon() {
    var svg = d.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true");
    var p = d.createElementNS(SVG_NS, "path");
    p.setAttribute("d", "M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 1 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4Z");
    p.setAttribute("fill", "currentColor");
    svg.appendChild(p);
    return svg;
  }
  function el(tag, cls, text) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var css =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
    ".wrap{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;display:flex;flex-direction:column;align-items:" + (left ? "flex-start" : "flex-end") + ";gap:12px}" +
    ".fab{width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:" + color + ";color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.18);transition:transform .2s ease}" +
    ".fab:hover{transform:scale(1.06)}.fab:focus-visible,.btn:focus-visible,.x:focus-visible{outline:3px solid rgba(0,0,0,.35);outline-offset:2px}" +
    ".pop{width:min(320px,calc(100vw - 40px));background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.2);opacity:0;transform:translateY(8px) scale(.98);transform-origin:bottom " + side + ";pointer-events:none;transition:opacity .2s ease,transform .2s ease}" +
    ".pop.open{opacity:1;transform:none;pointer-events:auto}" +
    ".hd{background:" + color + ";color:#fff;padding:14px 14px 14px 16px;display:flex;align-items:center;gap:10px}" +
    ".av{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0}" +
    ".tt{flex:1;min-width:0}.nm{font-size:15px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.st{font-size:12px;opacity:.9;margin-top:2px}" +
    ".x{background:transparent;border:0;color:#fff;cursor:pointer;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;opacity:.85}.x:hover{opacity:1;background:rgba(255,255,255,.15)}" +
    ".bd{background:#efeae2;padding:18px 16px}" +
    ".bub{background:#fff;color:#111b21;font-size:14px;line-height:1.45;padding:9px 12px;border-radius:0 10px 10px 10px;max-width:90%;box-shadow:0 1px 1px rgba(0,0,0,.08);white-space:pre-wrap;word-wrap:break-word}" +
    ".ft{padding:12px 16px 16px;background:#fff}" +
    ".btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:11px 14px;border-radius:999px;background:" + color + ";color:#fff;text-decoration:none;font-size:14px;font-weight:600;transition:filter .15s}.btn:hover{filter:brightness(.94)}" +
    "@media (prefers-reduced-motion:reduce){.fab,.pop{transition:none}}";

  var host = d.createElement("div");
  host.setAttribute("data-bm-whatsapp-widget", "");
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  var style = d.createElement("style");
  style.textContent = css;
  root.appendChild(style);

  var wrap = el("div", "wrap");
  var pop = el("div", "pop");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", name);
  pop.setAttribute("aria-hidden", "true");

  var hd = el("div", "hd");
  var av = el("div", "av");
  av.appendChild(logo(22));
  var tt = el("div", "tt");
  tt.appendChild(el("div", "nm", name));
  tt.appendChild(el("div", "st", "Typically replies within minutes"));
  var x = el("button", "x");
  x.type = "button";
  x.setAttribute("aria-label", "Close");
  x.appendChild(closeIcon());
  hd.appendChild(av); hd.appendChild(tt); hd.appendChild(x);

  var bd = el("div", "bd");
  bd.appendChild(el("div", "bub", greeting));

  var ft = el("div", "ft");
  var btn = el("a", "btn");
  btn.href = href;
  btn.target = "_blank";
  btn.rel = "noopener noreferrer";
  btn.appendChild(logo(18));
  btn.appendChild(d.createTextNode(cta));
  ft.appendChild(btn);

  pop.appendChild(hd); pop.appendChild(bd); pop.appendChild(ft);

  var fab = el("button", "fab");
  fab.type = "button";
  fab.setAttribute("aria-label", "Chat on WhatsApp");
  fab.setAttribute("aria-expanded", "false");
  fab.appendChild(logo(30));

  wrap.appendChild(pop);
  wrap.appendChild(fab);
  root.appendChild(wrap);

  var isOpen = false, touched = false;
  function setOpen(v) {
    isOpen = v;
    pop.className = v ? "pop open" : "pop";
    pop.setAttribute("aria-hidden", v ? "false" : "true");
    fab.setAttribute("aria-expanded", v ? "true" : "false");
  }
  fab.addEventListener("click", function () { touched = true; setOpen(!isOpen); });
  x.addEventListener("click", function () { touched = true; setOpen(false); });
  d.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen) setOpen(false); });

  function mount() {
    (d.body || d.documentElement).appendChild(host);
    if (openAfter) setTimeout(function () { if (!touched) setOpen(true); }, openAfter * 1000);
  }
  if (d.body) mount(); else d.addEventListener("DOMContentLoaded", mount);
})();
`;

export function GET() {
  return new Response(WIDGET_JS, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
