// ══════════════════════════════════════════════════════
//  COSA NOVA — Admin Panel JS
// ══════════════════════════════════════════════════════

import { db, auth } from './firebase-config.js';

import {
  collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, getDocs, where
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import {
  onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const GAS_URL = 'https://script.google.com/macros/s/AKfycby8oGOKP9nkwjZZ6-Ilaz7HNTCxMnhHsWlswbV43-Y_luE8mJpaAl5TPa0gVA-PSBxN/exec';

// ─── CONSTANTES DE PRECIO (igual que app.js) ─────────
const MARGEN = 30;   // % ganancia
const FEE    = 2;    // % recargo Colombia (plataforma/envío)
const FEE_VE = 0.3;  // % comisión banco al convertir Bs recibidos → USDT

// ─── ESTADO ───────────────────────────────────────────
let todosProductos = [];
let todasOrdenes   = [];
let adminUser      = null;
let imagenesState  = []; // [{ tipo: 'url'|'file', src: string }]
let tallasState    = []; // [{ talla: string, precio: string }]
let coloresState   = []; // [{ color: string, hex: string }]
let tasas          = { trm: 4200, bcv: 50, binance: 65 };

// ─── INIT ─────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) return redirigirLogin();

  const perfSnap = await getDoc(doc(db, 'usuarios', user.uid));
  if (!perfSnap.exists() || !perfSnap.data().esAdmin) return redirigirLogin();

  adminUser = user;
  document.getElementById('admin-loading').style.display = 'none';
  document.getElementById('admin-app').style.display     = 'flex';

  iniciarListeners();
  cambiarPanel('productos');
});

function redirigirLogin() {
  document.getElementById('admin-loading').innerHTML =
    '<p style="color:#d32f2f">Acceso denegado. <a href="index.html">Volver a la tienda</a></p>';
}

// ─── LISTENERS TIEMPO REAL ────────────────────────────
function iniciarListeners() {
  // Productos
  onSnapshot(query(collection(db, 'productos'), orderBy('nom')), snap => {
    todosProductos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTablaProductos(todosProductos);
  });

  // Órdenes
  onSnapshot(query(collection(db, 'ordenes'), orderBy('createdAt', 'desc')), snap => {
    todasOrdenes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTablaOrdenes(todasOrdenes);
  });

  // Reseñas
  onSnapshot(query(collection(db, 'resenas'), orderBy('createdAt', 'desc')), snap => {
    renderTablaResenas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });

  // Tasas actuales
  onSnapshot(doc(db, 'configuracion', 'tasas'), snap => {
    if (snap.exists()) {
      const d = snap.data();
      if (d.trm)     tasas.trm     = d.trm;
      if (d.bcv)     tasas.bcv     = d.bcv;
      if (d.binance) tasas.binance = d.binance;
      document.getElementById('tasa-trm').value         = d.trm     || '';
      document.getElementById('tasa-bcv-input').value   = d.bcv     || '';
      document.getElementById('tasa-binance-input').value = d.binance || '';
      renderTablaProductos(todosProductos);
    }
  });
}

// ─── NAVEGACIÓN ───────────────────────────────────────
function cambiarPanel(panel) {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('activo'));
  document.querySelectorAll('.snav-btn').forEach(b => b.classList.remove('activo'));
  document.getElementById('panel-' + panel)?.classList.add('activo');
  document.querySelector(`.snav-btn[data-panel="${panel}"]`)?.classList.add('activo');
}

// ─── FINANZAS POR PRODUCTO ────────────────────────────
function fmt(n, dec = 2) {
  return parseFloat(n || 0).toLocaleString('es-VE', {
    minimumFractionDigits: dec, maximumFractionDigits: dec
  });
}

