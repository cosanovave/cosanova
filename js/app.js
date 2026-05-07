// ══════════════════════════════════════════════════════
//  COSA NOVA MARKETPLACE — app.js
//  Conecta con Google Sheets para productos y tasas
// ══════════════════════════════════════════════════════

// ─── CONFIGURACIÓN ────────────────────────────────────
// URL del Business Suite (GAS) — reemplaza con tu URL real
const GAS_URL   = 'https://script.google.com/macros/s/AKfycby8oGOKP9nkwjZZ6-Ilaz7HNTCxMnhHsWlswbV43-Y_luE8mJpaAl5TPa0gVA-PSBxN/exec';

// Google Sheets para productos (Stock)
const SS_ID     = '1Laqj4byH_qPxkR7z7eog-bGklhm_dt4FxTVE99ArM9Q';
const SHEET_STOCK = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTaUKy-WqNwIuPFN6oDkcOQGOA7maXTXhbkCKVUZhrkXzKYifPTI0ULL3urY7bt5lT598SNMeF0xpwu/pub?gid=0&single=true&output=csv';

const WA_NUM    = '573001885210';
const MARGEN    = 30;   // % margen
const FEE       = 2;    // % fee de pago

// ─── ESTADO GLOBAL ────────────────────────────────────
let tasas          = { trm: 4200, bcv: 50, binance: 65 };
let productos      = [];
let categoriaActual = 'todas';
let generoActual    = '';
let subtipoActual   = '';
let carrito        = JSON.parse(localStorage.getItem('cn-carrito') || '[]');
let metodoSeleccionado = '';
let capturaB64     = '';

// ─── INICIALIZACIÓN ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticulas();
  initReveal();
  initNavbar();
  initStars();
  actualizarCarritoUI();
  cargarDatos();
});

// ─── CARGA DE DATOS ───────────────────────────────────
async function cargarDatos() {
  try {
    // Tasas: desde el Business Suite (GAS endpoint — sin CORS)
    const resTasas = await fetch(GAS_URL + '?action=tasas').catch(() => null);
    if (resTasas && resTasas.ok) {
      const json = await resTasas.json();
      if (json.trm)     tasas.trm     = json.trm;
      if (json.bcv)     tasas.bcv     = json.bcv;
      if (json.binance) tasas.binance = json.binance;
    }
  } catch(e) {
    console.warn('No se pudieron cargar las tasas:', e);
  }

  try {
    // Productos: desde Google Sheets CSV
    const resStock = await fetch(SHEET_STOCK).catch(() => null);
    if (resStock && resStock.ok) {
      const csv = await resStock.text();
      productos = parsearStock(csv);
    }
  } catch(e) {
    console.warn('No se pudieron cargar los productos:', e);
  }

  mostrarTasasBar();
  renderProductos(productos);
  renderHeroPreview(productos);
}

// ─── PARSEAR CSV DE TASAS ─────────────────────────────
function parsearTasas(csv) {
  const filas = parseCSV(csv);
  filas.forEach(f => {
    const clave = (f[0] || '').toLowerCase().trim();
    const val   = parseFloat(f[1]);
    if (!isNaN(val)) {
      if (clave.includes('trm'))     tasas.trm     = val;
      if (clave.includes('bcv'))     tasas.bcv     = val;
      if (clave.includes('binance')) tasas.binance = val;
    }
  });
}

// ─── PARSEAR CSV DE STOCK ─────────────────────────────
// Columnas: A=nom, B=inv_cop, C=categoria, D=peso_gr, E=descripcion, F=fecha, G=imagen
function parsearStock(csv) {
  const filas = parseCSV(csv);
  filas.shift(); // quitar encabezados
  return filas
    .filter(f => f[0] && f[0].trim() !== '')
    .map(f => ({
      nom:        f[0]  || '',
      inv_cop:    parseFloat(f[1]) || 0,
      categoria:  f[2]  || 'General',
      peso_gr:    parseFloat(f[3]) || 0,
      descripcion: f[4] || '',
      imagen:     f[6]  || '',   // columna G
      genero:     (f[7]  || '').trim(),  // columna H
      subtipo:    (f[8]  || '').trim(),  // columna I
      tallas:     (f[9]  || '').trim()   // columna J  ej: S|M|L|XL  o  S:80000|M:85000
    }));
}

