// ══════════════════════════════════════════════════════
//  COSA NOVA MARKETPLACE — app.js  (Firebase Edition)
// ══════════════════════════════════════════════════════

import { db, auth } from './firebase-config.js';

import {
  collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import {
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
  GoogleAuthProvider, signInWithPopup, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ─── CONSTANTES ───────────────────────────────────────
const WA_NUM      = '573001885210';
const MARGEN      = 30;
const FEE         = 2;    // % recargo Colombia (plataforma/envío)
const FEE_VE      = 0.3;  // % comisión banco al convertir Bs recibidos → USDT
const ADMIN_EMAIL = 'cosanova.ve@gmail.com';
const GAS_URL     = 'https://script.google.com/macros/s/AKfycby8oGOKP9nkwjZZ6-Ilaz7HNTCxMnhHsWlswbV43-Y_luE8mJpaAl5TPa0gVA-PSBxN/exec';

// ─── ESTADO GLOBAL ────────────────────────────────────
let tasas           = { trm: 4200, bcv: 50, binance: 65 };
let productos       = [];
let carrito         = JSON.parse(localStorage.getItem('cn-carrito') || '[]');
let usuario         = null;
let perfilUsuario   = null;
let wishlist        = new Set();
let categoriaActual = 'todas';
let generoActual    = '';
let subtipoActual   = '';
let busqueda        = '';
let precioMin       = 0;
let precioMax       = Infinity;
let metodoSeleccionado = '';
let capturaArchivo  = null;
let capturaB64      = '';
let modoApartado    = false;
let abonoApartado   = 0;
let mpEstado        = {}; // selección talla/color en el modal de producto

// ─── INICIALIZACIÓN ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticulas();
  initReveal();
  initNavbar();
  initStars();
  actualizarCarritoUI();
  initAuth();
  initFirestore();
  initBusqueda();
});

// ─── FIREBASE: FIRESTORE ──────────────────────────────
function initFirestore() {
  // Tasas en tiempo real desde Firestore
  onSnapshot(doc(db, 'configuracion', 'tasas'), snap => {
    if (snap.exists()) {
      const d = snap.data();
      if (d.trm)     tasas.trm     = d.trm;
      if (d.bcv)     tasas.bcv     = d.bcv;
      if (d.binance) tasas.binance = d.binance;
      mostrarTasasBar();
      actualizarCarritoUI();
    }
  });

  // Productos en tiempo real
  // Nota: ordenamos por 'nom' en el cliente (no en la query) para no requerir
  // un índice compuesto en Firestore para where('activo')+orderBy('nom')
  const qProd = query(
    collection(db, 'productos'),
    where('activo', '==', true)
  );
  onSnapshot(qProd, snap => {
    productos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    renderProductos(productos);
    renderHeroPreview(productos);
  }, err => {
    console.error('Error cargando productos desde Firestore:', err);
  });
}

// ─── FIREBASE: AUTH ───────────────────────────────────
function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    usuario = user;
    if (user) {
      perfilUsuario = await cargarPerfilUsuario(user.uid);
      await cargarWishlist(user.uid);
    } else {
      perfilUsuario = null;
      wishlist.clear();
    }
    actualizarUIAuth(user);
    renderProductos(productos);
  });
}

async function cargarPerfilUsuario(uid) {
  const snap = await getDoc(doc(db, 'usuarios', uid));
  return snap.exists() ? snap.data() : null;
}

async function cargarWishlist(uid) {
  const snap = await getDocs(collection(db, 'usuarios', uid, 'wishlist'));
  wishlist.clear();
  snap.forEach(d => wishlist.add(d.id));
  renderProductos(productos);
}

async function toggleWishlist(productId) {
  if (!usuario) return abrirModalAuth();
  const ref_ = doc(db, 'usuarios', usuario.uid, 'wishlist', productId);
  if (wishlist.has(productId)) {
    await deleteDoc(ref_);
    wishlist.delete(productId);
  } else {
    await setDoc(ref_, { addedAt: serverTimestamp() });
    wishlist.add(productId);
  }
  renderProductos(productos);
  // Actualizar corazón en modal si está abierto
  const mpHeart = document.getElementById('mp-heart');
  if (mpHeart) mpHeart.classList.toggle('activo', wishlist.has(productId));
}

function actualizarUIAuth(user) {
  actualizarUIResenas(user);
  const btn    = document.getElementById('nav-user-btn');
  const label  = document.getElementById('nav-user-label');
  const avatar = document.getElementById('nav-user-avatar');
  if (!btn) return;
  if (user) {
    const inicial = (user.displayName || user.email || 'U')[0].toUpperCase();
    if (avatar) { avatar.textContent = inicial; avatar.style.display = 'flex'; }
    if (label)  label.textContent = user.displayName ? user.displayName.split(' ')[0] : 'Mi cuenta';
  } else {
    if (avatar) avatar.style.display = 'none';
    if (label)  label.textContent = 'Ingresar';
  }
}

// ─── AUTH MODAL ───────────────────────────────────────
function abrirAuth() {
  if (usuario) abrirMiCuenta();
  else abrirModalAuth();
}

function abrirModalAuth() {
  const m = document.getElementById('modal-auth');
  if (m) { m.classList.add('activo'); document.body.style.overflow = 'hidden'; }
  cambiarTabAuth('login');
  limpiarErroresAuth();
}

function cerrarModalAuth() {
  const m = document.getElementById('modal-auth');
  if (m) { m.classList.remove('activo'); document.body.style.overflow = ''; }
}

function cambiarTabAuth(tab) {
  document.getElementById('tab-login')?.classList.toggle('activo', tab === 'login');
  document.getElementById('tab-registro')?.classList.toggle('activo', tab === 'registro');
  document.getElementById('form-login')?.classList.toggle('activo', tab === 'login');
  document.getElementById('form-registro')?.classList.toggle('activo', tab === 'registro');
  limpiarErroresAuth();
}

function limpiarErroresAuth() {
  const e1 = document.getElementById('auth-error');
  const e2 = document.getElementById('reg-error');
  if (e1) { e1.style.display = 'none'; e1.textContent = ''; }
  if (e2) { e2.style.display = 'none'; e2.textContent = ''; }
}

function mostrarErrorAuth(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

async function loginConEmail() {
  const email = document.getElementById('auth-email')?.value.trim();
  const pass  = document.getElementById('auth-pass')?.value;
  if (!email || !pass) return mostrarErrorAuth('auth-error', 'Completa email y contraseña');
  const btn = document.getElementById('btn-login');
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    cerrarModalAuth();
    mostrarToast('¡Bienvenido de vuelta!');
  } catch(e) {
    const msgs = {
      'auth/user-not-found':    'No hay cuenta con ese email',
      'auth/wrong-password':    'Contraseña incorrecta',
      'auth/invalid-credential':'Email o contraseña incorrectos',
      'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
    };
    mostrarErrorAuth('auth-error', msgs[e.code] || 'Error al iniciar sesión');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Iniciar sesión →'; }
  }
}

