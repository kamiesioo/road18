/*
 * Capa de datos compartida entre la tienda y el panel de administración.
 * En esta maqueta persiste en localStorage del navegador; cuando exista un backend,
 * alcanza con reemplazar las funciones de este archivo (getProducts, saveProducts,
 * getOrders, placeOrder, setOrderStatus) por llamadas a la API.
 */
(() => {
  "use strict";

  const PK = "road18.products.v1";
  const OK = "road18.orders.v1";
  const LOW_STOCK = 4;
  const STATUSES = ["nuevo", "confirmado", "enviado", "entregado", "cancelado"];

  const SEED = [
    { id: "camp-woodland", name: "Campera Camo Woodland", cat: "Camperas", price: 25000, active: true,
      img: "assets/img/campera-woodland.jpg", desc: "Capucha con forro de corderito y logo bordado.",
      sizes: { S: 2, M: 4, L: 3, XL: 0 } },
    { id: "camp-digital", name: "Campera Camo Digital", cat: "Camperas", price: 25000, active: true,
      img: "assets/img/campera-digital.jpg", desc: "Camuflaje digital verde con forro acolchado.",
      sizes: { S: 0, M: 3, L: 5, XL: 2 } },
    { id: "camp-urbana", name: "Campera Camo Gris Urbano", cat: "Camperas", price: 25000, active: true,
      img: "assets/img/campera-urbana.jpg", desc: "Camuflaje gris y azul, puños elásticos.",
      sizes: { S: 1, M: 2, L: 0, XL: 0 } },
    { id: "baggy", name: "Baggy Regulable", cat: "Pantalones", price: 20000, active: true,
      img: "assets/img/baggy.jpg", desc: "Cintura elástica y cordón regulable en el ruedo. Franjas blancas.",
      sizes: { "Único": 7 } },
    { id: "camisa-camo", name: "Camisa Camo Digital", cat: "Camisas", price: 15000, active: true,
      img: "assets/img/camisa.jpg", desc: "Manga corta, bolsillos y bordado al frente.",
      sizes: { M: 2, L: 3, XL: 0 } },
  ];

  const mem = {};            // respaldo si localStorage no está disponible
  const clone = v => JSON.parse(JSON.stringify(v));

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch { /* sigue al respaldo */ }
    return key in mem ? clone(mem[key]) : null;
  }
  function write(key, value) {
    mem[key] = clone(value);
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }   // cuota llena o storage bloqueado
  }

  /* ---------- Productos ---------- */
  function getProducts() {
    let list = read(PK);
    if (!Array.isArray(list)) { list = clone(SEED); write(PK, list); }
    return list;
  }
  function saveProducts(list) { return write(PK, list); }
  const totalStock = p => Object.values(p.sizes || {}).reduce((a, b) => a + b, 0);

  /* ---------- Pedidos ---------- */
  function getOrders() {
    const list = read(OK);
    return Array.isArray(list) ? list : [];
  }
  function saveOrders(list) { return write(OK, list); }

  function newOrderId(existing) {
    let id;
    do { id = "R18-" + Math.random().toString(36).slice(2, 6).toUpperCase(); }
    while (existing.some(o => o.id === id));
    return id;
  }

  /**
   * Registra un pedido y descuenta el stock. items: [{ id, size, qty }].
   * Devuelve { ok:true, order } o { ok:false, error }.
   */
  function placeOrder({ customer, entrega, address, pago, items }) {
    const products = getProducts();
    const orders = getOrders();
    const lines = [];
    for (const it of items) {
      const p = products.find(x => x.id === it.id);
      if (!p || p.active === false) return { ok: false, error: `“${p ? p.name : it.id}” ya no está disponible.` };
      if ((p.sizes[it.size] || 0) < it.qty) return { ok: false, error: `No hay stock suficiente de ${p.name} (${it.size}).` };
      lines.push({ id: p.id, name: p.name, size: it.size, qty: it.qty, price: p.price, img: p.img });
    }
    lines.forEach(l => { products.find(p => p.id === l.id).sizes[l.size] -= l.qty; });
    const order = {
      id: newOrderId(orders),
      date: new Date().toISOString(),
      customer, entrega, address: address || null, pago,
      items: lines,
      total: lines.reduce((a, l) => a + l.qty * l.price, 0),
      status: "nuevo",
    };
    orders.unshift(order);
    if (!saveProducts(products) || !saveOrders(orders)) return { ok: false, error: "No se pudo guardar el pedido." };
    return { ok: true, order };
  }

  /** Cambia el estado. Al cancelar, el stock vuelve al catálogo. */
  function setOrderStatus(id, status) {
    if (!STATUSES.includes(status)) return false;
    const orders = getOrders();
    const o = orders.find(x => x.id === id);
    if (!o || o.status === status || o.status === "cancelado") return false;
    if (status === "cancelado" && !o.demo) {
      const products = getProducts();
      o.items.forEach(l => {
        const p = products.find(x => x.id === l.id);
        if (p) p.sizes[l.size] = (p.sizes[l.size] || 0) + l.qty;
      });
      saveProducts(products);
    }
    o.status = status;
    return saveOrders(orders);
  }

  /* ---------- Datos de demostración ---------- */
  function seedDemoOrders() {
    const products = getProducts();
    if (!products.length) return 0;
    const people = [
      ["Martina Gómez", "353 4561234"], ["Lucas Ferreyra", "351 6789012"], ["Camila Rojas", "341 5551122"],
      ["Tomás Acosta", "353 4987766"], ["Julieta Paz", "11 4455-6677"], ["Nicolás Sosa", "351 2233445"],
      ["Agustina Vera", "261 5123344"], ["Facundo Luna", "353 4778899"], ["Sofía Medina", "299 4332211"],
    ];
    const statuses = ["nuevo", "nuevo", "confirmado", "enviado", "entregado", "entregado", "entregado", "cancelado", "entregado"];
    const plan = [0, 0, 1, 1, 2, 3, 4, 5, 7];                 // días hacia atrás
    const orders = getOrders();
    people.forEach(([name, tel], i) => {
      const n = 1 + (i % 3);
      const items = [];
      for (let k = 0; k < n; k++) {
        const p = products[(i + k) % products.length];
        const size = Object.keys(p.sizes)[0];
        if (size === undefined) continue;
        items.push({ id: p.id, name: p.name, size, qty: 1 + ((i + k) % 2), price: p.price, img: p.img });
      }
      if (!items.length) return;
      const envio = i % 3 === 1 || statuses[i] === "enviado";
      const d = new Date(); d.setDate(d.getDate() - plan[i]); d.setHours(10 + (i * 3) % 10, (i * 17) % 60, 0, 0);
      orders.push({
        id: newOrderId(orders), date: d.toISOString(), demo: true,
        customer: { nombre: name, tel },
        entrega: envio ? "envio" : "retiro",
        address: envio ? { dir: "Av. Corrientes 1234", loc: "Rosario", cp: "2000", prov: "Santa Fe" } : null,
        pago: envio || i % 2 ? "transferencia" : "efectivo",
        items, total: items.reduce((a, l) => a + l.qty * l.price, 0), status: statuses[i],
      });
    });
    orders.sort((a, b) => b.date.localeCompare(a.date));
    saveOrders(orders);
    return people.length;
  }
  function clearDemoOrders() { saveOrders(getOrders().filter(o => !o.demo)); }
  function resetCatalog() { return write(PK, clone(SEED)); }
  function exportAll() { return JSON.stringify({ products: getProducts(), orders: getOrders() }, null, 2); }

  /* ---------- Utilidades ---------- */
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = n => "$" + Math.round(n).toLocaleString("es-AR");
  const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#2a2625"/>' +
    '<text x="200" y="260" fill="#8a837b" font-family="sans-serif" font-size="22" text-anchor="middle">Sin foto</text></svg>');
  const imgSrc = (img, base = "") => !img ? PLACEHOLDER : /^(data:|https?:|\/)/.test(img) ? img : base + img;

  /** Avisa cuando otra pestaña modifica productos o pedidos. */
  function subscribe(cb) {
    window.addEventListener("storage", e => {
      if (e.key === null || e.key === PK || e.key === OK) cb(e.key === OK ? "orders" : e.key === PK ? "products" : "all");
    });
  }

  window.R18Store = {
    LOW_STOCK, STATUSES,
    getProducts, saveProducts, totalStock,
    getOrders, placeOrder, setOrderStatus,
    seedDemoOrders, clearDemoOrders, resetCatalog, exportAll,
    esc, money, imgSrc, PLACEHOLDER, subscribe,
  };
})();