function calcFinanzas(p) {
  const fee = p.origen === 'venezuela' ? 0 : FEE;
  const costo_base_usd = p.origen === 'venezuela'
    ? (p.precio_bs || 0) / tasas.binance
    : (p.inv_cop   || 0) / tasas.trm;

  // Costo efectivo: incluye el recargo de plataforma/envío (Colombia).
  // Es el "punto de equilibrio" que hay que recuperar antes de la ganancia.
  const costo_usd    = costo_base_usd * (1 + fee / 100);
  const pvp_usd      = costo_usd / (1 - MARGEN / 100);
  // pvp_bs siempre a tasa Binance (no BCV) y descontando la comisión bancaria
  // de convertir Bs→USDT, para no perder valor ante la devaluación del BCV.
  const pvp_bs       = pvp_usd * tasas.binance / (1 - FEE_VE / 100);
  const utilidad_usd = pvp_usd - costo_usd;
  const margen_pct   = MARGEN;

  return { costo_usd, pvp_usd, pvp_bs, utilidad_usd, margen_pct };
}

// ─── TABLA PRODUCTOS ──────────────────────────────────
function renderTablaProductos(lista) {
  const tbody = document.getElementById('tbody-productos');
  if (!tbody) return;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Sin productos</td></tr>'; return; }
  tbody.innerHTML = lista.map(p => {
    const imgPrincipal = (p.imagenes && p.imagenes.length) ? p.imagenes[0] : (p.imagen || '');
    const imgSrc = imgPrincipal
      ? (imgPrincipal.startsWith('http') ? imgPrincipal : `assets/products/${imgPrincipal}`)
      : '';
    const costoFmt = p.origen === 'venezuela'
      ? `Bs ${new Intl.NumberFormat('es-VE').format(p.precio_bs || 0)}`
      : `$ ${new Intl.NumberFormat('es-CO').format(p.inv_cop || 0)} COP`;

    const { costo_usd, pvp_usd, pvp_bs, utilidad_usd, margen_pct } = calcFinanzas(p);
    const utilidadClass = utilidad_usd >= 0 ? 'utilidad-pos' : 'utilidad-neg';

    return `<tr>
      <td>${imgSrc ? `<img src="${imgSrc}" class="tabla-thumb" onerror="this.style.display='none'">` : '<span class="no-img">—</span>'}</td>
      <td class="td-nom">${p.nom}</td>
      <td><span class="badge-cat badge-${(p.categoria||'').toLowerCase()}">${p.categoria}</span></td>
      <td class="td-precio">
        <strong>${costoFmt}</strong>
        <span class="precio-sub">Equilibrio: $${fmt(costo_usd)}</span>
      </td>
      <td class="td-precio">
        <strong>$ ${fmt(pvp_usd)} USD</strong>
        <span class="precio-sub">Bs ${fmt(pvp_bs, 0)}</span>
      </td>
      <td class="td-precio ${utilidadClass}">
        <strong>${utilidad_usd >= 0 ? '+' : ''}$${fmt(utilidad_usd)}</strong>
        <span class="precio-sub">${margen_pct >= 0 ? '+' : ''}${fmt(margen_pct, 1)}%</span>
      </td>
      <td><span class="badge-estado ${p.activo ? 'badge-activo' : 'badge-inactivo'}">${p.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td class="td-acciones">
        <button class="btn-edit" onclick="abrirFormProducto('${p.id}')">✏️</button>
        <button class="btn-toggle" onclick="toggleProductoActivo('${p.id}', ${!p.activo})" title="${p.activo ? 'Desactivar' : 'Activar'}">${p.activo ? '🙈' : '👁️'}</button>
        <button class="btn-del"  onclick="confirmarEliminarProducto('${p.id}', '${(p.nom||'').replace(/'/g,"\\'")}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function filtrarTablaProductos(busq) {
  const cat = document.getElementById('prod-cat')?.value || '';
  let lista  = todosProductos;
  if (busq)  lista = lista.filter(p => p.nom.toLowerCase().includes(busq.toLowerCase()));
  if (cat)   lista = lista.filter(p => p.categoria === cat);
  renderTablaProductos(lista);
}

// ─── FORM PRODUCTO ────────────────────────────────────
function toggleOrigenAdmin(origen) {
  const campoCOP = document.getElementById('campo-inv-cop');
  const campoBs  = document.getElementById('campo-precio-bs');
  const inputCOP = document.getElementById('prod-inv');
  const inputBs  = document.getElementById('prod-precio-bs');
  if (origen === 'venezuela') {
    campoCOP.style.display = 'none';
    campoBs.style.display  = '';
    inputCOP.required = false;
    inputBs.required  = true;
  } else {
    campoCOP.style.display = '';
    campoBs.style.display  = 'none';
    inputCOP.required = true;
    inputBs.required  = false;
  }
  renderTallasAdmin();
}

function renderImagenesAdmin() {
  const grid = document.getElementById('multi-img-grid');
  if (!grid) return;
  if (!imagenesState.length) {
    grid.innerHTML = '<span class="multi-img-empty">Sin imágenes</span>';
    return;
  }
  grid.innerHTML = imagenesState.map((img, i) => {
    const src = img.tipo === 'url'
      ? (img.src.startsWith('http') ? img.src : `assets/products/${img.src}`)
      : img.src;
    return `<div class="multi-img-item">
      <img src="${src}" onerror="this.parentElement.style.background='#f0f0f0'">
      <button type="button" class="multi-img-del" onclick="eliminarImagenAdmin(${i})">×</button>
      ${i === 0 ? '<span class="multi-img-principal">Principal</span>' : ''}
    </div>`;
  }).join('');
}

function agregarImagenesAdmin(input) {
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      imagenesState.push({ tipo: 'file', src: e.target.result });
      renderImagenesAdmin();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function eliminarImagenAdmin(idx) {
  imagenesState.splice(idx, 1);
  renderImagenesAdmin();
}

// ─── TALLAS (precio por talla) ────────────────────────
function parseTallasString(str) {
  if (!str?.trim()) return [];
  return str.split('|').map(t => {
    const partes = t.trim().split(':');
    return { talla: (partes[0] || '').trim(), precio: partes[1] !== undefined ? partes[1].trim() : '' };
  }).filter(t => t.talla);
}

function serializeTallas(arr) {
  return arr
    .filter(t => (t.talla || '').trim())
    .map(t => {
      const nom    = t.talla.trim().replace(/[|:]/g, '');
      const precio = (t.precio ?? '').toString().trim();
      return precio ? `${nom}:${precio}` : nom;
    })
    .join('|');
}

function renderTallasAdmin() {
  const grid = document.getElementById('tallas-admin-grid');
  if (!grid) return;
  const origen = document.getElementById('prod-origen')?.value || 'colombia';
  const unidad = origen === 'venezuela' ? 'Bs' : 'COP';
  if (!tallasState.length) {
    grid.innerHTML = '<span class="tallas-admin-empty">Sin tallas — el producto se vende sin selector de talla</span>';
    return;
  }
  grid.innerHTML = tallasState.map((t, i) => `
    <div class="talla-admin-row">
      <input type="text" placeholder="Talla (ej: M)" value="${t.talla}" oninput="actualizarTallaAdmin(${i},'talla',this.value)">
      <input type="number" placeholder="Precio ${unidad} (opcional)" value="${t.precio}" step="500" oninput="actualizarTallaAdmin(${i},'precio',this.value)">
      <button type="button" class="talla-admin-del" onclick="eliminarTallaAdmin(${i})" title="Quitar talla">×</button>
    </div>`).join('');
}

function agregarTallaAdmin() {
  tallasState.push({ talla: '', precio: '' });
  renderTallasAdmin();
}

function agregarTallasRapido() {
  const input  = document.getElementById('tallas-quick-input');
  const nuevas = parseTallasString(input.value);
  if (!nuevas.length) return;
  tallasState.push(...nuevas);
  input.value = '';
  renderTallasAdmin();
}

function eliminarTallaAdmin(idx) {
  tallasState.splice(idx, 1);
  renderTallasAdmin();
}

function actualizarTallaAdmin(idx, campo, valor) {
  if (tallasState[idx]) tallasState[idx][campo] = valor;
}

// ─── COLORES ───────────────────────────────────────────
function parseColoresString(str) {
  if (!str?.trim()) return [];
  return str.split('|').map(t => {
    const partes = t.trim().split(':');
    return { color: (partes[0] || '').trim(), hex: (partes[1] || '#cccccc').trim() };
  }).filter(t => t.color);
}

function serializeColores(arr) {
  return arr
    .filter(t => (t.color || '').trim())
    .map(t => {
      const nom = t.color.trim().replace(/[|:]/g, '');
      const hex = (t.hex || '#cccccc').trim();
      return `${nom}:${hex}`;
    })
    .join('|');
}

function renderColoresAdmin() {
  const grid = document.getElementById('colores-admin-grid');
  if (!grid) return;
  if (!coloresState.length) {
    grid.innerHTML = '<span class="tallas-admin-empty">Sin colores — el producto se vende sin selector de color</span>';
    return;
  }
  grid.innerHTML = coloresState.map((c, i) => `
    <div class="talla-admin-row color-admin-row">
      <input type="text" placeholder="Color (ej: Negro)" value="${c.color}" oninput="actualizarColorAdmin(${i},'color',this.value)">
      <input type="color" value="${c.hex || '#cccccc'}" oninput="actualizarColorAdmin(${i},'hex',this.value)">
      <button type="button" class="talla-admin-del" onclick="eliminarColorAdmin(${i})" title="Quitar color">×</button>
    </div>`).join('');
}

function agregarColorAdmin() {
  coloresState.push({ color: '', hex: '#cccccc' });
  renderColoresAdmin();
}

function agregarColoresRapido() {
  const input  = document.getElementById('colores-quick-input');
  const nuevos = parseColoresString(input.value);
  if (!nuevos.length) return;
  coloresState.push(...nuevos);
  input.value = '';
  renderColoresAdmin();
}

function eliminarColorAdmin(idx) {
  coloresState.splice(idx, 1);
  renderColoresAdmin();
}

function actualizarColorAdmin(idx, campo, valor) {
  if (coloresState[idx]) coloresState[idx][campo] = valor;
}

function abrirFormProducto(id) {
  const modal = document.getElementById('modal-producto-admin');
  modal.classList.add('activo');
  imagenesState = [];
  document.getElementById('prod-img-file').value = '';

  if (id) {
    const p = todosProductos.find(x => x.id === id);
    if (!p) return;
    document.getElementById('form-prod-titulo').textContent = 'Editar producto';
    document.getElementById('prod-id').value        = id;
    document.getElementById('prod-nom').value       = p.nom         || '';
    document.getElementById('prod-categoria').value = p.categoria   || '';
    document.getElementById('prod-origen').value    = p.origen      || 'colombia';
    document.getElementById('prod-inv').value       = p.inv_cop     || '';
    document.getElementById('prod-precio-bs').value = p.precio_bs   || '';
    document.getElementById('prod-genero').value    = p.genero      || '';
    document.getElementById('prod-subtipo').value   = p.subtipo     || '';
    document.getElementById('prod-desc').value      = p.descripcion || '';
    document.getElementById('prod-activo').checked  = p.activo !== false;
    toggleOrigenAdmin(p.origen || 'colombia');

    if (p.imagenes && p.imagenes.length) {
      imagenesState = p.imagenes.map(src => ({ tipo: 'url', src }));
    } else if (p.imagen) {
      imagenesState = [{ tipo: 'url', src: p.imagen }];
    }
    renderImagenesAdmin();

    tallasState = parseTallasString(p.tallas || '');
    renderTallasAdmin();

    coloresState = parseColoresString(p.colores || '');
    renderColoresAdmin();
  } else {
    document.getElementById('form-prod-titulo').textContent = 'Nuevo producto';
    document.getElementById('form-producto').reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-activo').checked = true;
    toggleOrigenAdmin('colombia');
    renderImagenesAdmin();

    tallasState = [];
    renderTallasAdmin();

    coloresState = [];
    renderColoresAdmin();
  }
}

function cerrarFormProducto() {
  document.getElementById('modal-producto-admin').classList.remove('activo');
}

async function guardarProducto(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-prod');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    // Subir imágenes nuevas (tipo 'file') a Google Drive vía GAS
    for (let i = 0; i < imagenesState.length; i++) {
      if (imagenesState[i].tipo === 'file') {
        const subida = await fetch(GAS_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body:    JSON.stringify({ action: 'subirImagen', imagen: imagenesState[i].src, nombre: 'producto-' + Date.now() + '-' + i })
        });
        const json = await subida.json();
        imagenesState[i] = { tipo: 'url', src: json.url || imagenesState[i].src };
      }
    }
    const imagenes = imagenesState.map(img => img.src);
    const imagen   = imagenes[0] || '';

    const origen = document.getElementById('prod-origen').value;
    const data = {
      nom:        document.getElementById('prod-nom').value.trim(),
      categoria:  document.getElementById('prod-categoria').value,
      origen,
      inv_cop:    origen === 'colombia' ? (parseFloat(document.getElementById('prod-inv').value) || 0) : null,
      precio_bs:  origen === 'venezuela' ? (parseFloat(document.getElementById('prod-precio-bs').value) || 0) : null,
      genero:     document.getElementById('prod-genero').value,
      subtipo:    document.getElementById('prod-subtipo').value.trim(),
      tallas:     serializeTallas(tallasState),
      colores:    serializeColores(coloresState),
      descripcion:document.getElementById('prod-desc').value.trim(),
      imagenes,
      imagen,
      activo:     document.getElementById('prod-activo').checked,
    };

    const id = document.getElementById('prod-id').value;
    if (id) {
      await updateDoc(doc(db, 'productos', id), data);
      toastAdmin('Producto actualizado ✓');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'productos'), data);
      toastAdmin('Producto creado ✓');
    }
    cerrarFormProducto();
  } catch(err) {
    console.error(err);
    toastAdmin('Error al guardar: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar producto';
  }
}

async function toggleProductoActivo(id, nuevoEstado) {
  await updateDoc(doc(db, 'productos', id), { activo: nuevoEstado });
  toastAdmin(nuevoEstado ? 'Producto activado' : 'Producto ocultado');
}

function confirmarEliminarProducto(id, nom) {
  if (!confirm(`¿Eliminar "${nom}"? Esta acción no se puede deshacer.`)) return;
  eliminarProducto(id);
}

async function eliminarProducto(id) {
  await deleteDoc(doc(db, 'productos', id));
  toastAdmin('Producto eliminado');
}

// ─── TABLA ÓRDENES ────────────────────────────────────
const WA_MENSAJES = {
  pendiente:  'Hola {cliente} 👋, hemos recibido tu pedido *{num}* y lo estamos verificando. ¡Gracias por tu compra! 🛍️',
  confirmado: 'Hola {cliente} 👋, tu pago fue *confirmado* y tu pedido *{num}* ya está en preparación. Te avisamos cuando sea enviado ✨',
  enviado:    'Hola {cliente} 👋, ¡buenas noticias! Tu pedido *{num}* ha sido *enviado* 🚚. Llegará en aproximadamente 7 días hábiles.',
  entregado:  'Hola {cliente} 👋, tu pedido *{num}* ha sido *entregado* ✅. ¡Esperamos que lo disfrutes! Gracias por comprar en Cosa Nova 🌟',
  cancelado:  'Hola {cliente}, lamentamos informarte que tu pedido *{num}* ha sido *cancelado* ❌. Contáctanos para más información.'
};

function renderTablaOrdenes(lista) {
  const tbody = document.getElementById('tbody-ordenes');
  if (!tbody) return;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Sin órdenes</td></tr>'; return; }
  tbody.innerHTML = lista.map(o => {
    const fecha = o.createdAt?.toDate?.()?.toLocaleDateString('es-VE') || '—';
    const estClass = { pendiente:'est-pend', confirmado:'est-ok', enviado:'est-env', entregado:'est-done', cancelado:'est-cancel' }[o.estado] || '';
    const comprobante = o.comprobanteUrl
      ? `<a href="${o.comprobanteUrl}" target="_blank" class="btn-ver">Ver</a>` : '—';
    return `<tr>
      <td class="td-id">#${o.id.slice(-6).toUpperCase()}</td>
      <td><strong>${o.nombre}</strong><br><span class="td-sub">${o.email}</span></td>
      <td class="td-prods">${o.productos}</td>
      <td><strong>$${o.total_usd}</strong></td>
      <td>${o.metodo_pago || '—'}</td>
      <td>
        <select class="estado-select ${estClass}" onchange="cambiarEstadoOrden('${o.id}', this.value)">
          ${['pendiente','confirmado','enviado','entregado','cancelado'].map(s =>
            `<option value="${s}" ${o.estado===s?'selected':''}>${s}</option>`
          ).join('')}
        </select>
      </td>
      <td>${fecha}</td>
      <td>${comprobante}</td>
    </tr>`;
  }).join('');
}

function filtrarOrdenes(estado) {
  const lista = estado ? todasOrdenes.filter(o => o.estado === estado) : todasOrdenes;
  renderTablaOrdenes(lista);
}

async function cambiarEstadoOrden(id, estado) {
  const orden    = todasOrdenes.find(o => o.id === id);
  const plantilla = WA_MENSAJES[estado];
  if (orden && orden.telefono && plantilla) {
    const prefijo  = orden.tipo_orden === 'Apartado' ? 'AP-' : 'CN-';
    const num      = prefijo + orden.id.slice(-6).toUpperCase();
    const mensaje  = plantilla.replace('{cliente}', orden.nombre || 'cliente').replace('{num}', num);
    const telefono = orden.telefono.toString().replace(/\D/g, '');
    window.open('https://wa.me/' + telefono + '?text=' + encodeURIComponent(mensaje), '_blank');
  }
  await updateDoc(doc(db, 'ordenes', id), { estado });
  toastAdmin('Estado actualizado → ' + estado);
}

// ─── TABLA RESEÑAS ────────────────────────────────────
function renderTablaResenas(lista) {
  const tbody = document.getElementById('tbody-resenas');
  if (!tbody) return;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Sin reseñas</td></tr>'; return; }
  tbody.innerHTML = lista.map(r => {
    const estrellas = '★'.repeat(r.estrellas) + '☆'.repeat(5 - r.estrellas);
    return `<tr>
      <td><strong>${r.nombre}</strong></td>
      <td>${r.ciudad || '—'}</td>
      <td class="td-estrellas">${estrellas}</td>
      <td class="td-texto">${r.texto}</td>
      <td><span class="badge-estado ${r.aprobada ? 'badge-activo' : 'badge-inactivo'}">${r.aprobada ? 'Aprobada' : 'Pendiente'}</span></td>
      <td class="td-acciones">
        ${!r.aprobada ? `<button class="btn-edit" onclick="aprobarResena('${r.id}')">✅</button>` : ''}
        <button class="btn-del" onclick="eliminarResena('${r.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

async function aprobarResena(id) {
  await updateDoc(doc(db, 'resenas', id), { aprobada: true });
  toastAdmin('Reseña aprobada ✓');
}

async function eliminarResena(id) {
  if (!confirm('¿Eliminar esta reseña?')) return;
  await deleteDoc(doc(db, 'resenas', id));
  toastAdmin('Reseña eliminada');
}

// ─── TASAS ────────────────────────────────────────────
async function guardarTasas() {
  const trm     = parseFloat(document.getElementById('tasa-trm').value);
  const bcv     = parseFloat(document.getElementById('tasa-bcv-input').value);
  const binance = parseFloat(document.getElementById('tasa-binance-input').value);
  if (!trm || !bcv || !binance) return toastAdmin('Completa los tres valores');
  await setDoc(doc(db, 'configuracion', 'tasas'), {
    trm, bcv, binance, updatedAt: serverTimestamp()
  });
  const ok = document.getElementById('tasas-ok');
  if (ok) { ok.style.display = 'block'; setTimeout(() => ok.style.display = 'none', 3000); }
  toastAdmin('Tasas guardadas ✓');
}

// ─── AUTH ─────────────────────────────────────────────
async function adminCerrarSesion() {
  await signOut(auth);
  window.location.href = 'index.html';
}

// ─── TOAST ────────────────────────────────────────────
function toastAdmin(msg) {
  const t = document.getElementById('admin-toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 3000);
}

// ─── EXPONER AL DOM ───────────────────────────────────
Object.assign(window, {
  cambiarPanel, abrirFormProducto, cerrarFormProducto,
  agregarImagenesAdmin, eliminarImagenAdmin,
  agregarTallaAdmin, eliminarTallaAdmin, actualizarTallaAdmin, agregarTallasRapido,
  agregarColorAdmin, eliminarColorAdmin, actualizarColorAdmin, agregarColoresRapido,
  guardarProducto, toggleProductoActivo,
  confirmarEliminarProducto, filtrarTablaProductos, toggleOrigenAdmin,
  filtrarOrdenes, cambiarEstadoOrden,
  aprobarResena, eliminarResena,
  guardarTasas, adminCerrarSesion
});