async function loginConGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const user   = result.user;
    // Crear perfil si es primera vez
    const perfRef = doc(db, 'usuarios', user.uid);
    const perfSnap = await getDoc(perfRef);
    if (!perfSnap.exists()) {
      await setDoc(perfRef, {
        nombre: user.displayName || '',
        email:  user.email || '',
        telefono: '', cedula: '', ciudad: '', direccion: '',
        esAdmin:  user.email === ADMIN_EMAIL,
        createdAt: serverTimestamp()
      });
    }
    cerrarModalAuth();
    mostrarToast('¡Bienvenido, ' + (user.displayName || 'usuario') + '!');
  } catch(e) {
    if (e.code !== 'auth/popup-closed-by-user') {
      mostrarErrorAuth('auth-error', 'Error con Google. Intenta de nuevo');
    }
  }
}

async function registrarUsuario() {
  const nom   = document.getElementById('reg-nom')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const pass  = document.getElementById('reg-pass')?.value;
  if (!nom || !email || !pass) return mostrarErrorAuth('reg-error', 'Completa todos los campos');
  if (pass.length < 6)          return mostrarErrorAuth('reg-error', 'La contraseña debe tener al menos 6 caracteres');
  const btn = document.getElementById('btn-registro');
  if (btn) { btn.disabled = true; btn.textContent = 'Creando cuenta...'; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: nom });
    await setDoc(doc(db, 'usuarios', cred.user.uid), {
      nombre: nom, email,
      telefono: '', cedula: '', ciudad: '', direccion: '',
      esAdmin: email === ADMIN_EMAIL,
      createdAt: serverTimestamp()
    });
    cerrarModalAuth();
    mostrarToast('¡Cuenta creada! Bienvenido, ' + nom);
  } catch(e) {
    const msgs = {
      'auth/email-already-in-use': 'Ya existe una cuenta con ese email',
      'auth/invalid-email':        'Email inválido',
      'auth/weak-password':        'Contraseña muy débil',
    };
    mostrarErrorAuth('reg-error', msgs[e.code] || 'Error al crear cuenta');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Crear cuenta →'; }
  }
}

async function cerrarSesion() {
  await signOut(auth);
  cerrarMiCuenta();
  mostrarToast('Sesión cerrada');
}

// ─── PERFIL / MI CUENTA ───────────────────────────────
async function abrirMiCuenta() {
  if (!usuario) return abrirModalAuth();
  const m = document.getElementById('modal-cuenta');
  if (!m) return;
  m.classList.add('activo');
  document.body.style.overflow = 'hidden';

  document.getElementById('cuenta-nombre').textContent = usuario.displayName || usuario.email;
  document.getElementById('cuenta-email').textContent  = usuario.email;
  const inicial = (usuario.displayName || usuario.email || 'U')[0].toUpperCase();
  document.getElementById('cuenta-avatar-modal').textContent = inicial;

  cambiarTabCuenta('pedidos');
}

function cerrarMiCuenta() {
  const m = document.getElementById('modal-cuenta');
  if (m) { m.classList.remove('activo'); document.body.style.overflow = ''; }
}

function cambiarTabCuenta(tab) {
  ['pedidos','guardados','perfil'].forEach(t => {
    document.getElementById('ctab-' + t)?.classList.toggle('activo', t === tab);
    document.getElementById('cpanel-' + t)?.classList.toggle('activo', t === tab);
  });
  if (tab === 'pedidos')   cargarMisPedidos();
  if (tab === 'guardados') cargarMisGuardados();
  if (tab === 'perfil')    cargarFormPerfil();
}

async function cargarMisPedidos() {
  const cont = document.getElementById('lista-pedidos');
  if (!cont || !usuario) return;
  cont.innerHTML = '<div class="loading-mini"><div class="loader-spin"></div><p>Cargando...</p></div>';

  // Nota: ordenamos por fecha en el cliente (no en la query) para no requerir
  // un índice compuesto en Firestore para where('uid')+orderBy('createdAt')
  const q = query(collection(db, 'ordenes'), where('uid', '==', usuario.uid));
  let snap;
  try {
    snap = await getDocs(q);
  } catch(e) {
    console.error('Error cargando pedidos:', e);
    cont.innerHTML = '<p class="cp-vacio">No se pudieron cargar tus pedidos. Intenta de nuevo.</p>';
    return;
  }
  if (snap.empty) {
    cont.innerHTML = '<p class="cp-vacio">No tienes pedidos aún.</p>';
    return;
  }
  const docsOrdenados = snap.docs.sort((a, b) =>
    (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0)
  );
  cont.innerHTML = docsOrdenados.map(d => {
    const o = d.data();
    const fecha = o.createdAt?.toDate?.()?.toLocaleDateString('es-VE') || '—';
    const estadoClass = { pendiente:'cp-est-pend', confirmado:'cp-est-ok', enviado:'cp-est-env', entregado:'cp-est-done', cancelado:'cp-est-cancel' }[o.estado] || '';
    return `<div class="cp-pedido">
      <div class="cp-ped-head">
        <span class="cp-num">${o.tipo_orden === 'Apartado' ? '💰 Apartado' : '📦 Pedido'} #${d.id.slice(-6).toUpperCase()}</span>
        <span class="cp-est ${estadoClass}">${o.estado || 'pendiente'}</span>
      </div>
      <p class="cp-prods">${o.productos || '—'}</p>
      <div class="cp-ped-foot">
        <span>$${o.total_usd} USD</span>
        <span>${fecha}</span>
      </div>
    </div>`;
  }).join('');
}

async function cargarMisGuardados() {
  const cont = document.getElementById('lista-guardados');
  if (!cont || !usuario) return;
  cont.innerHTML = '<div class="loading-mini"><div class="loader-spin"></div></div>';

  if (wishlist.size === 0) {
    cont.innerHTML = '<p class="cp-vacio">No tienes productos guardados.</p>';
    return;
  }
  const guardados = productos.filter(p => wishlist.has(p.id));
  if (guardados.length === 0) {
    cont.innerHTML = '<p class="cp-vacio">No hay productos guardados disponibles.</p>';
    return;
  }
  cont.innerHTML = guardados.map(p => cardHTML(p, true)).join('');
}

function cargarFormPerfil() {
  if (!perfilUsuario) return;
  document.getElementById('perfil-nom').value    = perfilUsuario.nombre  || '';
  document.getElementById('perfil-tel').value    = perfilUsuario.telefono || '';
  document.getElementById('perfil-cedula').value = perfilUsuario.cedula  || '';
  document.getElementById('perfil-ciudad').value = perfilUsuario.ciudad  || '';
  document.getElementById('perfil-dir').value    = perfilUsuario.direccion || '';
}