// ─── PARSER CSV GENÉRICO ──────────────────────────────
function parseCSV(csv) {
  const filas = [];
  const lineas = csv.split('\n');
  for (const linea of lineas) {
    if (!linea.trim()) continue;
    const cols = [];
    let dentro = false, campo = '';
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') { dentro = !dentro; continue; }
      if (c === ',' && !dentro) { cols.push(campo.trim()); campo = ''; continue; }
      campo += c;
    }
    cols.push(campo.trim());
    filas.push(cols);
  }
  return filas;
}

// ─── CÁLCULO DE PRECIOS ───────────────────────────────
function calcPrecio(inv_cop) {
  const inv_usd = inv_cop / tasas.trm;
  const pvp_usd = inv_usd * (1 + MARGEN / 100) * (tasas.binance / tasas.bcv) * (1 + FEE / 100);
  const pvp_bs  = pvp_usd * tasas.bcv;
  return {
    pvp_usd: pvp_usd,
    pvp_bs:  pvp_bs
  };
}

// ─── FORMATEO ─────────────────────────────────────────
function fmt(n, dec = 2) {
  return parseFloat(n).toLocaleString('es-VE', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  });
}

// ─── HERO PREVIEW ─────────────────────────────────────
function renderHeroPreview(lista) {
  const cont = document.getElementById('hero-preview');
  if (!cont || !lista || lista.length === 0) return;
  const top3 = lista.slice(0, 3);
  cont.innerHTML = top3.map(p => {
    const pvp = calcPrecio(p.inv_cop);
    const imgHTML = p.imagen
      ? `<img src="assets/products/${p.imagen}" class="hero-prev-img" onerror="this.outerHTML='<div class=\\'hero-prev-img-placeholder\\'>${iconoCategoria(p.categoria)}</div>'">`
      : `<div class="hero-prev-img-placeholder">${iconoCategoria(p.categoria)}</div>`;
    return `<div class="hero-prev-card" onclick="document.getElementById('catalogo').scrollIntoView({behavior:'smooth'})">
      ${imgHTML}
      <div class="hero-prev-info">
        <div class="hero-prev-nom">${p.nom}</div>
        <div class="hero-prev-precio">$ ${fmt(pvp.pvp_usd)} USD</div>
      </div>
    </div>`;
  }).join('');
}

// ─── BARRA DE TASAS ───────────────────────────────────
function mostrarTasasBar() {
  const elBin = document.getElementById('tasa-binance');
  const elBcv = document.getElementById('tasa-bcv');
  if (elBin) elBin.textContent = `Bs ${fmt(tasas.binance)} / USDT`;
  if (elBcv) elBcv.textContent = `Bs ${fmt(tasas.bcv)}`;
}

// ─── RENDER PRODUCTOS ─────────────────────────────────
function renderProductos(lista) {
  const grid   = document.getElementById('productos-grid');
  const sinProd = document.getElementById('sin-productos');
  if (!grid) return;

  let filtrados = categoriaActual === 'todas'
    ? lista
    : lista.filter(p => p.categoria === categoriaActual);

  if (generoActual)  filtrados = filtrados.filter(p => p.genero  === generoActual);
  if (subtipoActual) filtrados = filtrados.filter(p => p.subtipo === subtipoActual);

  if (filtrados.length === 0) {
    grid.innerHTML = '';
    if (sinProd) sinProd.style.display = 'block';
    return;
  }
  if (sinProd) sinProd.style.display = 'none';

  grid.innerHTML = filtrados.map(p => cardHTML(p)).join('');

  // Re-activar reveal en nuevas cards
  grid.querySelectorAll('.producto-card').forEach((el, i) => {
    el.style.transitionDelay = `${i * 0.07}s`;
    observerReveal.observe(el);
  });
}

