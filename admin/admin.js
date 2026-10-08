(() => {
  "use strict";

  const S = window.R18Store;
  const { esc, money } = S;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const IMG_BASE = "../";
  const img = src => esc(S.imgSrc(src, IMG_BASE));
  const total = S.totalStock;

  const LABEL = { nuevo: "Nuevo", confirmado: "Confirmado", enviado: "Enviado", entregado: "Entregado", cancelado: "Cancelado" };
  const PAGO = { efectivo: "Efectivo", transferencia: "Transferencia" };
  const TITLES = { resumen: "Resumen", productos: "Productos", pedidos: "Pedidos", ajustes: "Ajustes" };

  let products = [], orders = [];
  let knownIds = new Set();
  let openOrderId = null;
  const ui = { prodQ: "", prodCat: "", prodState: "", ordStatus: "todos", ordQ: "" };

  /* ---------- Utilidades ---------- */
  const badge = st => `<span class="badge b-${st}">${LABEL[st]}</span>`;
  const pad = n => String(n).padStart(2, "0");
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtShort = iso => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtLong = iso => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const units = o => o.items.reduce((a, l) => a + l.qty, 0);
  const flow = o => o.entrega === "envio" ? ["nuevo", "confirmado", "enviado", "entregado"] : ["nuevo", "confirmado", "entregado"];
  const nextStatus = o => { const f = flow(o), i = f.indexOf(o.status); return i >= 0 && i < f.length - 1 ? f[i + 1] : null; };

  function load() {
    products = S.getProducts();
    orders = S.getOrders();
  }

  let toastTimer;
  function toast(msg, action) {
    const t = $("#toast");
    t.replaceChildren(document.createTextNode(msg));
    if (action) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = action.label;
      b.addEventListener("click", () => { t.classList.remove("show"); action.fn(); });
      t.append(b);
    }
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), action ? 7000 : 2600);
  }

  function confirmBox({ title, text, ok = "Confirmar", danger = true }) {
    const d = $("#confirmDialog");
    $("#confirmTitle").textContent = title;
    $("#confirmText").textContent = text;
    const b = $("#confirmOk");
    b.textContent = ok;
    b.className = "btn " + (danger ? "btn-danger" : "btn-primary");
    d.returnValue = "";
    return new Promise(res => {
      d.addEventListener("close", () => res(d.returnValue === "ok"), { once: true });
      d.showModal();
    });
  }

  /* ---------- Router ---------- */
  const route = () => { const r = (location.hash.match(/^#\/(\w+)/) || [])[1]; return TITLES[r] ? r : "resumen"; };
  let lastRoute = null;

  function render() {
    const r = route();
    $("#pageTitle").textContent = TITLES[r];
    $$(".side-nav a").forEach(a => { if (a.dataset.route === r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });

    const newCount = orders.filter(o => o.status === "nuevo").length;
    const nb = $("#navBadge");
    nb.hidden = !newCount; nb.textContent = newCount;
    document.title = (newCount ? `(${newCount}) ` : "") + "ROAD 18 · Administración";

    $("#topActions").innerHTML = r === "productos"
      ? `<button class="btn btn-primary" type="button" data-act="new"><span aria-hidden="true">+</span> <span class="lbl">Nuevo producto</span></button>` : "";

    const view = $("#view");
    ({ resumen: viewResumen, productos: viewProductos, pedidos: viewPedidos, ajustes: viewAjustes })[r](view);
    if (lastRoute !== null && lastRoute !== r) view.focus({ preventScroll: true });
    lastRoute = r;
    if (openOrderId) renderOrderPanel();
  }

  function refresh() { load(); knownIds = new Set(orders.map(o => o.id)); render(); }

  /* ---------- Resumen ---------- */
  function niceMax(m) {
    if (m <= 0) return 10000;
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    return ([1, 2, 2.5, 5, 10].map(x => x * p).find(v => v >= m)) || 10 * p;
  }
  const short = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n));

  function chartSVG(days) {
    const W = 700, H = 230, L = 46, R = 8, T = 12, B = 28;
    const max = niceMax(Math.max(...days.map(d => d.value)));
    const iw = W - L - R, ih = H - T - B, step = iw / days.length, bw = Math.min(30, step * .62);
    let g = "";
    for (let i = 0; i <= 4; i++) {
      const y = T + ih - ih * i / 4;
      g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end">$${short(max * i / 4)}</text>`;
    }
    const bars = days.map((d, i) => {
      const x = L + step * i + (step - bw) / 2, h = ih * d.value / max, y = T + ih - h;
      return `<g><rect class="bar" x="${x}" y="${y}" width="${bw}" height="${Math.max(h, d.value ? 2 : 0)}" rx="3"><title>${d.label}: ${money(d.value)}</title></rect>
        <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${d.label}</text></g>`;
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ventas por día, últimos 14 días">${g}${bars}</svg>`;
  }

  function viewResumen(view) {
    const valid = orders.filter(o => o.status !== "cancelado");
    const since = Date.now() - 30 * 864e5;
    const last30 = valid.filter(o => new Date(o.date) >= since);
    const sales30 = last30.reduce((a, o) => a + o.total, 0);
    const avg = valid.length ? valid.reduce((a, o) => a + o.total, 0) / valid.length : 0;
    const nuevos = orders.filter(o => o.status === "nuevo").length;
    const low = products.filter(p => total(p) <= S.LOW_STOCK).sort((a, b) => total(a) - total(b));
    const sold = products.filter(p => total(p) === 0).length;

    const days = [];
    const byDay = {};
    valid.forEach(o => { const k = dayKey(new Date(o.date)); byDay[k] = (byDay[k] || 0) + o.total; });
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push({ label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, value: byDay[dayKey(d)] || 0 });
    }
    const hasSales = days.some(d => d.value > 0);
    const recent = orders.slice(0, 5);

    view.innerHTML = `
      <section class="kpis" aria-label="Indicadores">
        <div class="card kpi"><div class="k-label">Ventas · 30 días</div><div class="k-value">${money(sales30)}</div><div class="k-sub">${last30.length} pedido${last30.length === 1 ? "" : "s"}</div></div>
        <div class="card kpi ${nuevos ? "alert" : ""}"><div class="k-label">Pedidos nuevos</div><div class="k-value">${nuevos}</div><div class="k-sub">${nuevos ? "Esperando confirmación" : "Todo al día"}</div></div>
        <div class="card kpi"><div class="k-label">Ticket promedio</div><div class="k-value">${money(avg)}</div><div class="k-sub">Sin contar cancelados</div></div>
        <div class="card kpi"><div class="k-label">Stock bajo</div><div class="k-value">${low.length}</div><div class="k-sub">${sold} agotado${sold === 1 ? "" : "s"} · ${products.length} productos</div></div>
      </section>

      <div class="grid2">
        <section class="card">
          <div class="card-head"><h2>Ventas por día</h2><span class="hint">Últimos 14 días</span></div>
          <div class="card-body">${hasSales ? chartSVG(days) : `<div class="empty"><strong>Todavía no hay ventas registradas</strong>
            <span>Cuando entren pedidos desde la tienda vas a ver acá su evolución.</span>
            <button class="btn" type="button" data-act="seed-demo">Cargar pedidos de ejemplo</button></div>`}</div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Atención de stock</h2><button class="link" type="button" data-go="productos">Ver productos</button></div>
          <ul class="list list-wrap">${low.length ? low.slice(0, 6).map(p => `
            <li><img class="thumb" src="${img(p.img)}" alt="">
              <div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${total(p) === 0 ? "Sin stock" : `Quedan ${total(p)} u.`}</div></div>
              <button class="btn btn-sm" type="button" data-act="edit" data-id="${esc(p.id)}">Reponer</button></li>`).join("")
            : `<li><div class="empty" style="width:100%;padding:18px"><span>Ningún producto con stock bajo.</span></div></li>`}</ul>
        </section>
      </div>

      <section class="card">
        <div class="card-head"><h2>Pedidos recientes</h2><button class="link" type="button" data-go="pedidos">Ver todos</button></div>
        ${recent.length ? `<ul class="list list-wrap">${recent.map(o => `
          <li><div class="grow"><div class="t"><button class="id-btn" type="button" data-open="${esc(o.id)}">${esc(o.id)}</button> · ${esc(o.customer.nombre)}</div>
            <div class="s">${fmtShort(o.date)} · ${units(o)} prenda${units(o) === 1 ? "" : "s"} · ${PAGO[o.pago]}</div></div>
            <strong>${money(o.total)}</strong>${badge(o.status)}</li>`).join("")}</ul>`
          : `<div class="empty"><strong>Sin pedidos todavía</strong><span>Los pedidos de la tienda aparecen acá en cuanto se confirman.</span></div>`}
      </section>`;
  }

  /* ---------- Productos ---------- */
  function stockBadge(p) {
    const t = total(p);
    return t === 0 ? `<span class="badge b-agotado">Agotado</span>` : t <= S.LOW_STOCK ? `<span class="badge b-bajo">Stock bajo</span>` : "";
  }

  function viewProductos(view) {
    const cats = [...new Set(products.map(p => p.cat))].sort();
    view.innerHTML = `
      <div class="toolbar">
        <label class="search"><span class="sr">Buscar producto</span><input type="search" id="prodQ" placeholder="Buscar por nombre o categoría…" value="${esc(ui.prodQ)}"></label>
        <label><span class="sr">Categoría</span><select id="prodCat"><option value="">Todas las categorías</option>
          ${cats.map(c => `<option ${c === ui.prodCat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label><span class="sr">Estado</span><select id="prodState">
          ${[["", "Todos los estados"], ["visible", "Visibles"], ["oculto", "Ocultos"], ["bajo", "Stock bajo"], ["agotado", "Agotados"]]
            .map(([v, l]) => `<option value="${v}" ${v === ui.prodState ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <span class="count" id="prodCount" aria-live="polite"></span>
      </div>
      <div class="card"><div class="table-wrap" id="prodTable"></div></div>`;
    renderProdTable();
  }

  function renderProdTable() {
    const q = norm(ui.prodQ.trim());
    const list = products.filter(p => {
      const t = total(p);
      if (q && !norm(p.name + " " + p.cat).includes(q)) return false;
      if (ui.prodCat && p.cat !== ui.prodCat) return false;
      switch (ui.prodState) {
        case "visible": return p.active !== false;
        case "oculto": return p.active === false;
        case "bajo": return t > 0 && t <= S.LOW_STOCK;
        case "agotado": return t === 0;
      }
      return true;
    });
    $("#prodCount").textContent = `${list.length} de ${products.length} producto${products.length === 1 ? "" : "s"}`;
    const box = $("#prodTable");
    if (!list.length) {
      box.innerHTML = products.length
        ? `<div class="empty"><strong>Sin resultados</strong><span>Probá con otra búsqueda o quitá los filtros.</span></div>`
        : `<div class="empty"><strong>Todavía no cargaste productos</strong><span>Agregá el primero para que aparezca en la tienda.</span><button class="btn btn-primary" type="button" data-act="new">+ Nuevo producto</button></div>`;
      return;
    }
    box.innerHTML = `<table>
      <thead><tr><th>Producto</th><th>Precio</th><th>Stock</th><th>Visible</th><th class="num"><span class="sr">Acciones</span></th></tr></thead>
      <tbody>${list.map(p => {
        const active = p.active !== false;
        return `<tr data-id="${esc(p.id)}">
          <td class="full"><div class="prod-cell"><img class="thumb" src="${img(p.img)}" alt="">
            <div><div class="t">${esc(p.name)}</div><div class="s">${esc(p.cat)}</div></div></div></td>
          <td data-label="Precio"><div class="price-in"><i>$</i><input class="price-edit" inputmode="numeric" autocomplete="off"
            value="${p.price.toLocaleString("es-AR")}" data-id="${esc(p.id)}" aria-label="Precio de ${esc(p.name)}"></div></td>
          <td data-label="Stock"><span class="stock-total">${total(p)}</span> ${stockBadge(p)}
            <div class="chips">${Object.entries(p.sizes).map(([s, n]) => `<span class="chip ${n === 0 ? "zero" : n <= 1 ? "low" : ""}">${esc(s)} · ${n}</span>`).join("")}</div></td>
          <td data-label="Visible"><div class="state-cell"><button class="switch" type="button" role="switch" aria-checked="${active}"
            aria-label="Visible en la tienda: ${esc(p.name)}" data-act="toggle" data-id="${esc(p.id)}"></button><span>${active ? "Visible" : "Oculto"}</span></div></td>
          <td class="full"><div class="actions">
            <button class="btn btn-sm" type="button" data-act="edit" data-id="${esc(p.id)}">Editar</button>
            <button class="btn btn-sm btn-quiet" type="button" data-act="del" data-id="${esc(p.id)}">Eliminar</button></div></td>
        </tr>`;
      }).join("")}</tbody></table>`;
  }

  function persistProducts(msg) {
    if (!S.saveProducts(products)) { load(); toast("No se pudo guardar los cambios (almacenamiento lleno)."); return false; }
    if (msg) toast(msg);
    return true;
  }

  function savePrice(input) {
    const p = products.find(x => x.id === input.dataset.id);
    if (!p) return;
    const n = Number(input.value.replace(/\D/g, ""));
    if (!n) { input.value = p.price.toLocaleString("es-AR"); input.classList.add("bad"); toast("Ingresá un precio válido"); setTimeout(() => input.classList.remove("bad"), 1500); return; }
    input.value = n.toLocaleString("es-AR");
    if (n === p.price) return;
    p.price = n;
    persistProducts(`Precio de “${p.name}” actualizado a ${money(n)}`);
  }

  /* ---------- Formulario de producto ---------- */
  const dlg = $("#prodDialog"), pf = $("#prodForm");
  let editingId = null, photoData = null;

  function sizeRow(label = "", qty = 0) {
    const row = document.createElement("div");
    row.className = "size-row";
    row.innerHTML = `<input class="sz-label" maxlength="8" placeholder="Talle (S, M, 42…)" aria-label="Talle" value="${esc(label)}">
      <div class="qty-wrap"><input class="sz-qty" type="number" min="0" step="1" inputmode="numeric" aria-label="Stock del talle" value="${qty}"><small>u.</small></div>
      <button class="icon-btn" type="button" data-rm-size aria-label="Quitar talle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7Zm3-3h6l1 2H8l1-2Z"/></svg></button>`;
    return row;
  }
  function setSizes(entries) { $("#sizesEd").replaceChildren(...entries.map(([l, q]) => sizeRow(l, q))); }
  function setPhoto(src) {
    photoData = src || null;
    $("#photoImg").hidden = !photoData; $("#photoEmpty").hidden = !!photoData; $("#photoClear").hidden = !photoData;
    if (photoData) $("#photoImg").src = S.imgSrc(photoData, IMG_BASE);
  }

  function openProduct(id) {
    editingId = id || null;
    const p = id ? products.find(x => x.id === id) : null;
    $("#prodTitle").textContent = p ? "Editar producto" : "Nuevo producto";
    $("#prodSave").textContent = p ? "Guardar cambios" : "Crear producto";
    $("#catList").innerHTML = [...new Set(products.map(x => x.cat))].map(c => `<option value="${esc(c)}">`).join("");
    pf.reset();
    pf.elements.name.value = p ? p.name : "";
    pf.elements.cat.value = p ? p.cat : "";
    pf.elements.price.value = p ? p.price : "";
    pf.elements.desc.value = p ? p.desc || "" : "";
    pf.elements.active.checked = p ? p.active !== false : true;
    setSizes(p ? Object.entries(p.sizes) : ["S", "M", "L", "XL"].map(s => [s, 0]));
    setPhoto(p ? p.img : null);
    $$(".bad", pf).forEach(e => e.classList.remove("bad"));
    $("#prodError").hidden = true;
    dlg.showModal();
    pf.elements.name.focus();
  }

  function readImage(file) {
    return new Promise((res, rej) => {
      if (!file.type.startsWith("image/")) return rej(new Error("El archivo no es una imagen."));
      const fr = new FileReader();
      fr.onerror = () => rej(new Error("No se pudo leer el archivo."));
      fr.onload = () => {
        const im = new Image();
        im.onerror = () => rej(new Error("No se pudo abrir la imagen."));
        im.onload = () => {
          const max = 900, k = Math.min(1, max / Math.max(im.width, im.height));
          const c = document.createElement("canvas");
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(im, 0, 0, c.width, c.height);
          res(c.toDataURL("image/jpeg", .82));
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function submitProduct(e) {
    e.preventDefault();
    $$(".bad", pf).forEach(x => x.classList.remove("bad"));
    const errs = [];
    const flag = (el, msg) => { el.classList.add("bad"); errs.push(msg); };

    const name = pf.elements.name.value.trim();
    const cat = pf.elements.cat.value.trim();
    const priceRaw = pf.elements.price.value.replace(/\./g, "").trim();
    const price = Number(priceRaw);
    if (!name) flag(pf.elements.name, "Poné un nombre.");
    if (!cat) flag(pf.elements.cat, "Elegí o escribí una categoría.");
    if (!/^\d+$/.test(priceRaw) || price <= 0) flag(pf.elements.price, "El precio debe ser un número mayor a 0.");

    const rows = $$(".size-row", pf);
    const sizes = {}, seen = new Set();
    if (!rows.length) errs.push("Agregá al menos un talle (o usá “Talle único”).");
    rows.forEach(r => {
      const l = $(".sz-label", r), q = $(".sz-qty", r);
      const label = l.value.trim(), qty = Number(q.value);
      if (!label) return flag(l, "Hay un talle sin nombre.");
      if (seen.has(norm(label))) return flag(l, `El talle “${label}” está repetido.`);
      if (!Number.isInteger(qty) || qty < 0 || q.value === "") return flag(q, `Stock inválido en el talle ${label}.`);
      seen.add(norm(label)); sizes[label] = qty;
    });

    if (errs.length) {
      const box = $("#prodError");
      box.textContent = [...new Set(errs)].join(" ");
      box.hidden = false;
      ($(".bad", pf) || box).focus?.();
      return;
    }

    const data = { name, cat, price, desc: pf.elements.desc.value.trim(), sizes, img: photoData || "", active: pf.elements.active.checked };
    if (editingId) {
      Object.assign(products.find(p => p.id === editingId), data);
    } else {
      const base = norm(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "producto";
      let id = base, n = 2;
      while (products.some(p => p.id === id)) id = `${base}-${n++}`;
      products.unshift({ id, ...data });
    }
    if (!persistProducts()) {
      const box = $("#prodError");
      box.textContent = "No se pudo guardar: el almacenamiento del navegador está lleno. Probá con una foto más liviana.";
      box.hidden = false;
      return;
    }
    dlg.close();
    toast(editingId ? `“${name}” actualizado` : `“${name}” agregado al catálogo`);
    render();
  }

  /* ---------- Pedidos ---------- */
  function viewPedidos(view) {
    const counts = { todos: orders.length };
    S.STATUSES.forEach(s => { counts[s] = orders.filter(o => o.status === s).length; });
    view.innerHTML = `
      <div class="tabs" role="group" aria-label="Filtrar por estado">
        ${["todos", ...S.STATUSES].map(s => `<button class="tab" type="button" data-status="${s}" aria-pressed="${ui.ordStatus === s}">${s === "todos" ? "Todos" : LABEL[s]}<b>${counts[s]}</b></button>`).join("")}
      </div>
      <div class="toolbar">
        <label class="search"><span class="sr">Buscar pedido</span><input type="search" id="ordQ" placeholder="Buscar por n.º de pedido o cliente…" value="${esc(ui.ordQ)}"></label>
        <span class="count" id="ordCount" aria-live="polite"></span>
      </div>
      <div class="card"><div class="table-wrap" id="ordTable"></div></div>`;
    renderOrdTable();
  }

  function renderOrdTable() {
    const q = norm(ui.ordQ.trim());
    const list = orders.filter(o => (ui.ordStatus === "todos" || o.status === ui.ordStatus) &&
      (!q || norm(o.id + " " + o.customer.nombre + " " + o.customer.tel).includes(q)));
    $("#ordCount").textContent = `${list.length} pedido${list.length === 1 ? "" : "s"}`;
    const box = $("#ordTable");
    if (!list.length) {
      box.innerHTML = orders.length
        ? `<div class="empty"><strong>Sin resultados</strong><span>No hay pedidos con ese filtro.</span></div>`
        : `<div class="empty"><strong>Todavía no hay pedidos</strong><span>Cuando alguien compre en la tienda, el pedido aparece acá automáticamente.</span>
            <button class="btn" type="button" data-act="seed-demo">Cargar pedidos de ejemplo</button></div>`;
      return;
    }
    box.innerHTML = `<table>
      <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Entrega</th><th>Pago</th><th class="num">Total</th><th>Estado</th></tr></thead>
      <tbody>${list.map(o => `
        <tr data-order="${esc(o.id)}" class="${o.status === "nuevo" ? "is-new" : ""}" style="cursor:pointer">
          <td data-label="Pedido"><button class="id-btn" type="button" data-open="${esc(o.id)}">${esc(o.id)}</button></td>
          <td data-label="Fecha">${fmtShort(o.date)}</td>
          <td data-label="Cliente"><div style="font-weight:550">${esc(o.customer.nombre)}</div><div class="hint">${esc(o.customer.tel)}</div></td>
          <td data-label="Entrega">${o.entrega === "envio" ? `Envío · ${esc(o.address?.loc || "")}` : "Retiro en Villa María"}</td>
          <td data-label="Pago">${PAGO[o.pago]}</td>
          <td data-label="Total" class="num"><strong>${money(o.total)}</strong></td>
          <td data-label="Estado">${badge(o.status)}</td>
        </tr>`).join("")}</tbody></table>`;
  }

  /* ---------- Detalle de pedido ---------- */
  const panel = $("#orderPanel"), oScrim = $("#orderScrim");
  let panelReturn = null;

  function openOrder(id) {
    if (!orders.some(o => o.id === id)) return;
    panelReturn = document.activeElement;
    openOrderId = id;
    renderOrderPanel();
    oScrim.hidden = false;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    $("#closePanel", panel)?.focus();
  }
  function closeOrder() {
    openOrderId = null;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    oScrim.hidden = true;
    panelReturn?.focus?.();
  }

  function renderOrderPanel() {
    const o = orders.find(x => x.id === openOrderId);
    if (!o) { closeOrder(); return; }
    const f = flow(o), cur = f.indexOf(o.status);
    const nxt = nextStatus(o);
    const nextLabel = !nxt ? "" :
      nxt === "confirmado" ? (o.pago === "transferencia" ? "Confirmar pago" : "Confirmar pedido") :
      nxt === "enviado" ? "Marcar como enviado" :
      o.entrega === "envio" ? "Marcar como entregado" : "Marcar como retirado";
    const stepLabel = s => s === "nuevo" ? "Recibido" : s === "entregado" && o.entrega !== "envio" ? "Retirado" : LABEL[s];
    const a = o.address;

    panel.innerHTML = `
      <header class="panel-head">
        <div><h2 id="orderPanelTitle">Pedido ${esc(o.id)}</h2>
          <div class="s">${fmtLong(o.date)} · ${units(o)} prenda${units(o) === 1 ? "" : "s"}</div></div>
        <div style="display:flex;align-items:center;gap:8px">${badge(o.status)}
          <button class="icon-btn" id="closePanel" type="button" aria-label="Cerrar detalle">✕</button></div>
      </header>
      <div class="panel-body">
        <section class="sec">
          <h3>Seguimiento</h3>
          ${o.status === "cancelado"
            ? `<p class="note">Pedido cancelado${o.demo ? "." : ". Las unidades volvieron al stock del catálogo."}</p>`
            : `<ol class="steps" aria-label="Estado del pedido">${f.map((s, i) => `<li class="${i <= cur ? "done" : ""} ${i === cur ? "current" : ""}" ${i === cur ? 'aria-current="step"' : ""}>${stepLabel(s)}</li>`).join("")}</ol>`}
        </section>
        <section class="sec"><h3>Cliente</h3>
          <dl class="kv"><dt>Nombre</dt><dd>${esc(o.customer.nombre)}</dd>
            <dt>Teléfono</dt><dd><a href="tel:${esc(o.customer.tel.replace(/[^\d+]/g, ""))}">${esc(o.customer.tel)}</a></dd></dl></section>
        <section class="sec"><h3>Entrega</h3>
          ${o.entrega === "envio" && a
            ? `<dl class="kv"><dt>Método</dt><dd>Correo Argentino</dd><dt>Dirección</dt><dd>${esc(a.dir)}</dd>
               <dt>Localidad</dt><dd>${esc(a.loc)} (${esc(a.cp)})</dd><dt>Provincia</dt><dd>${esc(a.prov)}</dd></dl>
               <p class="note" style="margin-top:8px">Costo de envío pendiente de coordinar con el cliente.</p>`
            : `<dl class="kv"><dt>Método</dt><dd>Retiro en Villa María</dd></dl>
               <p class="note" style="margin-top:8px">Coordinar punto y horario de retiro.</p>`}</section>
        <section class="sec"><h3>Pago</h3>
          <dl class="kv"><dt>Método</dt><dd>${PAGO[o.pago]}</dd></dl>
          <p class="note" style="margin-top:8px">${o.pago === "transferencia" ? "Verificá el comprobante antes de confirmar el pago." : "Se cobra en efectivo al retirar."}</p></section>
        <section class="sec"><h3>Productos</h3>
          <ul class="items">${o.items.map(l => `<li><img class="thumb" src="${img(l.img)}" alt="">
            <div class="grow"><div class="t">${esc(l.name)}</div><div class="s">Talle ${esc(l.size)} · ${l.qty} × ${money(l.price)}</div></div>
            <strong>${money(l.qty * l.price)}</strong></li>`).join("")}</ul>
          <div class="total-row"><span>Total</span><span>${money(o.total)}</span></div></section>
      </div>
      ${nxt || (o.status !== "entregado" && o.status !== "cancelado") ? `<footer class="panel-foot">
        ${o.status !== "entregado" && o.status !== "cancelado" ? `<button class="btn" type="button" data-order-act="cancelado">Cancelar pedido</button>` : ""}
        ${nxt ? `<button class="btn btn-primary" type="button" data-order-act="${nxt}">${nextLabel}</button>` : ""}
      </footer>` : ""}`;
  }

  async function changeOrder(status) {
    const o = orders.find(x => x.id === openOrderId);
    if (!o) return;
    if (status === "cancelado") {
      const ok = await confirmBox({
        title: `¿Cancelar el pedido ${o.id}?`,
        text: o.demo ? "El pedido pasará a estado cancelado." : "Las unidades de este pedido volverán al stock del catálogo. Esta acción no se puede deshacer.",
        ok: "Sí, cancelar pedido",
      });
      if (!ok) return;
    }
    if (!S.setOrderStatus(o.id, status)) { toast("No se pudo actualizar el pedido."); return; }
    load();
    toast(status === "cancelado" ? `Pedido ${o.id} cancelado` : `Pedido ${o.id}: ${LABEL[status].toLowerCase()}`);
    render();
  }

  /* ---------- Ajustes ---------- */
  function viewAjustes(view) {
    const demo = orders.filter(o => o.demo).length;
    view.innerHTML = `
      <div class="set-list">
        <section class="card"><div class="card-body">
          <div class="set-row"><div><strong>Pedidos de ejemplo</strong><p>Carga pedidos ficticios para ver cómo funcionan el resumen y la lista de pedidos. ${demo ? `Hay ${demo} cargados.` : ""}</p></div>
            <div class="btns"><button class="btn" type="button" data-act="seed-demo">Cargar ejemplos</button>
            <button class="btn" type="button" data-act="clear-demo" ${demo ? "" : "disabled"}>Borrar ejemplos</button></div></div>
          <div class="set-row"><div><strong>Restaurar catálogo original</strong><p>Vuelve a los 5 productos iniciales con su stock de ejemplo. Los pedidos no se tocan.</p></div>
            <div class="btns"><button class="btn" type="button" data-act="reset-catalog">Restaurar</button></div></div>
          <div class="set-row"><div><strong>Exportar datos</strong><p>Descarga productos y pedidos en un archivo JSON.</p></div>
            <div class="btns"><button class="btn" type="button" data-act="export">Descargar JSON</button></div></div>
        </div></section>
        <p class="note">Esta es una maqueta: los datos se guardan solo en este navegador y se comparten con la tienda del mismo sitio. Al conectar un servidor, los reemplaza la base de datos real.</p>
      </div>`;
  }

  /* ---------- Eventos ---------- */
  const view = $("#view");

  view.addEventListener("click", async e => {
    const t = e.target;
    const go = t.closest("[data-go]");
    if (go) { location.hash = "#/" + go.dataset.go; return; }
    const open = t.closest("[data-open]");
    if (open) { openOrder(open.dataset.open); return; }
    const tab = t.closest("[data-status]");
    if (tab) { ui.ordStatus = tab.dataset.status; viewPedidos(view); return; }
    const row = t.closest("tr[data-order]");
    if (row && !t.closest("button, a, input")) { openOrder(row.dataset.order); return; }

    const b = t.closest("[data-act]");
    if (!b) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case "new": openProduct(); break;
      case "edit": openProduct(id); break;
      case "toggle": {
        const p = products.find(x => x.id === id);
        p.active = p.active === false;
        if (persistProducts(`“${p.name}” ahora está ${p.active ? "visible" : "oculto"} en la tienda`)) render();
        break;
      }
      case "del": {
        const p = products.find(x => x.id === id);
        const ok = await confirmBox({ title: `¿Eliminar “${p.name}”?`, text: "Se quita del catálogo y de la tienda. Los pedidos anteriores conservan su detalle.", ok: "Eliminar producto" });
        if (!ok) break;
        products = products.filter(x => x.id !== id);
        if (persistProducts(`“${p.name}” eliminado`)) render();
        break;
      }
      case "seed-demo": S.seedDemoOrders(); toast("Pedidos de ejemplo cargados"); refresh(); break;
      case "clear-demo": S.clearDemoOrders(); toast("Pedidos de ejemplo borrados"); refresh(); break;
      case "reset-catalog":
        if (await confirmBox({ title: "¿Restaurar el catálogo original?", text: "Se pierden los productos, precios y stock que cambiaste.", ok: "Restaurar" })) {
          S.resetCatalog(); toast("Catálogo restaurado"); refresh();
        }
        break;
      case "export": {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([S.exportAll()], { type: "application/json" }));
        a.download = "road18-datos.json"; a.click(); URL.revokeObjectURL(a.href);
        break;
      }
    }
  });
  $("#topActions").addEventListener("click", e => { if (e.target.closest('[data-act="new"]')) openProduct(); });

  view.addEventListener("input", e => {
    if (e.target.id === "prodQ") { ui.prodQ = e.target.value; renderProdTable(); }
    if (e.target.id === "ordQ") { ui.ordQ = e.target.value; renderOrdTable(); }
  });
  view.addEventListener("change", e => {
    if (e.target.id === "prodCat") { ui.prodCat = e.target.value; renderProdTable(); }
    if (e.target.id === "prodState") { ui.prodState = e.target.value; renderProdTable(); }
    if (e.target.classList.contains("price-edit")) savePrice(e.target);
  });
  view.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.classList.contains("price-edit")) e.target.blur();
  });
  view.addEventListener("focusin", e => { if (e.target.classList.contains("price-edit")) e.target.select(); });

  // Panel de pedido
  panel.addEventListener("click", e => {
    if (e.target.closest("#closePanel")) closeOrder();
    const a = e.target.closest("[data-order-act]");
    if (a) changeOrder(a.dataset.orderAct);
  });
  oScrim.addEventListener("click", closeOrder);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && openOrderId && !dlg.open && !$("#confirmDialog").open) closeOrder();
  });

  // Formulario de producto
  pf.addEventListener("submit", submitProduct);
  dlg.addEventListener("click", e => { if (e.target.closest("[data-close]")) dlg.close(); });
  $("#addSize").addEventListener("click", () => { const r = sizeRow("", 0); $("#sizesEd").append(r); $(".sz-label", r).focus(); });
  $("#sizesEd").addEventListener("click", e => { const b = e.target.closest("[data-rm-size]"); if (b) b.closest(".size-row").remove(); });
  pf.addEventListener("click", e => {
    const p = e.target.closest("[data-preset]");
    if (!p) return;
    setSizes(p.dataset.preset === "std" ? ["S", "M", "L", "XL"].map(s => [s, 0]) : [["Único", 0]]);
  });
  pf.addEventListener("input", e => e.target.classList.remove("bad"));
  $("#photoInput").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { setPhoto(await readImage(f)); } catch (err) { toast(err.message); }
  });
  $("#photoClear").addEventListener("click", () => setPhoto(null));

  // Menú móvil
  const side = $("#side"), scrim = $("#scrim"), menuBtn = $("#menuBtn");
  function menu(open) {
    side.classList.toggle("open", open); scrim.hidden = !open;
    menuBtn.setAttribute("aria-expanded", open);
  }
  menuBtn.addEventListener("click", () => menu(!side.classList.contains("open")));
  scrim.addEventListener("click", () => menu(false));
  side.addEventListener("click", e => { if (e.target.closest("a")) menu(false); });

  window.addEventListener("hashchange", render);

  // Cambios hechos desde otra pestaña (por ejemplo, una compra nueva en la tienda)
  S.subscribe(kind => {
    const before = knownIds;
    load();
    knownIds = new Set(orders.map(o => o.id));
    const fresh = orders.filter(o => !before.has(o.id));
    if (fresh.length) {
      const o = fresh[0];
      toast(`Nuevo pedido ${o.id} · ${money(o.total)}`, { label: "Ver", fn: () => { location.hash = "#/pedidos"; openOrder(o.id); } });
    }
    // Para no pisar lo que se está escribiendo, no se redibuja con el formulario abierto.
    if (!dlg.open) render();
  });

  /* ---------- Init ---------- */
  load();
  knownIds = new Set(orders.map(o => o.id));
  render();
})();