async function guardarPerfil() {
  if (!usuario) return;
  const data = {
    nombre:    document.getElementById('perfil-nom')?.value.trim()    || '',
    telefono:  document.getElementById('perfil-tel')?.value.trim()    || '',
    cedula:    document.getElementById('perfil-cedula')?.value.trim() || '',
    ciudad:    document.getElementById('perfil-ciudad')?.value.trim() || '',
    direccion: document.getElementById('perfil-dir')?.value.trim()    || '',
  };
  const btn = document.querySelector('#cpanel-perfil .btn-co');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  try {
    await updateDoc(doc(db, 'usuarios', usuario.uid), data);
    perfilUsuario = { ...perfilUsuario, ...data };
    mostrarToast('Perfil actualizado');
  } catch(e) {
    mostrarToast('Error al guardar perfil');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios →'; }
  }
}

// ─── BARRA DE TASAS ───────────────────────────────────
function mostrarTasasBar() {
  const elBin = document.getElementById('tasa-binance');
  const elBcv = document.getElementById('tasa-bcv');
  if (elBin) elBin.textContent = `Bs ${fmt(tasas.binance)} / USDT`;
  if (elBcv) elBcv.textContent = `Bs ${fmt(tasas.bcv)}`;
}

// ─── CÁLCULO DE PRECIOS ───────────────────────────────
// pvp_usd: precio "real" en USD/USDT (sin inflar por tasas de Bs).
// pvp_bs : conversión a bolívares SIEMPRE a tasa Binance (no BCV) y
//          descontando la comisión bancaria (FEE_VE) de convertir Bs→USDT,
//          así el bolívar recibido siempre equivale a pvp_usd sin importar
//          cuánto se devalúe el BCV frente a Binance.
function calcPrecio(p) {
  let costo_usd, fee;
  if (p.origen === 'venezuela') {
    costo_usd = (p.precio_bs || 0) / tasas.binance;
    fee = 0;
  } else {
    costo_usd = (p.inv_cop || 0) / tasas.trm;
    fee = FEE;
  }
  const pvp_usd = costo_usd / (1 - MARGEN / 100) * (1 + fee / 100);
  const pvp_bs  = pvp_usd * tasas.binance / (1 - FEE_VE / 100);
  return { pvp_usd, pvp_bs };
}

function fmt(n, dec = 2) {
  return parseFloat(n).toLocaleString('es-VE', {
    minimumFractionDigits: dec, maximumFractionDigits: dec
  });
}

// ─── HELPER IMAGEN ────────────────────────────────────
function getMainImage(p) {
  const img = (p.imagenes && p.imagenes.length) ? p.imagenes[0] : (p.imagen || null);
  if (!img) return null;
  return img.startsWith('http') ? img : `assets/products/${img}`;
}

// ─── RENDER PRODUCTOS ─────────────────────────────────
function renderProductos(lista) {
  const grid    = document.getElementById('productos-grid');
  const sinProd = document.getElementById('sin-productos');
  if (!grid) return;

  let filtrados = categoriaActual === 'todas' ? lista : lista.filter(p => p.categoria === categoriaActual);
  if (generoActual)  filtrados = filtrados.filter(p => p.genero  === generoActual);
  if (subtipoActual) filtrados = filtrados.filter(p => p.subtipo === subtipoActual);
  if (busqueda)      filtrados = filtrados.filter(p =>
    p.nom.toLowerCase().includes(busqueda) ||
    (p.descripcion || '').toLowerCase().includes(busqueda)
  );
  if (precioMin > 0 || precioMax < Infinity) {
    filtrados = filtrados.filter(p => {
      const { pvp_usd } = calcPrecio(p);
      return pvp_usd >= precioMin && pvp_usd <= precioMax;
    });
  }

  if (filtrados.length === 0) {
    grid.innerHTML = '';
    if (sinProd) sinProd.style.display = 'block';
    return;
  }
  if (sinProd) sinProd.style.display = 'none';

  grid.innerHTML = filtrados.map(p => cardHTML(p)).join('');
  grid.querySelectorAll('.producto-card').forEach((el, i) => {
    el.style.transitionDelay = `${i * 0.06}s`;
    observerReveal?.observe(el);
  });
}

