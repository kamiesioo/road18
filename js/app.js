(() => {
  "use strict";

  const store = window.R18Store;
  const { esc, money } = store;
  const LS_KEY = "road18-cart-v1";
  const LOW_STOCK = store.LOW_STOCK;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const totalStock = store.totalStock;

  let PRODUCTS = [], byId = {}, maxStock = 1;
  const state = {
    cat: "Todo",
    sort: "feat",
    onlyStock: false,
    picked: {},      // id -> talle elegido en la tarjeta
    cart: [],        // [{ id, size, qty }]
  };

  /** Lee el catálogo vigente (solo productos visibles) y deja consistente lo elegido en pantalla. */
  function loadProducts() {
    PRODUCTS = store.getProducts().filter(p => p.active !== false);
    byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
    maxStock = Math.max(1, ...PRODUCTS.map(totalStock));
    PRODUCTS.forEach(p => {
      const keys = Object.keys(p.sizes);
      if (!(state.picked[p.id] in p.sizes)) delete state.picked[p.id];
      if (keys.length === 1 && p.sizes[keys[0]] > 0) state.picked[p.id] = keys[0];
    });
    if (state.cat !== "Todo" && !PRODUCTS.some(p => p.cat === state.cat)) state.cat = "Todo";
  }

  /* ---------- Persistencia ---------- */
  function loadCart() {
    try {
      state.cart = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    } catch { state.cart = []; }
    sanitizeCart();
  }
  /** Quita del carrito lo que ya no existe o no tiene stock, y ajusta cantidades. */
  function sanitizeCart() {
    state.cart = state.cart.filter(l => byId[l.id] && byId[l.id].sizes[l.size] > 0)
      .map(l => ({ id: l.id, size: l.size, qty: Math.min(l.qty, byId[l.id].sizes[l.size]) }));
  }
  function saveCart() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.cart)); } catch { /* sin storage */ }
  }

  /* ---------- Catálogo ---------- */
  function renderChips() {
    const cats = ["Todo", ...new Set(PRODUCTS.map(p => p.cat))];
    $("#chips").innerHTML = cats.map(c =>
      `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="${c === state.cat}">${esc(c)}</button>`).join("");
  }

  function cardHTML(p) {
    const total = totalStock(p);
    const sold = total === 0;
    const low = !sold && total <= LOW_STOCK;
    const picked = state.picked[p.id];
    const sizes = Object.entries(p.sizes).map(([s, n]) =>
      `<button class="size" type="button" data-size="${esc(s)}" aria-pressed="${picked === s}" ${n === 0 ? "disabled" : ""}
        aria-label="Talle ${esc(s)}${n === 0 ? ", sin stock" : ""}">${esc(s)}</button>`).join("");
    const hint = picked ? `Talle ${esc(picked)}: quedan ${p.sizes[picked]}` : "Elegí un talle";
    return `
      <li class="item" data-id="${esc(p.id)}">
        <article class="card ${sold ? "soldout" : ""}">
          <div class="shot">
            <img src="${esc(store.imgSrc(p.img))}" alt="${esc(p.name)}" loading="lazy">
            ${sold ? `<span class="stamp big">Agotado</span>` : low ? `<span class="stamp">¡Últimas!</span>` : ""}
            <span class="price">${money(p.price)}</span>
          </div>
          <div class="info">
            <span class="cat">${esc(p.cat)}</span>
            <h3 class="name">${esc(p.name)}</h3>
            <p class="desc">${esc(p.desc)}</p>
            <div class="stock ${low ? "low" : ""}">
              <span>${sold ? "Sin stock" : `Stock: ${total} u.`}</span>
              <span class="bar" aria-hidden="true"><i style="width:${Math.round(total / maxStock * 100)}%"></i></span>
            </div>
            ${sold ? "" : `<div class="sizes" role="group" aria-label="Talles de ${esc(p.name)}">${sizes}</div>
            <p class="size-hint">${hint}</p>`}
            <button class="add" type="button" ${sold ? "disabled" : ""}>${sold ? "Agotado" : "Agregar al carrito"}</button>
          </div>
        </article>
      </li>`;
  }

  function renderGrid() {
    let list = PRODUCTS.filter(p => (state.cat === "Todo" || p.cat === state.cat) && (!state.onlyStock || totalStock(p) > 0));
    if (state.sort === "asc") list = [...list].sort((a, b) => a.price - b.price);
    if (state.sort === "desc") list = [...list].sort((a, b) => b.price - a.price);
    $("#grid").innerHTML = list.map(cardHTML).join("");
    $("#gridEmpty").hidden = list.length > 0;
  }


  /* ---------- Carrito ---------- */
  const inCart = (id, size) => state.cart.find(l => l.id === id && l.size === size);
  const cartCount = () => state.cart.reduce((a, l) => a + l.qty, 0);
  const cartTotal = () => state.cart.reduce((a, l) => a + l.qty * byId[l.id].price, 0);

  function addToCart(id) {
    const p = byId[id];
    const size = state.picked[id];
    if (!size) {
      const row = $(`.item[data-id="${id}"] .sizes`);
      row.classList.remove("shake"); void row.offsetWidth; row.classList.add("shake");
      toast("Elegí un talle primero");
      return;
    }
    const line = inCart(id, size);
    const have = line ? line.qty : 0;
    if (have >= p.sizes[size]) { toast(`No hay más stock del talle ${size}`); return; }
    if (line) line.qty++; else state.cart.push({ id, size, qty: 1 });
    saveCart(); renderCart();
    const btn = $("#openCart"); btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump");
    toast(`${p.name} · ${size} agregada`);
  }

  function changeQty(id, size, d) {
    const line = inCart(id, size);
    if (!line) return;
    const next = line.qty + d;
    if (next <= 0) { state.cart = state.cart.filter(l => l !== line); }
    else if (next <= byId[id].sizes[size]) line.qty = next;
    saveCart(); renderCart();
  }

  function renderCart() {
    const n = cartCount();
    $("#cartCount").textContent = n;
    $("#openCart").setAttribute("aria-label", `Abrir carrito, ${n} ${n === 1 ? "producto" : "productos"}`);
    const empty = state.cart.length === 0;
    $("#cartEmpty").hidden = !empty;
    $("#checkout").hidden = empty;
    $("#drawerFoot").hidden = empty;
    $("#cartList").innerHTML = state.cart.map(l => {
      const p = byId[l.id];
      return `
        <li class="line" data-id="${esc(l.id)}" data-size="${esc(l.size)}">
          <img src="${esc(store.imgSrc(p.img))}" alt="">
          <div>
            <h3>${esc(p.name)}</h3>
            <p class="meta">Talle ${esc(l.size)} · ${money(p.price)} c/u</p>
            <div class="qty">
              <button type="button" data-d="-1" aria-label="Quitar una unidad">−</button>
              <output aria-live="polite">${l.qty}</output>
              <button type="button" data-d="1" aria-label="Sumar una unidad" ${l.qty >= p.sizes[l.size] ? "disabled" : ""}>+</button>
            </div>
          </div>
          <div class="side">
            <span class="lp">${money(p.price * l.qty)}</span>
            <button class="rm" type="button" data-d="-999">Quitar</button>
          </div>
        </li>`;
    }).join("");
    $("#subtotal").textContent = money(cartTotal());
    $("#total").textContent = money(cartTotal());
    syncCheckout();
  }

  /* ---------- Checkout (estático) ---------- */
  const form = $("#checkout");
  const val = name => form.elements[name].value.trim();
  const radio = name => form.elements[name].value;

  function syncCheckout() {
    const envio = radio("entrega") === "envio";
    $("#shipFields").hidden = !envio;
    $("#shipping").textContent = envio ? "A coordinar" : "Retiro gratis";

    // El efectivo solo aplica al retiro personal.
    const cash = form.querySelector('input[value="efectivo"]');
    cash.disabled = envio;
    $("#optEfectivo").classList.toggle("opt-disabled", envio);
    if (envio && cash.checked) form.querySelector('input[value="transferencia"]').checked = true;

    const pago = radio("pago");
    $("#bank").hidden = pago !== "transferencia";
    $("#payNote").textContent = pago === "efectivo"
      ? "Pagás en efectivo cuando retirás el pedido en Villa María."
      : envio
        ? "Efectivo solo está disponible con retiro. Para envíos, pagá por transferencia: te confirmamos el costo antes."
        : "Hacé la transferencia y mandanos el comprobante: reservamos tus prendas por 24 hs.";
  }

  function validate() {
    let ok = true, firstBad = null;
    const need = ["nombre", "tel"];
    if (radio("entrega") === "envio") need.push("dir", "loc", "cp", "prov");
    ["nombre", "tel", "dir", "loc", "cp", "prov"].forEach(n => form.elements[n].classList.remove("bad"));
    need.forEach(n => {
      const el = form.elements[n];
      const v = el.value.trim();
      const bad = !v || (n === "nombre" && v.length < 3) || (n === "tel" && !/^[0-9+()\s-]{8,}$/.test(v));
      if (bad) { ok = false; el.classList.add("bad"); firstBad = firstBad || el; }
    });
    if (firstBad) { firstBad.focus(); toast("Completá los datos marcados"); }
    return ok;
  }

  function confirmOrder(e) {
    e.preventDefault();
    if (!state.cart.length || !validate()) return;
    const pago = radio("pago"), envio = radio("entrega") === "envio";
    sanitizeCart();
    if (!state.cart.length) { renderCart(); renderGrid(); toast("Tu carrito cambió: ya no hay stock de lo que elegiste"); return; }

    const res = store.placeOrder({
      customer: { nombre: val("nombre"), tel: val("tel") },
      entrega: envio ? "envio" : "retiro",
      address: envio ? { dir: val("dir"), loc: val("loc"), cp: val("cp"), prov: val("prov") } : null,
      pago,
      items: state.cart.map(l => ({ id: l.id, size: l.size, qty: l.qty })),
    });
    if (!res.ok) { loadProducts(); sanitizeCart(); renderChips(); renderGrid(); renderCart(); toast(res.error); return; }
    const order = res.order;

    $("#orderId").textContent = order.id;
    $("#orderTotal").textContent = money(order.total);
    $("#orderList").replaceChildren(...order.items.map(l => {
      const li = document.createElement("li");
      const a = document.createElement("span"), b = document.createElement("b");
      a.textContent = `${l.qty}× ${l.name} (${l.size})`;
      b.textContent = money(l.qty * l.price);
      li.append(a, b);
      return li;
    }));

    const next = $("#orderNext");
    const p1 = document.createElement("p");
    p1.append(`Hola ${val("nombre").split(" ")[0]}, `);
    const s = document.createElement("strong");
    s.textContent = pago === "efectivo" ? "pagás en efectivo al retirar" : "pagás por transferencia";
    p1.append(s, ".");
    const p2 = document.createElement("p");
    p2.textContent = pago === "efectivo"
      ? "Te escribimos para coordinar día y horario de retiro en Villa María."
      : `Transferí a alias ${$("#alias").textContent} y mandá el comprobante por Instagram (@road18_) con tu número de pedido.`;
    next.replaceChildren(p1, p2);
    if (envio) {
      const p3 = document.createElement("p");
      p3.textContent = "Envío por Correo Argentino: te confirmamos el costo antes de despachar.";
      next.append(p3);
    }

    // El stock ya se descontó en el store: recargamos para reflejarlo.
    state.cart = []; saveCart();
    loadProducts();
    form.reset(); syncCheckout();
    renderChips(); renderGrid(); renderCart();
    closeCart();
    $("#orderModal").showModal();
  }

  /* ---------- Drawer ---------- */
  const drawer = $("#drawer"), overlay = $("#overlay");
  let lastFocus = null;
  function openCart() {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    $("#closeCart").focus();
  }
  function closeCart() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    overlay.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* ---------- Eventos ---------- */
  $("#chips").addEventListener("click", e => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    state.cat = b.dataset.cat; renderChips(); renderGrid();
  });
  $("#sort").addEventListener("change", e => { state.sort = e.target.value; renderGrid(); });
  $("#onlyStock").addEventListener("change", e => { state.onlyStock = e.target.checked; renderGrid(); });

  $("#grid").addEventListener("click", e => {
    const item = e.target.closest(".item"); if (!item) return;
    const id = item.dataset.id;
    const sz = e.target.closest(".size");
    if (sz) { state.picked[id] = sz.dataset.size; renderGrid(); $(`.item[data-id="${id}"] .size[aria-pressed="true"]`)?.focus(); return; }
    if (e.target.closest(".add")) addToCart(id);
  });

  $("#cartList").addEventListener("click", e => {
    const b = e.target.closest("[data-d]"); if (!b) return;
    const line = b.closest(".line");
    changeQty(line.dataset.id, line.dataset.size, Number(b.dataset.d));
  });

  document.addEventListener("click", e => {
    const link = e.target.closest("[data-filter-link]");
    if (link) { state.cat = link.dataset.filterLink; renderChips(); renderGrid(); }
  });

  $("#openCart").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#goCatalog").addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && drawer.classList.contains("open")) closeCart(); });

  $("#clearCart").addEventListener("click", () => { state.cart = []; saveCart(); renderCart(); });
  form.addEventListener("change", syncCheckout);
  form.addEventListener("input", e => e.target.classList.remove("bad"));
  form.addEventListener("submit", confirmOrder);
  $("#copyAlias").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#alias").textContent); toast("Alias copiado"); }
    catch { toast("Copialo a mano: " + $("#alias").textContent); }
  });
  $("#closeOrder").addEventListener("click", () => $("#orderModal").close());

  /* ---------- Init ---------- */
  loadProducts();
  loadCart();
  renderChips();
  renderGrid();
  renderCart();

  // Si el panel cambia precios o stock desde otra pestaña, la tienda se actualiza sola.
  store.subscribe(() => {
    loadProducts(); sanitizeCart(); saveCart();
    renderChips(); renderGrid(); renderCart();
  });
})();