// ─── HTML DE PRODUCTO CARD ────────────────────────────
function cardHTML(p) {
  const { pvp_usd, pvp_bs } = calcPrecio(p.inv_cop);
  const tallas = parsearTallas(p.tallas, p.inv_cop);
  const nomEsc = p.nom.replace(/'/g, "\\'");

  const imgHTML = p.imagen
    ? `<img src="assets/products/${p.imagen}" alt="${p.nom}" class="producto-img" onerror="this.parentElement.innerHTML='<div class=\\'producto-img-placeholder\\'>${iconoCategoria(p.categoria)}</div>'">`
    : `<div class="producto-img-placeholder">${iconoCategoria(p.categoria)}</div>`;

  const tallasHTML = tallas.length > 0 ? `
    <div class="tallas-selector">
      <span class="tallas-label">Talla:</span>
      <div class="tallas-btns">
        ${tallas.map(t => `<button class="talla-btn" onclick="seleccionarTalla(this,'${nomEsc}','${t.talla}',${t.inv_cop})">${t.talla}</button>`).join('')}
      </div>
    </div>` : '';

  const btnHTML = tallas.length > 0
    ? `<button class="btn-carrito btn-talla-pendiente" disabled>Elige una talla</button>`
    : `<button class="btn-carrito" onclick="agregarAlCarrito('${nomEsc}',${pvp_usd.toFixed(2)},'${p.categoria}','')">🛒 Agregar al carrito</button>`;

  return `
    <div class="producto-card reveal">
      <div class="producto-img-wrap" onclick="abrirProducto('${nomEsc}')">
        ${imgHTML}
        <div class="producto-img-overlay"><span>🔍 Ver detalles</span></div>
      </div>
      <div class="producto-body">
        <span class="producto-cat">${p.categoria}</span>
        <h3 class="producto-nom producto-nom-link" onclick="abrirProducto('${nomEsc}')">${p.nom}</h3>
        <div class="producto-precios">
          <div class="precio-usd"><span>$ </span>${fmt(pvp_usd)} <span>USD</span></div>
          <div class="precio-bs">BCV: <strong>Bs ${fmt(pvp_bs, 0)}</strong></div>
        </div>
        ${tallasHTML}
        ${btnHTML}
      </div>
    </div>`;
}

// ─── MODAL DETALLE DE PRODUCTO ────────────────────────
function abrirProducto(nom) {
  const p = productos.find(x => x.nom === nom);
  if (!p) return;

  const { pvp_usd, pvp_bs } = calcPrecio(p.inv_cop);

  document.getElementById('mp-cat').textContent  = p.categoria;
  document.getElementById('mp-nom').textContent  = p.nom;
  document.getElementById('mp-desc').textContent = p.descripcion || 'Sin descripción disponible.';
  document.getElementById('mp-usd').textContent  = fmt(pvp_usd);
  document.getElementById('mp-bs').textContent   = 'Bs ' + fmt(pvp_bs, 0);

  const img  = document.getElementById('mp-img');
  const phld = document.getElementById('mp-img-placeholder');
  if (p.imagen) {
    img.src            = `assets/products/${p.imagen}`;
    img.alt            = p.nom;
    img.style.display  = 'block';
    phld.style.display = 'none';
  } else {
    img.style.display  = 'none';
    phld.textContent   = iconoCategoria(p.categoria);
    phld.style.display = 'flex';
  }

  const nomEsc       = p.nom.replace(/'/g, "\\'");
  const tallas       = parsearTallas(p.tallas, p.inv_cop);
  const mpBtn        = document.getElementById('mp-btn-carrito');
  const mpTallas     = document.getElementById('mp-tallas');
  const mpTallasBtns = document.getElementById('mp-tallas-btns');

  if (tallas.length > 0) {
    mpTallas.style.display = 'flex';
    mpTallasBtns.innerHTML = tallas.map(t =>
      `<button class="talla-btn" onclick="seleccionarTallaModal(this,'${nomEsc}','${t.talla}',${t.inv_cop})">${t.talla}</button>`
    ).join('');
    mpBtn.disabled  = true;
    mpBtn.innerHTML = 'Elige una talla';
    mpBtn.onclick   = null;
  } else {
    mpTallas.style.display = 'none';
    mpTallasBtns.innerHTML = '';
    mpBtn.disabled  = false;
    mpBtn.innerHTML = '🛒 Agregar al carrito';
    mpBtn.onclick   = () => { agregarAlCarrito(nomEsc, pvp_usd.toFixed(2), p.categoria, ''); cerrarProducto(); };
  }

  document.getElementById('modal-producto').classList.add('activo');
  document.body.style.overflow = 'hidden';
}

function cerrarProducto() {
  document.getElementById('modal-producto').classList.remove('activo');
  document.body.style.overflow = '';
}

// ─── SELECTOR DE TALLA (card) ─────────────────────────
function seleccionarTalla(btn, nom, talla, inv_cop) {
  const card = btn.closest('.producto-card');
  card.querySelectorAll('.talla-btn').forEach(b => b.classList.remove('activa'));
  btn.classList.add('activa');

  const { pvp_usd, pvp_bs } = calcPrecio(inv_cop);
  const precioUsdEl = card.querySelector('.precio-usd');
  const precioBsEl  = card.querySelector('.precio-bs');
  if (precioUsdEl) precioUsdEl.innerHTML = `<span>$ </span>${fmt(pvp_usd)} <span>USD</span>`;
  if (precioBsEl)  precioBsEl.innerHTML  = `BCV: <strong>Bs ${fmt(pvp_bs, 0)}</strong>`;

  const nomEsc = nom.replace(/'/g, "\\'");
  const btnCarr = card.querySelector('.btn-carrito');
  if (btnCarr) {
    btnCarr.disabled  = false;
    btnCarr.className = 'btn-carrito';
    btnCarr.innerHTML = '🛒 Agregar al carrito';
    btnCarr.onclick   = () => agregarAlCarrito(nomEsc, pvp_usd.toFixed(2), 'Ropa', talla);
  }
}

// ─── SELECTOR DE TALLA (modal) ────────────────────────
function seleccionarTallaModal(btn, nom, talla, inv_cop) {
  document.querySelectorAll('#mp-tallas-btns .talla-btn').forEach(b => b.classList.remove('activa'));
  btn.classList.add('activa');

  const { pvp_usd, pvp_bs } = calcPrecio(inv_cop);
  document.getElementById('mp-usd').textContent = fmt(pvp_usd);
  document.getElementById('mp-bs').textContent  = 'Bs ' + fmt(pvp_bs, 0);

  const nomEsc = nom.replace(/'/g, "\\'");
  const mpBtn  = document.getElementById('mp-btn-carrito');
  mpBtn.disabled  = false;
  mpBtn.innerHTML = '🛒 Agregar al carrito';
  mpBtn.onclick   = () => { agregarAlCarrito(nomEsc, pvp_usd.toFixed(2), 'Ropa', talla); cerrarProducto(); };
}

function iconoCategoria(cat) {
  const iconos = { Perfumes: '🌸', Belleza: '💄', Ropa: '👗', General: '📦' };
  return iconos[cat] || '📦';
}

// ─── PARSEAR TALLAS ───────────────────────────────────
// Formato columna J: "S|M|L|XL" (mismo precio) o "S:80000|M:85000|L:90000" (precio por talla en COP)
function parsearTallas(tallaStr, inv_cop_base) {
  if (!tallaStr || !tallaStr.trim()) return [];
  return tallaStr.split('|').map(t => {
    const parts = t.trim().split(':');
    return { talla: parts[0].trim(), inv_cop: parts[1] ? parseFloat(parts[1]) : inv_cop_base };
  }).filter(t => t.talla);
}

// ─── CARRITO ──────────────────────────────────────────
function guardarCarrito() {
  localStorage.setItem('cn-carrito', JSON.stringify(carrito));
}

function agregarAlCarrito(nom, pvp_usd, cat, talla) {
  talla = talla || '';
  const idx = carrito.findIndex(x => x.nom === nom && (x.talla || '') === talla);
  if (idx >= 0) carrito[idx].qty++;
  else carrito.push({ nom, pvp_usd: parseFloat(pvp_usd), cat, talla, qty: 1 });
  guardarCarrito();
  actualizarCarritoUI();
  mostrarToast('🛒 ' + nom + (talla ? ' (' + talla + ')' : '') + ' agregado');
}

function cambiarQty(nom, talla, delta) {
  talla = talla || '';
  const idx = carrito.findIndex(x => x.nom === nom && (x.talla || '') === talla);
  if (idx < 0) return;
  carrito[idx].qty += delta;
  if (carrito[idx].qty <= 0) carrito.splice(idx, 1);
  guardarCarrito();
  actualizarCarritoUI();
}

function actualizarCarritoUI() {
  const total  = carrito.reduce((a, x) => a + x.pvp_usd * x.qty, 0);
  const totalBs = total * tasas.binance;
  const count  = carrito.reduce((a, x) => a + x.qty, 0);

  // Badge
  const badge = document.getElementById('cart-badge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }

  // Totales
  const ctUsd = document.getElementById('ct-usd');
  const ctBs  = document.getElementById('ct-bs');
  if (ctUsd) ctUsd.textContent = '$' + fmt(total) + ' USD';
  if (ctBs)  ctBs.textContent  = 'Bs ' + fmt(totalBs, 0);

  // Lista items
  const lista = document.getElementById('cart-items');
  if (!lista) return;
  if (carrito.length === 0) {
    lista.innerHTML = '<div class="cart-vacio"><span>🛒</span><p>Tu carrito está vacío</p></div>';
    return;
  }
  lista.innerHTML = carrito.map(item => {
    const nomEsc   = item.nom.replace(/'/g, "\\'");
    const tallaEsc = (item.talla || '').replace(/'/g, "\\'");
    return `
    <div class="cart-item">
      <div class="ci-info">
        <div class="ci-nom">${item.nom}${item.talla ? ' <span class="ci-talla">('+item.talla+')</span>' : ''}</div>
        <div class="ci-precio">$${fmt(item.pvp_usd)} c/u</div>
      </div>
      <div class="ci-controles">
        <button class="ci-btn" onclick="cambiarQty('${nomEsc}','${tallaEsc}',-1)">−</button>
        <span class="ci-qty">${item.qty}</span>
        <button class="ci-btn" onclick="cambiarQty('${nomEsc}','${tallaEsc}',1)">+</button>
      </div>
      <div class="ci-total">$${fmt(item.pvp_usd * item.qty)}</div>
    </div>`;
  }).join('');
}

function toggleCart() {
  const drawer  = document.getElementById('cart-drawer');
  const overlay = document.getElementById('cart-overlay');
  if (!drawer) return;
  const abierto = drawer.classList.contains('abierto');
  drawer.classList.toggle('abierto', !abierto);
  overlay.classList.toggle('activo', !abierto);
}

// ─── CHECKOUT ─────────────────────────────────────────
function abrirCheckout() {
  if (carrito.length === 0) return mostrarToast('Tu carrito está vacío');
  toggleCart();
  const modal = document.getElementById('checkout-modal');
  modal.classList.add('abierto');
  modal.style.display = 'flex';
  irPaso(1);
  metodoSeleccionado = '';
  capturaB64 = '';
}

function cerrarCheckout() {
  const modal = document.getElementById('checkout-modal');
  modal.classList.remove('abierto');
  modal.style.display = 'none';
}

function irPaso(n) {
  [1,2,3,4].forEach(i => {
    const paso = document.getElementById('paso-' + i);
    const dot  = document.getElementById('cs' + i);
    const line = document.getElementById('cl' + i);
    if (paso) paso.classList.toggle('activo', i === n);
    if (dot)  {
      dot.classList.toggle('activo', i === n);
      dot.classList.toggle('listo',  i < n);
    }
    if (line) line.classList.toggle('listo', i < n);
  });
}

function seleccionarMetodo(metodo) {
  metodoSeleccionado = metodo;
  document.querySelectorAll('.metodo-card').forEach(c => c.classList.remove('seleccionado'));
  const id = metodo === 'usdt' ? 'mc-usdt' : 'mc-pm';
  const card = document.getElementById(id);
  if (card) card.classList.add('seleccionado');
  mostrarDatosPago(metodo);
  irPaso(3);
}

function mostrarDatosPago(metodo) {
  const total    = carrito.reduce((a, x) => a + x.pvp_usd * x.qty, 0);
  const totalBs  = total * tasas.bcv;
  const box      = document.getElementById('datos-pago-box');
  if (!box) return;

  if (metodo === 'usdt') {
    box.innerHTML = `
      <div class="datos-pago-card">
        <div class="dato-pago-row"><span>Red de pago</span><strong>Binance Pay</strong></div>
        <div class="dato-pago-row">
          <span>ID Binance</span>
          <strong>714385801</strong>
          <button class="copy-btn" onclick="copiar('714385801')">Copiar</button>
        </div>
        <div class="dato-pago-row monto">
          <span>Monto exacto</span>
          <strong>$${fmt(total)} USDT</strong>
        </div>
      </div>`;
  } else if (metodo === 'pagomovil') {
    box.innerHTML = `
      <div class="datos-pago-card">
        <div class="dato-pago-row"><span>Banco</span><strong>Banco de Venezuela (0102)</strong></div>
        <div class="dato-pago-row">
          <span>Cédula</span>
          <strong>22.290.126</strong>
          <button class="copy-btn" onclick="copiar('22290126')">Copiar</button>
        </div>
        <div class="dato-pago-row">
          <span>Teléfono</span>
          <strong>0424-323-0841</strong>
          <button class="copy-btn" onclick="copiar('04243230841')">Copiar</button>
        </div>
        <div class="dato-pago-row monto">
          <span>Monto (tasa BCV ${fmt(tasas.bcv, 2)})</span>
          <strong>Bs ${fmt(totalBs, 0)}</strong>
        </div>
      </div>`;
  }
}

function copiar(texto) {
  navigator.clipboard.writeText(texto).then(() => mostrarToast('Copiado: ' + texto));
}

function previewCaptura(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return mostrarToast('La imagen es muy grande (máx. 5MB)');
  const reader = new FileReader();
  reader.onload = e => {
    capturaB64 = e.target.result;
    document.getElementById('upload-preview').innerHTML =
      `<img src="${capturaB64}" class="upload-preview-img"><p style="color:#25D366;font-weight:600;margin-top:8px;">✓ Captura lista</p>`;
  };
  reader.readAsDataURL(file);
}

async function enviarPedido() {
  const nom    = document.getElementById('co-nom')?.value.trim();
  const email  = document.getElementById('co-email')?.value.trim();
  const tel    = document.getElementById('co-tel')?.value.trim();
  const cedula = document.getElementById('co-cedula')?.value.trim();
  const ciudad = document.getElementById('co-ciudad')?.value.trim();
  const dir    = document.getElementById('co-dir')?.value.trim();

  if (!nom || !email || !tel || !cedula || !ciudad || !dir)
    return mostrarToast('Completa todos los datos del cliente');
  if (!capturaB64)
    return mostrarToast('Sube la captura del comprobante');

  const total   = carrito.reduce((a, x) => a + x.pvp_usd * x.qty, 0);
  const totalBs = total * tasas.bcv;
  const prods   = carrito.map(x => `${x.nom}${x.talla ? ' ['+x.talla+']' : ''} x${x.qty}`).join(', ');

  const btn = document.getElementById('btn-enviar');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  const payload = {
    nombre: nom, email, telefono: tel, cedula, ciudad, direccion: dir,
    productos: prods, total_usd: fmt(total), total_bs: fmt(totalBs, 0),
    metodo_pago: metodoSeleccionado === 'usdt' ? 'USDT (Binance Pay)' : 'Pago Móvil BDV',
    captura: capturaB64,
    tasa_bcv: tasas.bcv, tasa_binance: tasas.binance
  };

  try {
    await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
  } catch(e) {
    console.warn('GAS fetch error:', e);
  }
  const orderNum = String(Date.now()).slice(-4);
  document.getElementById('ok-num').textContent = 'Orden #CN-' + orderNum;
  carrito = [];
  guardarCarrito();
  actualizarCarritoUI();
  irPaso(4);
  if (btn) { btn.disabled = false; btn.textContent = 'Enviar Pedido →'; }
}

// ─── TOAST ────────────────────────────────────────────
function mostrarToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 3000);
}

// ─── FILTRO DE CATEGORÍAS ─────────────────────────────
function filtrar(cat) {
  categoriaActual = cat;
  generoActual    = '';
  subtipoActual   = '';

  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('activa'));
  event.target.classList.add('activa');
  document.querySelectorAll('.subcat-btn').forEach(b => b.classList.remove('activa'));

  const rowGenero = document.getElementById('subcat-genero');
  const rowTipo   = document.getElementById('subcat-tipo');

  if (cat === 'Ropa' || cat === 'Perfumes') {
    rowGenero.classList.add('visible');
  } else {
    rowGenero.classList.remove('visible');
    rowTipo.classList.remove('visible');
  }

  renderProductos(productos);
  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function filtrarGenero(genero, btn) {
  generoActual  = genero;
  subtipoActual = '';

  document.querySelectorAll('#subcat-genero .subcat-btn').forEach(b => b.classList.remove('activa'));
  btn.classList.add('activa');
  document.querySelectorAll('#subcat-tipo .subcat-btn').forEach(b => b.classList.remove('activa'));

  if (categoriaActual === 'Ropa') {
    document.getElementById('subcat-tipo').classList.add('visible');
  } else {
    document.getElementById('subcat-tipo').classList.remove('visible');
  }

  renderProductos(productos);
}

function filtrarTipo(tipo, btn) {
  subtipoActual = tipo;

  document.querySelectorAll('#subcat-tipo .subcat-btn').forEach(b => b.classList.remove('activa'));
  btn.classList.add('activa');

  renderProductos(productos);
}

// ─── CANVAS PARTÍCULAS ────────────────────────────────
function initParticulas() {
  const canvas = document.getElementById('canvas-particulas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const COLORES = ['rgba(240,165,0,', 'rgba(37,211,102,', 'rgba(0,188,212,', 'rgba(233,30,99,'];
  const N = 70;

  const pts = Array.from({ length: N }, () => ({
    x:  Math.random() * canvas.width,
    y:  Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    r:  Math.random() * 2 + 1,
    c:  COLORES[Math.floor(Math.random() * COLORES.length)]
  }));

  const DIST = 140;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mover partículas
    pts.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      // Dibujar punto
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c + '0.7)';
      ctx.fill();
    });

    // Dibujar líneas entre partículas cercanas
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < DIST) {
          const alpha = (1 - d / DIST) * 0.18;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(240,165,0,${alpha})`;
          ctx.lineWidth   = 0.8;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ─── RESEÑAS ──────────────────────────────────────────
let estrellasResena = 0;

function initStars() {
  const stars = document.querySelectorAll('.star-selector .star');
  stars.forEach(star => {
    star.addEventListener('mouseenter', () => {
      const val = +star.dataset.val;
      stars.forEach(s => s.classList.toggle('hover', +s.dataset.val <= val));
    });
    star.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.remove('hover'));
    });
    star.addEventListener('click', () => {
      estrellasResena = +star.dataset.val;
      stars.forEach(s => s.classList.toggle('activa', +s.dataset.val <= estrellasResena));
    });
  });
}

async function enviarResena() {
  const nom    = document.getElementById('rs-nom').value.trim();
  const ciudad = document.getElementById('rs-ciudad').value.trim();
  const texto  = document.getElementById('rs-texto').value.trim();

  if (!nom)            return mostrarToast('⚠️ Escribe tu nombre');
  if (!estrellasResena) return mostrarToast('⚠️ Selecciona una calificación');
  if (!texto)          return mostrarToast('⚠️ Escribe tu experiencia');

  const btn = document.getElementById('btn-resena');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resena', nom, ciudad, estrellas: estrellasResena, texto })
    });
  } catch(e) { /* continuar aunque falle el fetch */ }

  btn.style.display = 'none';
  document.getElementById('resena-ok').style.display = 'flex';
}

// ─── NAVBAR SCROLL ────────────────────────────────────
function initNavbar() {
  const nav  = document.getElementById('navbar');
  const logo = nav?.querySelector('.nav-logo');
  window.addEventListener('scroll', () => {
    if (!nav) return;
    if (window.scrollY > 80) {
      nav.style.background     = 'rgba(250,244,232,0.97)';
      nav.style.backdropFilter = 'blur(14px)';
      nav.style.borderBottom   = '1px solid rgba(240,165,0,0.3)';
      logo?.classList.add('scrolled');
    } else {
      nav.style.background     = 'transparent';
      nav.style.backdropFilter = 'none';
      nav.style.borderBottom   = 'none';
      logo?.classList.remove('scrolled');
    }
  });
}

// ─── ANIMACIONES DE SCROLL ────────────────────────────
let observerReveal;

function initReveal() {
  observerReveal = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observerReveal.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach(el => observerReveal.observe(el));
}