// ─── HTML TARJETA PRODUCTO ────────────────────────────
function cardHTML(p, mini = false) {
  const { pvp_usd, pvp_bs } = calcPrecio(p);
  const tallas  = parsearTallas(p.tallas, p);
  const colores = parsearColores(p.colores);
  const nomEsc  = (p.nom || '').replace(/'/g, "\\'");
  const nomAttr = (p.nom || '').replace(/"/g, '&quot;');
  const enWish  = wishlist.has(p.id);
  const imgSrc  = getMainImage(p);

  const imgHTML = imgSrc
    ? `<img src="${imgSrc}" alt="${p.nom}" class="producto-img" onerror="this.parentElement.innerHTML='<div class=\\'producto-img-placeholder\\'>${iconoCategoria(p.categoria)}</div>'">`
    : `<div class="producto-img-placeholder">${iconoCategoria(p.categoria)}</div>`;

  const tallasHTML = tallas.length > 0 ? `
    <div class="tallas-selector">
      <span class="tallas-label">Talla:</span>
      <div class="tallas-btns">
        ${tallas.map(t => `<button class="talla-btn" onclick="seleccionarTalla(this,'${t.talla}',${t.valor},'${p.origen}')">${t.talla}</button>`).join('')}
      </div>
    </div>` : '';

  const coloresHTML = colores.length > 0 ? `
    <div class="tallas-selector">
      <span class="tallas-label">Color:</span>
      <div class="colores-btns">
        ${colores.map(c => `<button class="color-btn" title="${c.color}" onclick="seleccionarColor(this,'${c.color}')"><span class="color-swatch" style="background:${c.hex}"></span><span class="color-nombre">${c.color}</span></button>`).join('')}
      </div>
    </div>` : '';

  const necesitaSeleccion = tallas.length > 0 || colores.length > 0;
  const btnHTML = necesitaSeleccion
    ? `<button class="btn-carrito btn-talla-pendiente" disabled>${mensajeSeleccionPendiente(tallas.length > 0, colores.length > 0)}</button>`
    : `<button class="btn-carrito" onclick="agregarAlCarrito('${nomEsc}',${pvp_usd.toFixed(2)},'${p.categoria}','','${p.id}','')">🛒 Agregar</button>`;

  return `
    <div class="producto-card reveal${mini ? ' mini' : ''}" data-id="${p.id}" data-nom="${nomAttr}" data-cat="${p.categoria}" data-pvp-usd="${pvp_usd}" data-need-talla="${tallas.length > 0 ? '1' : '0'}" data-need-color="${colores.length > 0 ? '1' : '0'}" data-talla-sel="" data-color-sel="">
      <div class="producto-img-wrap" onclick="abrirProducto('${p.id}')">
        ${imgHTML}
        <div class="producto-img-overlay"><span>🔍 Ver</span></div>
        <button class="wishlist-heart${enWish ? ' activo' : ''}" onclick="event.stopPropagation();toggleWishlist('${p.id}')" title="${enWish ? 'Quitar de guardados' : 'Guardar'}">
          ${enWish ? '❤️' : '🤍'}
        </button>
      </div>
      <div class="producto-body">
        <span class="producto-cat">${p.categoria}</span>
        <h3 class="producto-nom producto-nom-link" onclick="abrirProducto('${p.id}')">${p.nom}</h3>
        <span class="chip-apartado">💰 Apartado disponible</span>
        <div class="producto-precios">
          <div class="precio-usd"><span>$ </span>${fmt(pvp_usd)} <span>USD</span></div>
          <div class="precio-bs">BCV: <strong>Bs ${fmt(pvp_bs, 0)}</strong></div>
        </div>
        ${tallasHTML}
        ${coloresHTML}
        ${btnHTML}
      </div>
    </div>`;
}

// ─── HERO PREVIEW ─────────────────────────────────────
let heroPreviewInterval = null;

function renderHeroPreview(lista) {
  const cont = document.getElementById('hero-preview');
  if (!cont || !lista.length) return;
  const aleatorios = [...lista].sort(() => Math.random() - 0.5).slice(0, 3);
  cont.innerHTML = aleatorios.map(p => {
    const pvp    = calcPrecio(p);
    const imgSrc = getMainImage(p);
    const imgHTML = imgSrc
      ? `<img src="${imgSrc}" class="hero-prev-img" onerror="this.outerHTML='<div class=\\'hero-prev-img-placeholder\\'>${iconoCategoria(p.categoria)}</div>'">`
      : `<div class="hero-prev-img-placeholder">${iconoCategoria(p.categoria)}</div>`;
    return `<div class="hero-prev-card" onclick="document.getElementById('catalogo').scrollIntoView({behavior:'smooth'})">
      ${imgHTML}
      <div class="hero-prev-info">
        <div class="hero-prev-nom">${p.nom}</div>
        <div class="hero-prev-precio">$ ${fmt(pvp.pvp_usd)} USD</div>
      </div>
    </div>`;
  }).join('');

  if (!heroPreviewInterval) {
    heroPreviewInterval = setInterval(() => renderHeroPreview(productos), 30000);
  }
}

// ─── MODAL DETALLE PRODUCTO ───────────────────────────
function abrirProducto(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;

  const { pvp_usd, pvp_bs } = calcPrecio(p);

  document.getElementById('mp-cat').textContent  = p.categoria;
  document.getElementById('mp-nom').textContent  = p.nom;
  document.getElementById('mp-desc').textContent = p.descripcion || 'Sin descripción disponible.';
  document.getElementById('mp-usd').textContent  = fmt(pvp_usd);
  document.getElementById('mp-bs').textContent   = 'Bs ' + fmt(pvp_bs, 0);

  const img  = document.getElementById('mp-img');
  const phld = document.getElementById('mp-img-placeholder');

  const imagenes = (p.imagenes && p.imagenes.length) ? p.imagenes : (p.imagen ? [p.imagen] : []);
  const mainSrc  = imagenes.length
    ? (imagenes[0].startsWith('http') ? imagenes[0] : `assets/products/${imagenes[0]}`)
    : null;

  if (mainSrc) {
    img.src = mainSrc; img.alt = p.nom;
    img.style.display = 'block'; phld.style.display = 'none';
  } else {
    img.style.display = 'none';
    phld.textContent = iconoCategoria(p.categoria); phld.style.display = 'flex';
  }

  // Tira de thumbnails (solo si hay más de una imagen)
  document.getElementById('mp-thumbnails')?.remove();
  if (imagenes.length > 1) {
    const strip = document.createElement('div');
    strip.id = 'mp-thumbnails';
    strip.className = 'mp-thumbnails';
    strip.innerHTML = imagenes.map((imgVal, i) => {
      const src = imgVal.startsWith('http') ? imgVal : `assets/products/${imgVal}`;
      return `<img src="${src}" class="mp-thumb${i === 0 ? ' activa' : ''}" onclick="cambiarImagenModal('${src}', this)" onerror="this.style.display='none'">`;
    }).join('');
    img.closest('.mp-img-wrap')?.appendChild(strip);
  }

  // Corazón de wishlist en modal
  const mpHeart = document.getElementById('mp-heart');
  if (mpHeart) {
    mpHeart.classList.toggle('activo', wishlist.has(id));
    mpHeart.innerHTML   = wishlist.has(id) ? '❤️' : '🤍';
    mpHeart.onclick     = () => toggleWishlist(id);
  }

  const nomEsc    = (p.nom || '').replace(/'/g, "\\'");
  const tallas    = parsearTallas(p.tallas, p);
  const colores   = parsearColores(p.colores);
  const mpTallas  = document.getElementById('mp-tallas');
  const mpTBtns   = document.getElementById('mp-tallas-btns');
  const mpColores = document.getElementById('mp-colores');
  const mpCBtns   = document.getElementById('mp-colores-btns');

  mpEstado = {
    id, nom: nomEsc, cat: p.categoria,
    pvp_usd,
    necesitaTalla: tallas.length > 0, necesitaColor: colores.length > 0,
    talla: '', color: ''
  };

  if (tallas.length > 0) {
    mpTallas.style.display = 'flex';
    mpTBtns.innerHTML = tallas.map(t =>
      `<button class="talla-btn" onclick="seleccionarTallaModal(this,'${t.talla}',${t.valor},'${p.origen}')">${t.talla}</button>`
    ).join('');
  } else {
    mpTallas.style.display = 'none'; mpTBtns.innerHTML = '';
  }

  if (colores.length > 0) {
    mpColores.style.display = 'flex';
    mpCBtns.innerHTML = colores.map(c =>
      `<button class="color-btn" title="${c.color}" onclick="seleccionarColorModal(this,'${c.color}')"><span class="color-swatch" style="background:${c.hex}"></span><span class="color-nombre">${c.color}</span></button>`
    ).join('');
  } else {
    mpColores.style.display = 'none'; mpCBtns.innerHTML = '';
  }

  actualizarBotonCarritoModal();

  document.getElementById('modal-producto').classList.add('activo');
  document.body.style.overflow = 'hidden';
}

function cerrarProducto() {
  document.getElementById('modal-producto').classList.remove('activo');
  document.body.style.overflow = '';
  document.getElementById('mp-thumbnails')?.remove();
}

function cambiarImagenModal(src, thumbEl) {
  const mpImg = document.getElementById('mp-img');
  if (mpImg) { mpImg.src = src; mpImg.style.display = 'block'; }
  document.querySelectorAll('.mp-thumb').forEach(t => t.classList.remove('activa'));
  if (thumbEl) thumbEl.classList.add('activa');
}

// ─── TALLAS ───────────────────────────────────────────
function seleccionarTalla(btn, talla, valor, origen) {
  const card = btn.closest('.producto-card');
  card.querySelectorAll('.talla-btn').forEach(b => b.classList.remove('activa'));
  btn.classList.add('activa');
  const { pvp_usd, pvp_bs } = calcPrecio({ origen, inv_cop: valor, precio_bs: valor });
  card.querySelector('.precio-usd').innerHTML = `<span>$ </span>${fmt(pvp_usd)} <span>USD</span>`;
  card.querySelector('.precio-bs').innerHTML  = `BCV: <strong>Bs ${fmt(pvp_bs, 0)}</strong>`;
  card.dataset.pvpUsd   = pvp_usd;
  card.dataset.tallaSel = talla;
  actualizarBotonCarritoCard(card);
}

function seleccionarTallaModal(btn, talla, valor, origen) {
  document.querySelectorAll('#mp-tallas-btns .talla-btn').forEach(b => b.classList.remove('activa'));
  btn.classList.add('activa');
  const { pvp_usd, pvp_bs } = calcPrecio({ origen, inv_cop: valor, precio_bs: valor });
  document.getElementById('mp-usd').textContent = fmt(pvp_usd);
  document.getElementById('mp-bs').textContent  = 'Bs ' + fmt(pvp_bs, 0);
  mpEstado.pvp_usd = pvp_usd;
  mpEstado.talla   = talla;
  actualizarBotonCarritoModal();
}

// ─── COLORES (selección) ───────────────────────────────
function seleccionarColor(btn, color) {
  const card = btn.closest('.producto-card');
  card.querySelectorAll('.color-btn').forEach(b => b.classList.remove('activa'));
  btn.classList.add('activa');
  card.dataset.colorSel = color;
  actualizarBotonCarritoCard(card);
}

function seleccionarColorModal(btn, color) {
  document.querySelectorAll('#mp-colores-btns .color-btn').forEach(b => b.classList.remove('activa'));
  btn.classList.add('activa');
  mpEstado.color = color;
  actualizarBotonCarritoModal();
}

function parsearTallas(tallaStr, p) {
  if (!tallaStr?.trim()) return [];
  const base = p.origen === 'venezuela' ? (p.precio_bs || 0) : (p.inv_cop || 0);
  return tallaStr.split('|').map(t => {
    const partes = t.trim().split(':');
    return { talla: partes[0].trim(), valor: partes[1] ? parseFloat(partes[1]) : base };
  }).filter(t => t.talla);
}

// ─── COLORES ──────────────────────────────────────────
function parsearColores(colorStr) {
  if (!colorStr?.trim()) return [];
  return colorStr.split('|').map(t => {
    const partes = t.trim().split(':');
    return { color: (partes[0] || '').trim(), hex: (partes[1] || '#cccccc').trim() };
  }).filter(t => t.color);
}

// ─── SELECCIÓN TALLA/COLOR ────────────────────────────
function mensajeSeleccionPendiente(faltaTalla, faltaColor) {
  if (faltaTalla && faltaColor) return 'Elige talla y color';
  if (faltaTalla) return 'Elige una talla';
  if (faltaColor) return 'Elige un color';
  return '🛒 Agregar';
}

function actualizarBotonCarritoCard(card) {
  const necesitaTalla = card.dataset.needTalla === '1';
  const necesitaColor = card.dataset.needColor === '1';
  const tallaSel = card.dataset.tallaSel || '';
  const colorSel = card.dataset.colorSel || '';
  const btnCarr = card.querySelector('.btn-carrito');
  if (!btnCarr) return;

  if ((necesitaTalla && !tallaSel) || (necesitaColor && !colorSel)) {
    btnCarr.disabled = true;
    btnCarr.className = 'btn-carrito btn-talla-pendiente';
    btnCarr.textContent = mensajeSeleccionPendiente(necesitaTalla && !tallaSel, necesitaColor && !colorSel);
    return;
  }

  const nom     = card.dataset.nom;
  const id      = card.dataset.id;
  const cat     = card.dataset.cat;
  const pvp_usd = parseFloat(card.dataset.pvpUsd);
  btnCarr.disabled = false;
  btnCarr.className = 'btn-carrito';
  btnCarr.innerHTML = '🛒 Agregar';
  btnCarr.onclick = () => agregarAlCarrito(nom, pvp_usd.toFixed(2), cat, tallaSel, id, colorSel);
}

function actualizarBotonCarritoModal() {
  const mpBtn = document.getElementById('mp-btn-carrito');
  if (!mpBtn) return;
  const { id, nom, cat, pvp_usd, necesitaTalla, necesitaColor, talla, color } = mpEstado;

  if ((necesitaTalla && !talla) || (necesitaColor && !color)) {
    mpBtn.disabled = true;
    mpBtn.innerHTML = mensajeSeleccionPendiente(necesitaTalla && !talla, necesitaColor && !color);
    mpBtn.onclick = null;
    return;
  }

  mpBtn.disabled = false;
  mpBtn.innerHTML = '🛒 Agregar al carrito';
  mpBtn.onclick = () => { agregarAlCarrito(nom, pvp_usd.toFixed(2), cat, talla, id, color); cerrarProducto(); };
}

function iconoCategoria(cat) {
  return { Perfumes:'🌸', Belleza:'💄', Ropa:'👗', Calzado:'👟', General:'📦' }[cat] || '📦';
}

// ─── FILTROS ──────────────────────────────────────────
function filtrar(cat) {
  categoriaActual = cat;
  generoActual = ''; subtipoActual = '';
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('activa'));
  event.target.classList.add('activa');
  document.querySelectorAll('.subcat-btn').forEach(b => b.classList.remove('activa'));
  const rowGenero = document.getElementById('subcat-genero');
  const rowTipo   = document.getElementById('subcat-tipo');
  rowGenero.classList.toggle('visible', cat === 'Ropa' || cat === 'Perfumes');
  if (cat !== 'Ropa') rowTipo.classList.remove('visible');
  renderProductos(productos);
  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function filtrarGenero(genero, btn) {
  generoActual = genero; subtipoActual = '';
  document.querySelectorAll('#subcat-genero .subcat-btn').forEach(b => b.classList.remove('activa'));
  btn.classList.add('activa');
  document.querySelectorAll('#subcat-tipo .subcat-btn').forEach(b => b.classList.remove('activa'));
  document.getElementById('subcat-tipo').classList.toggle('visible', categoriaActual === 'Ropa');
  renderProductos(productos);
}

function filtrarTipo(tipo, btn) {
  subtipoActual = tipo;
  document.querySelectorAll('#subcat-tipo .subcat-btn').forEach(b => b.classList.remove('activa'));
  btn.classList.add('activa');
  renderProductos(productos);
}

function filtrarBusqueda(val) {
  busqueda = val.toLowerCase().trim();
  renderProductos(productos);
}

function initBusqueda() {
  const input = document.getElementById('busqueda-input');
  if (!input) return;
  let timer;
  input.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => filtrarBusqueda(e.target.value), 250);
  });
}

