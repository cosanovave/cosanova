// ══════════════════════════════════════════════════════
//  COSA NOVA MARKETPLACE — app.js
//  Conecta con Google Sheets para productos y tasas
// ══════════════════════════════════════════════════════

// ─── CONFIGURACIÓN ────────────────────────────────────
// URL del Business Suite (GAS) — reemplaza con tu URL real
const GAS_URL   = 'https://script.google.com/macros/s/AKfycby8oGOKP9nkwjZZ6-Ilaz7HNTCxMnhHsWlswbV43-Y_luE8mJpaAl5TPa0gVA-PSBxN/exec';

// Google Sheets para productos (Stock)
const SS_ID     = '1Laqj4byH_qPxkR7z7eog-bGkIhm_dt4FxTVE99ArM9Q';
const SHEET_STOCK = `https://docs.google.com/spreadsheets/d/${1Laqj4byH_qPxkR7z7eog-bGkIhm_dt4FxTVE99ArM9Q}/gviz/tq?tqx=out:csv&sheet=Stock`;

const WA_NUM    = '573001885210';
const MARGEN    = 30;   // % margen
const FEE       = 2;    // % fee de pago

// ─── ESTADO GLOBAL ────────────────────────────────────
let tasas          = { trm: 4200, bcv: 50, binance: 65 };
let productos      = [];
let categoriaActual = 'todas';
let carrito        = JSON.parse(localStorage.getItem('cn-carrito') || '[]');
let metodoSeleccionado = '';
let capturaB64     = '';

// ─── INICIALIZACIÓN ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticulas();
  initReveal();
  initNavbar();
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
      imagen:     f[6]  || ''   // columna G
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

  const filtrados = categoriaActual === 'todas'
    ? lista
    : lista.filter(p => p.categoria === categoriaActual);

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
  const usdStr = fmt(pvp_usd);
  const bsStr  = fmt(pvp_bs, 0);

  const imgHTML = p.imagen
    ? `<img src="assets/products/${p.imagen}" alt="${p.nom}" class="producto-img" onerror="this.parentElement.innerHTML='<div class=\\'producto-img-placeholder\\'>${iconoCategoria(p.categoria)}</div>'">`
    : `<div class="producto-img-placeholder">${iconoCategoria(p.categoria)}</div>`;

  const nomEsc = p.nom.replace(/'/g, "\\'");

  return `
    <div class="producto-card reveal">
      ${imgHTML}
      <div class="producto-body">
        <span class="producto-cat">${p.categoria}</span>
        <h3 class="producto-nom">${p.nom}</h3>
        ${p.descripcion ? `<p class="producto-desc">${p.descripcion}</p>` : '<p class="producto-desc"></p>'}
        <div class="producto-precios">
          <div class="precio-usd"><span>$ </span>${usdStr} <span>USD</span></div>
          <div class="precio-bs">Equivalente: <strong>Bs ${bsStr}</strong></div>
        </div>
        <button class="btn-carrito" onclick="agregarAlCarrito('${nomEsc}', ${pvp_usd.toFixed(2)}, '${p.categoria}')">
          🛒 Agregar al carrito
        </button>
      </div>
    </div>`;
}

function iconoCategoria(cat) {
  const iconos = { Perfumes: '🌸', Belleza: '💄', Ropa: '👗', General: '📦' };
  return iconos[cat] || '📦';
}

// ─── CARRITO ──────────────────────────────────────────
function guardarCarrito() {
  localStorage.setItem('cn-carrito', JSON.stringify(carrito));
}

function agregarAlCarrito(nom, pvp_usd, cat) {
  const idx = carrito.findIndex(x => x.nom === nom);
  if (idx >= 0) carrito[idx].qty++;
  else carrito.push({ nom, pvp_usd: parseFloat(pvp_usd), cat, qty: 1 });
  guardarCarrito();
  actualizarCarritoUI();
  mostrarToast('🛒 ' + nom + ' agregado');
}

function cambiarQty(nom, delta) {
  const idx = carrito.findIndex(x => x.nom === nom);
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
  lista.innerHTML = carrito.map(item => `
    <div class="cart-item">
      <div class="ci-info">
        <div class="ci-nom">${item.nom}</div>
        <div class="ci-precio">$${fmt(item.pvp_usd)} c/u</div>
      </div>
      <div class="ci-controles">
        <button class="ci-btn" onclick="cambiarQty('${item.nom.replace(/'/g,"\\'")}', -1)">−</button>
        <span class="ci-qty">${item.qty}</span>
        <button class="ci-btn" onclick="cambiarQty('${item.nom.replace(/'/g,"\\'")}', 1)">+</button>
      </div>
      <div class="ci-total">$${fmt(item.pvp_usd * item.qty)}</div>
    </div>`).join('');
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
  const ciudad = document.getElementById('co-ciudad')?.value.trim();
  const dir    = document.getElementById('co-dir')?.value.trim();

  if (!nom || !email || !tel || !ciudad || !dir)
    return mostrarToast('Completa todos los datos del cliente');
  if (!capturaB64)
    return mostrarToast('Sube la captura del comprobante');

  const total   = carrito.reduce((a, x) => a + x.pvp_usd * x.qty, 0);
  const totalBs = total * tasas.bcv;
  const prods   = carrito.map(x => `${x.nom} x${x.qty}`).join(', ');

  const btn = document.getElementById('btn-enviar');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  const payload = {
    nombre: nom, email, telefono: tel, ciudad, direccion: dir,
    productos: prods, total_usd: fmt(total), total_bs: fmt(totalBs, 0),
    metodo_pago: metodoSeleccionado === 'usdt' ? 'USDT (Binance Pay)' : 'Pago Móvil BDV',
    captura: capturaB64,
    tasa_bcv: tasas.bcv, tasa_binance: tasas.binance
  };

  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('ok-num').textContent = 'Orden #CN-' + String(data.num).padStart(4,'0');
      carrito = [];
      guardarCarrito();
      actualizarCarritoUI();
      irPaso(4);
    } else {
      mostrarToast('Error al enviar. Intenta nuevamente.');
    }
  } catch(e) {
    mostrarToast('Error de conexión. Intenta nuevamente.');
    console.error(e);
  }
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
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('activa'));
  event.target.classList.add('activa');
  renderProductos(productos);

  // Scroll suave al catálogo
  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// ─── NAVBAR SCROLL ────────────────────────────────────
function initNavbar() {
  const nav  = document.getElementById('navbar');
  const logo = nav?.querySelector('.nav-logo');
  window.addEventListener('scroll', () => {
    if (!nav) return;
    if (window.scrollY > 80) {
      nav.style.background     = 'rgba(6,13,24,0.97)';
      nav.style.backdropFilter = 'blur(14px)';
      nav.style.borderBottom   = '1px solid rgba(240,165,0,0.2)';
      if (logo) logo.style.height = '56px';
    } else {
      nav.style.background     = 'transparent';
      nav.style.backdropFilter = 'none';
      nav.style.borderBottom   = 'none';
      if (logo) logo.style.height = '80px';
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
