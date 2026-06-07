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

function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── ESTADO ───────────────────────────────────────────
let todosProductos = [];
let todasOrdenes   = [];
let adminUser      = null;
let imagenArchivo  = null;

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
      document.getElementById('tasa-trm').value         = d.trm     || '';
      document.getElementById('tasa-bcv-input').value   = d.bcv     || '';
      document.getElementById('tasa-binance-input').value = d.binance || '';
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

// ─── TABLA PRODUCTOS ──────────────────────────────────
function renderTablaProductos(lista) {
  const tbody = document.getElementById('tbody-productos');
  if (!tbody) return;
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Sin productos</td></tr>'; return; }
  tbody.innerHTML = lista.map(p => {
    const imgSrc = p.imagen
      ? (p.imagen.startsWith('http') ? p.imagen : `assets/products/${p.imagen}`)
      : '';
    const precioFmt = new Intl.NumberFormat('es-CO').format(p.inv_cop || 0);
    return `<tr>
      <td>${imgSrc ? `<img src="${imgSrc}" class="tabla-thumb" onerror="this.style.display='none'">` : '<span class="no-img">—</span>'}</td>
      <td class="td-nom">${p.nom}</td>
      <td><span class="badge-cat badge-${(p.categoria||'').toLowerCase()}">${p.categoria}</span></td>
      <td>$ ${precioFmt}</td>
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
function abrirFormProducto(id) {
  const modal = document.getElementById('modal-producto-admin');
  modal.classList.add('activo');
  imagenArchivo = null;
  document.getElementById('img-preview-admin').innerHTML = '<span>Sin imagen</span>';
  document.getElementById('prod-img-file').value = '';

  if (id) {
    const p = todosProductos.find(x => x.id === id);
    if (!p) return;
    document.getElementById('form-prod-titulo').textContent = 'Editar producto';
    document.getElementById('prod-id').value          = id;
    document.getElementById('prod-nom').value         = p.nom         || '';
    document.getElementById('prod-categoria').value   = p.categoria   || '';
    document.getElementById('prod-inv').value         = p.inv_cop     || '';
    document.getElementById('prod-genero').value      = p.genero      || '';
    document.getElementById('prod-subtipo').value     = p.subtipo     || '';
    document.getElementById('prod-tallas').value      = p.tallas      || '';
    document.getElementById('prod-desc').value        = p.descripcion || '';
    document.getElementById('prod-img-nombre').value  = p.imagen && !p.imagen.startsWith('http') ? p.imagen : '';
    document.getElementById('prod-activo').checked    = p.activo !== false;

    if (p.imagen) {
      const src = p.imagen.startsWith('http') ? p.imagen : `assets/products/${p.imagen}`;
      document.getElementById('img-preview-admin').innerHTML = `<img src="${src}" onerror="this.parentElement.innerHTML='<span>Sin imagen</span>'">`;
    }
  } else {
    document.getElementById('form-prod-titulo').textContent = 'Nuevo producto';
    document.getElementById('form-producto').reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-activo').checked = true;
  }
}

function cerrarFormProducto() {
  document.getElementById('modal-producto-admin').classList.remove('activo');
}

function previewImagenAdmin(input) {
  const file = input.files[0];
  if (!file) return;
  imagenArchivo = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('img-preview-admin').innerHTML = `<img src="${e.target.result}">`;
  };
  reader.readAsDataURL(file);
}

async function guardarProducto(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-prod');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    let imagenVal = document.getElementById('prod-img-nombre').value.trim();

    // Subir imagen nueva a Google Drive (vía GAS) si se seleccionó archivo
    if (imagenArchivo) {
      const imgB64 = await archivoABase64(imagenArchivo);
      const subida = await fetch(GAS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body:    JSON.stringify({ action: 'subirImagen', imagen: imgB64, nombre: 'producto-' + Date.now() })
      });
      const json = await subida.json();
      imagenVal  = json.url || imagenVal;
    }

    const data = {
      nom:        document.getElementById('prod-nom').value.trim(),
      categoria:  document.getElementById('prod-categoria').value,
      inv_cop:    parseFloat(document.getElementById('prod-inv').value) || 0,
      genero:     document.getElementById('prod-genero').value,
      subtipo:    document.getElementById('prod-subtipo').value.trim(),
      tallas:     document.getElementById('prod-tallas').value.trim(),
      descripcion:document.getElementById('prod-desc').value.trim(),
      imagen:     imagenVal,
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
  previewImagenAdmin, guardarProducto, toggleProductoActivo,
  confirmarEliminarProducto, filtrarTablaProductos,
  filtrarOrdenes, cambiarEstadoOrden,
  aprobarResena, eliminarResena,
  guardarTasas, adminCerrarSesion
});