function actualizarRangoPrecio() {
  const minEl = document.getElementById('precio-min');
  const maxEl = document.getElementById('precio-max');
  if (!minEl || !maxEl) return;
  let min = parseFloat(minEl.value);
  let max = parseFloat(maxEl.value);
  if (min > max) { maxEl.value = min; max = min; }
  precioMin = min;
  precioMax = max >= 500 ? Infinity : max;
  const disp = document.getElementById('precio-display');
  if (disp) disp.textContent = `$${min} – ${max >= 500 ? '+$500' : '$' + max} USD`;
  renderProductos(productos);
}

// ─── CARRITO ──────────────────────────────────────────
function guardarCarrito() {
  localStorage.setItem('cn-carrito', JSON.stringify(carrito));
}

function agregarAlCarrito(nom, pvp_usd, cat, talla, id, color) {
  talla = talla || ''; color = color || '';
  const idx = carrito.findIndex(x => x.nom === nom && (x.talla || '') === talla && (x.color || '') === color);
  if (idx >= 0) carrito[idx].qty++;
  else carrito.push({ id: id || '', nom, pvp_usd: parseFloat(pvp_usd), cat, talla, color, qty: 1 });
  guardarCarrito();
  actualizarCarritoUI();
  const detalle = [talla, color].filter(Boolean).join(' / ');
  mostrarToast('🛒 ' + nom + (detalle ? ' (' + detalle + ')' : '') + ' agregado');
}

function cambiarQty(nom, talla, color, delta) {
  talla = talla || ''; color = color || '';
  const idx = carrito.findIndex(x => x.nom === nom && (x.talla || '') === talla && (x.color || '') === color);
  if (idx < 0) return;
  carrito[idx].qty += delta;
  if (carrito[idx].qty <= 0) carrito.splice(idx, 1);
  guardarCarrito();
  actualizarCarritoUI();
}

function actualizarCarritoUI() {
  const total   = carrito.reduce((a, x) => a + x.pvp_usd * x.qty, 0);
  const totalBs = total * tasas.binance / (1 - FEE_VE / 100);
  const count   = carrito.reduce((a, x) => a + x.qty, 0);

  const badge = document.getElementById('cart-badge');
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }

  const ctUsd = document.getElementById('ct-usd');
  const ctBs  = document.getElementById('ct-bs');
  if (ctUsd) ctUsd.textContent = '$' + fmt(total) + ' USD';
  if (ctBs)  ctBs.textContent  = 'Bs ' + fmt(totalBs, 0);

  const lista = document.getElementById('cart-items');
  if (!lista) return;
  if (carrito.length === 0) {
    lista.innerHTML = '<div class="cart-vacio"><span>🛒</span><p>Tu carrito está vacío</p></div>';
    return;
  }
  lista.innerHTML = carrito.map(item => {
    const ne = item.nom.replace(/'/g, "\\'");
    const te = (item.talla || '').replace(/'/g, "\\'");
    const ce = (item.color || '').replace(/'/g, "\\'");
    const detalle = [item.talla, item.color].filter(Boolean).join(' / ');
    return `<div class="cart-item">
      <div class="ci-info">
        <div class="ci-nom">${item.nom}${detalle ? ' <span class="ci-talla">('+detalle+')</span>' : ''}</div>
        <div class="ci-precio">$${fmt(item.pvp_usd)} c/u</div>
      </div>
      <div class="ci-controles">
        <button class="ci-btn" onclick="cambiarQty('${ne}','${te}','${ce}',-1)">−</button>
        <span class="ci-qty">${item.qty}</span>
        <button class="ci-btn" onclick="cambiarQty('${ne}','${te}','${ce}',1)">+</button>
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
  if (!usuario) {
    toggleCart();
    abrirModalAuth();
    return mostrarToast('Inicia sesión para continuar tu compra');
  }
  toggleCart();
  const modal = document.getElementById('checkout-modal');
  modal.classList.add('abierto');
  modal.style.display = 'flex';
  irPaso(1);
  metodoSeleccionado = ''; resetCaptura();
  modoApartado = false; abonoApartado = 0;
  seleccionarTipoOrden('completo');

  // Pre-rellenar con datos del perfil si el usuario está autenticado
  if (perfilUsuario) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('co-nom',    perfilUsuario.nombre);
    set('co-email',  usuario.email);
    set('co-tel',    perfilUsuario.telefono);
    set('co-cedula', perfilUsuario.cedula);
    set('co-ciudad', perfilUsuario.ciudad);
    set('co-dir',    perfilUsuario.direccion);
  }
}

function cerrarCheckout() {
  const modal = document.getElementById('checkout-modal');
  modal.classList.remove('abierto');
  modal.style.display = 'none';
}

function irPaso(n) {
  [1,2,3,4].forEach(i => {
    document.getElementById('paso-' + i)?.classList.toggle('activo', i === n);
    const dot = document.getElementById('cs' + i);
    if (dot) { dot.classList.toggle('activo', i === n); dot.classList.toggle('listo', i < n); }
    document.getElementById('cl' + i)?.classList.toggle('listo', i < n);
  });
}

function seleccionarMetodo(metodo) {
  metodoSeleccionado = metodo;
  document.querySelectorAll('.metodo-card').forEach(c => c.classList.remove('seleccionado'));
  const id = metodo === 'usdt' ? 'mc-usdt' : 'mc-pm';
  document.getElementById(id)?.classList.add('seleccionado');
  mostrarDatosPago(metodo);
  irPaso(3);
}

function mostrarDatosPago(metodo) {
  const totalCompleto = carrito.reduce((a, x) => a + x.pvp_usd * x.qty, 0);
  const monto   = modoApartado ? abonoApartado : totalCompleto;
  const montoBs = monto * tasas.binance / (1 - FEE_VE / 100);
  const etiq    = modoApartado ? 'Abono' : 'Monto exacto';
  const box     = document.getElementById('datos-pago-box');
  if (!box) return;

  const bannerAp = modoApartado ? `
    <div class="dato-pago-row" style="background:rgba(233,30,99,0.07);border-radius:8px;padding:8px 12px;margin-bottom:6px;">
      <span style="color:#E91E63;font-weight:700;">💰 Pago de Apartado</span>
      <strong style="color:#E91E63;">Saldo: $${fmt(totalCompleto - abonoApartado)} USD en 15 días</strong>
    </div>` : '';

  if (metodo === 'usdt') {
    box.innerHTML = `<div class="datos-pago-card">${bannerAp}
      <div class="dato-pago-row"><span>Red</span><strong>Binance Pay</strong></div>
      <div class="dato-pago-row"><span>ID Binance</span><strong>714385801</strong>
        <button class="copy-btn" onclick="copiar('714385801')">Copiar</button></div>
      <div class="dato-pago-row monto"><span>${etiq}</span><strong>$${fmt(monto)} USDT</strong></div>
    </div>`;
  } else if (metodo === 'pagomovil') {
    box.innerHTML = `<div class="datos-pago-card">${bannerAp}
      <div class="dato-pago-row"><span>Banco</span><strong>Banco de Venezuela (0102)</strong></div>
      <div class="dato-pago-row"><span>Cédula</span><strong>22.290.126</strong>
        <button class="copy-btn" onclick="copiar('22290126')">Copiar</button></div>
      <div class="dato-pago-row"><span>Teléfono</span><strong>0424-323-0841</strong>
        <button class="copy-btn" onclick="copiar('04243230841')">Copiar</button></div>
      <div class="dato-pago-row monto"><span>${etiq} (Bs ${fmt(tasas.binance, 2)}/USDT)</span><strong>Bs ${fmt(montoBs, 0)}</strong></div>
    </div>`;
  }
}

function copiar(texto) {
  navigator.clipboard.writeText(texto).then(() => mostrarToast('Copiado: ' + texto));
}

function resetCaptura() {
  capturaArchivo = null; capturaB64 = '';
  const input = document.getElementById('file-comp');
  if (input) input.value = '';
  const preview = document.getElementById('upload-preview');
  if (preview) preview.innerHTML =
    `<span style="font-size:36px;">📷</span><p>Toca para subir la captura</p><p class="upload-hint">JPG, PNG · Máx. 5MB</p>`;
}

function previewCaptura(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return mostrarToast('La imagen es muy grande (máx. 5MB)');
  capturaArchivo = file;
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
  if (!capturaArchivo && !capturaB64)
    return mostrarToast('Sube la captura del comprobante');

  const total   = carrito.reduce((a, x) => a + x.pvp_usd * x.qty, 0);
  const totalBs = total * tasas.binance / (1 - FEE_VE / 100);
  const prods   = carrito.map(x => {
    const detalle = [x.talla, x.color].filter(Boolean).join(' / ');
    return `${x.nom}${detalle ? ' ['+detalle+']' : ''} x${x.qty}`;
  }).join(', ');
  const abono   = modoApartado ? abonoApartado : total;
  const saldo   = modoApartado ? total - abonoApartado : 0;

  const btn = document.getElementById('btn-enviar');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  try {
    // Subir comprobante a Google Drive (vía GAS)
    let comprobanteUrl = '';
    if (capturaB64) {
      const subida = await fetch(GAS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body:    JSON.stringify({ action: 'subirImagen', imagen: capturaB64, nombre: 'comprobante-' + Date.now() })
      });
      const json = await subida.json();
      comprobanteUrl = json.url || '';
    }

    // Guardar orden en Firestore
    const ordenData = {
      uid: usuario.uid,
      nombre: nom, email, telefono: tel, cedula, ciudad, direccion: dir,
      productos: prods,
      productosDetalle: carrito.map(x => ({ id: x.id||'', nom: x.nom, pvp_usd: x.pvp_usd, qty: x.qty, talla: x.talla||'', color: x.color||'', cat: x.cat })),
      total_usd: fmt(total), total_bs: fmt(totalBs, 0),
      metodo_pago: metodoSeleccionado === 'usdt' ? 'USDT (Binance Pay)' : 'Pago Móvil BDV',
      tipo_orden:  modoApartado ? 'Apartado' : 'Completo',
      abono_usd:   modoApartado ? fmt(abono) : null,
      saldo_usd:   modoApartado ? fmt(saldo) : null,
      estado:      'pendiente',
      comprobanteUrl,
      tasa_bcv:    tasas.bcv, tasa_binance: tasas.binance,
      createdAt:   serverTimestamp()
    };
    const ordenRef = await addDoc(collection(db, 'ordenes'), ordenData);

    // Notificar por Telegram (no bloquea el checkout si falla)
    fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify({
        action:      'notificarPedido',
        num:         ordenRef.id.slice(-6).toUpperCase(),
        tipo_orden:  ordenData.tipo_orden,
        nombre:      ordenData.nombre,
        telefono:    ordenData.telefono,
        ciudad:      ordenData.ciudad,
        direccion:   ordenData.direccion,
        productos:   ordenData.productos,
        total_usd:   ordenData.total_usd,
        abono_usd:   ordenData.abono_usd,
        saldo_usd:   ordenData.saldo_usd,
        metodo_pago: ordenData.metodo_pago,
        comprobanteUrl: ordenData.comprobanteUrl
      })
    }).catch(() => {});

    // Guardar datos de envío en el perfil del usuario
    updateDoc(doc(db, 'usuarios', usuario.uid), {
      nombre: nom, telefono: tel, cedula, ciudad, direccion: dir
    }).catch(() => {});
    perfilUsuario = { ...perfilUsuario, nombre: nom, telefono: tel, cedula, ciudad, direccion: dir };

    // Mostrar confirmación
    const orderNum = ordenRef.id.slice(-6).toUpperCase();
    document.getElementById('ok-num').textContent = (modoApartado ? 'Apartado #AP-' : 'Orden #CN-') + orderNum;
    const msgEl    = document.getElementById('ok-msg');
    const tiempoEl = document.getElementById('ok-tiempo');
    if (modoApartado) {
      if (msgEl)    msgEl.textContent = 'Verificaremos tu abono y te confirmaremos la reserva por WhatsApp. Tienes 15 días para completar el pago restante.';
      if (tiempoEl) tiempoEl.innerHTML = 'Tu producto queda reservado por <strong>15 días corridos</strong>.';
    } else {
      if (msgEl)    msgEl.textContent = 'Verificaremos tu comprobante y recibirás confirmación por WhatsApp.';
      if (tiempoEl) tiempoEl.innerHTML = 'Entrega estimada: <strong>7 días hábiles</strong>';
    }

    carrito = []; guardarCarrito(); actualizarCarritoUI();
    resetCaptura();
    irPaso(4);
  } catch(e) {
    console.error('Error al enviar pedido:', e);
    mostrarToast('Error al enviar. Intenta de nuevo o escríbenos por WhatsApp');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar Pedido →'; }
  }
}

// ─── CHECKOUT: TIPO DE ORDEN ──────────────────────────
function seleccionarTipoOrden(tipo) {
  modoApartado = tipo === 'apartado';
  document.getElementById('to-completo')?.classList.toggle('activo', !modoApartado);
  const cardAp = document.getElementById('to-apartado');
  if (cardAp) { cardAp.classList.toggle('activo', modoApartado); cardAp.classList.toggle('ap', modoApartado); }
  const infoBox = document.getElementById('apartado-info-box');
  if (!infoBox) return;
  if (modoApartado) {
    const total    = carrito.reduce((a, x) => a + x.pvp_usd * x.qty, 0);
    const minAbono = total * 0.5;
    abonoApartado  = minAbono;
    infoBox.style.display = 'flex';
    infoBox.innerHTML = `
      <div class="ai-row ai-abono"><span>💰 Abono mínimo (50%)</span><strong>$${fmt(minAbono)} USD</strong></div>
      <div class="ai-row" style="align-items:center;gap:8px;flex-wrap:wrap;">
        <span>¿Cuánto quieres abonar?</span>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-weight:700;">$</span>
          <input type="number" id="input-abono" min="${minAbono.toFixed(2)}" max="${total.toFixed(2)}" step="0.01"
            value="${minAbono.toFixed(2)}"
            style="width:90px;padding:4px 6px;border:1px solid #F0A500;border-radius:6px;font-size:14px;text-align:right;background:#fff;"
            oninput="actualizarAbono(this)">
          <span style="font-weight:700;">USD</span>
        </div>
      </div>
      <p id="abono-error" style="color:#E91E63;font-size:12px;margin:2px 0;display:none;">El abono debe ser al menos $${fmt(minAbono)} USD</p>
      <div class="ai-row"><span>💳 Saldo restante</span><strong id="saldo-display">$${fmt(minAbono)} USD</strong></div>
      <p class="ai-nota">🚚 El envío sale de inmediato. Pagas el saldo al recibirlo en 7 días hábiles.</p>`;
  } else {
    infoBox.style.display = 'none';
  }
}

function actualizarAbono(input) {
  const total    = carrito.reduce((a, x) => a + x.pvp_usd * x.qty, 0);
  const minAbono = total * 0.5;
  const val      = parseFloat(input.value) || 0;
  const errorEl  = document.getElementById('abono-error');
  const saldoEl  = document.getElementById('saldo-display');
  abonoApartado  = val < minAbono ? minAbono : Math.min(val, total);
  if (errorEl) errorEl.style.display = val < minAbono ? 'block' : 'none';
  if (saldoEl) saldoEl.textContent = '$' + fmt(total - abonoApartado) + ' USD';
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
    star.addEventListener('mouseleave', () => stars.forEach(s => s.classList.remove('hover')));
    star.addEventListener('click', () => {
      estrellasResena = +star.dataset.val;
      stars.forEach(s => s.classList.toggle('activa', +s.dataset.val <= estrellasResena));
    });
  });
}

async function enviarResena() {
  if (!usuario) {
    abrirModalAuth();
    return mostrarToast('Inicia sesión para dejar tu reseña');
  }
  const nombreCuenta = perfilUsuario?.nombre || usuario.displayName || '';
  const ciudad = document.getElementById('rs-ciudad').value.trim();
  const texto  = document.getElementById('rs-texto').value.trim();
  if (!estrellasResena) return mostrarToast('⚠️ Selecciona una calificación');
  if (!texto)           return mostrarToast('⚠️ Escribe tu experiencia');

  const btn = document.getElementById('btn-resena');
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    await addDoc(collection(db, 'resenas'), {
      uid: usuario.uid,
      nombre: nombreCuenta, ciudad, estrellas: estrellasResena, texto,
      aprobada: false,
      createdAt: serverTimestamp()
    });
    btn.style.display = 'none';
    document.getElementById('resena-ok').style.display = 'flex';
  } catch(e) {
    mostrarToast('Error al enviar reseña. Intenta de nuevo.');
    btn.disabled = false; btn.textContent = 'Enviar reseña →';
  }
}

function actualizarUIResenas(user) {
  const btn  = document.getElementById('btn-resena');
  const como = document.getElementById('rs-publicando-como');
  if (!btn || !como) return;
  if (user) {
    const nombreCuenta = perfilUsuario?.nombre || user.displayName || user.email || '';
    como.querySelector('strong').textContent = nombreCuenta;
    como.style.display = 'block';
    btn.textContent = 'Enviar reseña →';
  } else {
    como.style.display = 'none';
    btn.textContent = 'Inicia sesión para reseñar →';
  }
}

// ─── MODAL APARTADO ───────────────────────────────────
function abrirModalApartado() {
  document.getElementById('modal-apartado').classList.add('activo');
  document.body.style.overflow = 'hidden';
}
function cerrarModalApartado() {
  document.getElementById('modal-apartado').classList.remove('activo');
  document.body.style.overflow = '';
}

// ─── TOAST ────────────────────────────────────────────
function mostrarToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 3000);
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

// ─── ANIMACIONES SCROLL ───────────────────────────────
let observerReveal;

function initReveal() {
  observerReveal = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); observerReveal.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => observerReveal.observe(el));
}

// ─── CANVAS PARTÍCULAS ────────────────────────────────
function initParticulas() {
  const canvas = document.getElementById('canvas-particulas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);
  const COLORES = ['rgba(240,165,0,','rgba(37,211,102,','rgba(0,188,212,','rgba(233,30,99,'];
  const pts = Array.from({ length: 70 }, () => ({
    x: Math.random()*canvas.width, y: Math.random()*canvas.height,
    vx:(Math.random()-0.5)*0.5,    vy:(Math.random()-0.5)*0.5,
    r: Math.random()*2+1,          c: COLORES[Math.floor(Math.random()*COLORES.length)]
  }));
  const DIST = 140;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pts.forEach(p => {
      p.x+=p.vx; p.y+=p.vy;
      if (p.x<0||p.x>canvas.width)  p.vx*=-1;
      if (p.y<0||p.y>canvas.height) p.vy*=-1;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = p.c+'0.7)'; ctx.fill();
    });
    for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) {
      const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y;
      const d=Math.sqrt(dx*dx+dy*dy);
      if (d<DIST) {
        ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y);
        ctx.strokeStyle=`rgba(240,165,0,${(1-d/DIST)*0.18})`; ctx.lineWidth=0.8; ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ─── EXPONER FUNCIONES AL DOM ─────────────────────────
Object.assign(window, {
  // Carrito
  toggleCart, abrirCheckout, cerrarCheckout, irPaso,
  cambiarQty, agregarAlCarrito, actualizarCarritoUI,
  // Checkout
  seleccionarMetodo, copiar, previewCaptura, enviarPedido,
  seleccionarTipoOrden, actualizarAbono,
  // Productos
  abrirProducto, cerrarProducto, cambiarImagenModal,
  seleccionarTalla, seleccionarTallaModal,
  seleccionarColor, seleccionarColorModal,
  // Filtros
  filtrar, filtrarGenero, filtrarTipo, filtrarBusqueda, actualizarRangoPrecio,
  // Apartado
  abrirModalApartado, cerrarModalApartado,
  // Auth
  abrirAuth, abrirModalAuth, cerrarModalAuth, cambiarTabAuth,
  loginConEmail, loginConGoogle, registrarUsuario, cerrarSesion,
  toggleWishlist,
  // Mi cuenta
  abrirMiCuenta, cerrarMiCuenta, cambiarTabCuenta, guardarPerfil,
  // Reseñas
  enviarResena,
});
