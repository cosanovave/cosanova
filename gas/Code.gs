// ================================================
// COSA NOVA ERP - Suite empresarial v2
// Principal de backend (Google Apps Script)
// ================================================

const SS_ID      = "1Laqj4byH_qPxkR7z7eog-bGkIhm_dt4FxTVE99ArM9Q";
const FOLDER_ID  = "17RXxJz4r4aqzpSBTo6DT0fjV9-e8I1p5";
const TG_TOKEN   = "8638778647:AAGJXkDRzc01QpXTtDyh77H4VSKyma2ox-s";
const TG_CHAT_ID = "8334433363";

function doGet(e) {
  const accion = e && e.parameter && e.parameter.action;
  if (accion === 'tasas') {
    const t = getTasas();
    return ContentService.createTextOutput(JSON.stringify(t)).setMimeType(ContentService.MimeType.JSON);
  }
  if (accion === 'stock') {
    const s = getStock();
    return ContentService.createTextOutput(JSON.stringify(s)).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Cosa Nova ERP')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getTasas() {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Tasas");
  if (!s) return { trm: 4200, bcv: 50, binance: 65, updated: "Sin configurar" };
  const d = s.getDataRange().getValues();
  return {
    trm:         parseFloat(d[0][1]) || 4200,
    bcv:         parseFloat(d[1][1]) || 50,
    binance:     parseFloat(d[2][1]) || 65,
    actualizado: d[3][1] ? Utilities.formatDate(new Date(d[3][1]), "America/Bogota", "dd/MM/yyyy HH:mm") : "-"
  };
}

function saveTasas(t) {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Tasas");
  s.getRange('B1').setValue(parseFloat(t.trm));
  s.getRange('B2').setValue(parseFloat(t.bcv));
  s.getRange('B3').setValue(parseFloat(t.binance));
  s.getRange('B4').setValue(new Date());
  return "OK";
}

function fetchTasasAuto() {
  const resultado = { trm: null, bcv: null };
  try {
    const r1 = UrlFetchApp.fetch('https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde DESC', { muteHttpExceptions: true });
    const d1 = JSON.parse(r1.getContentText());
    if (d1 && d1[0] && d1[0].valor) resultado.trm = parseFloat(d1[0].valor);
  } catch(e) {}
  try {
    const r2 = UrlFetchApp.fetch('https://pydolarve.org/api/v1/dollar?page=bcv', { muteHttpExceptions: true });
    const d2 = JSON.parse(r2.getContentText());
    if (d2 && d2.monitors && d2.monitors.usd) resultado.bcv = parseFloat(d2.monitors.usd.price);
  } catch(e) {}
  return resultado;
}

function getStock() {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Stock");
  const d = s.getDataRange().getValues();
  d.shift();
  return d.filter(r => r[0] !== "").map(r => ({
    nom:         r[0].toString(),
    inv_cop:     parseFloat(r[1]) || 0,
    categoria:   r[2] ? r[2].toString() : "General",
    peso_gr:     parseFloat(r[3]) || 0,
    descripcion: r[4] ? r[4].toString() : "",
    imagen:      r[6] ? r[6].toString() : "",
    genero:      r[7] ? r[7].toString() : "",
    subtipo:     r[8] ? r[8].toString() : "",
    tallas:      r[9] ? r[9].toString() : ""
  }));
}

function saveStock(datos) {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Stock");
  s.appendRow([
    datos.nom,
    datos.inv_cop,
    datos.categoria,
    datos.peso_gr,
    datos.descripcion,
    new Date(),          // col F — fecha
    datos.imagen  || '', // col G
    datos.genero  || '', // col H
    datos.subtipo || '', // col I
    datos.tallas  || ''  // col J  ej: S|M|L|XL  o  S:80000|M:85000
  ]);
  return getStock();
}

function updateInvCop(nombre, nuevoCop) {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Stock");
  const d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (d[i][0].toString() === nombre) {
      s.getRange(i + 1, 2).setValue(parseFloat(nuevoCop));
      return getStock();
    }
  }
  return getStock();
}

function deleteStock(nombre) {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Stock");
  const d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (d[i][0].toString() === nombre) { s.deleteRow(i + 1); break; }
  }
  return getStock();
}

function findCl(doc) {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Clientes");
  const d = s.getDataRange().getValues();
  const f = d.find(r => r[0].toString() === doc.toString());
  return f ? { doc: f[0], nom: f[1], email: f[2] || "", tel: f[3], dir: f[4] || "" } : null;
}

function syncCl(c) {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Clientes");
  const d = s.getDataRange().getValues();
  let fila = -1;
  for (let i = 0; i < d.length; i++) {
    if (d[i][0].toString() === c.doc.toString()) { fila = i + 1; break; }
  }
  const v = [c.doc, c.nom, c.email || "", c.tel, c.dir || ""];
  if (fila !== -1) s.getRange(fila, 1, 1, 5).setValues([v]);
  else s.appendRow(v);
  return "OK";
}

function getOrdenes() {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Ordenes");
  if (!s) return [];
  const d = s.getDataRange().getValues();
  if (d.length <= 1) return [];
  d.shift();
  return d.filter(r => r[0] !== "").map(r => ({
    fecha:     r[0] ? Utilities.formatDate(new Date(r[0]), "America/Bogota", "dd/MM/yyyy") : "",
    num:       r[1],
    doc:       r[2],
    cliente:   r[3],
    tel:       r[4],
    productos: r[5],
    total_usd: r[6],
    total_bs:  r[7],
    estado:    r[8],
    pago:      r[9],
    ciudad:    r[10] ? r[10].toString() : "",
    direccion: r[11] ? r[11].toString() : ""
  }));
}

function saveOrden(o) {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Ordenes");
  s.appendRow([
    new Date(), o.num, o.doc, o.cliente, o.tel,
    o.productos, o.total_usd, o.total_bs, "Recibida", o.pago,
    o.ciudad || '', o.direccion || ''
  ]);
  return "OK";
}

function actualizarEstado(num, estado) {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Ordenes");
  const d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (d[i][1] == num) { s.getRange(i + 1, 9).setValue(estado); return "OK"; }
  }
  return "NO_ENCONTRADO";
}

function updateEstado(num, estado) {
  return actualizarEstado(num, estado);
}

function getNextFactNum() {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Config");
  if (!s) return 1;
  const current   = parseInt(s.getRange('B1').getValue()) || 0;
  const siguiente = current + 1;
  s.getRange('B1').setValue(siguiente);
  return siguiente;
}

function upPDF(b64, nombre) {
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/pdf', nombre);
  const f    = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { success: true, url: f.getUrl() };
}

function notificarTelegram(mensaje) {
  try {
    const url = 'https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage';
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: TG_CHAT_ID, text: mensaje }),
      muteHttpExceptions: true
    });
    Logger.log(resp.getContentText());
  } catch(e) {
    Logger.log('Error Telegram: ' + e.message);
  }
}

function testTelegram() {
  notificarTelegram('✅ Prueba de conexión Cosa Nova funcionando');
}

// ================================================
// APARTADOS
// ================================================

function getApartados() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let s = ss.getSheetByName("Apartados");
  if (!s) return [];
  const d = s.getDataRange().getValues();
  if (d.length <= 1) return [];
  d.shift();
  return d.filter(r => r[0] !== "").map(r => ({
    fecha:           r[0] ? Utilities.formatDate(new Date(r[0]), "America/Bogota", "dd/MM/yyyy") : "",
    num:             r[1],
    cedula:          r[2],
    cliente:         r[3],
    tel:             r[4],
    productos:       r[5],
    total_usd:       r[6],
    abono_usd:       r[7],
    saldo_usd:       r[8],
    metodo_pago:     r[9],
    fecha_limite:    r[10] ? Utilities.formatDate(new Date(r[10]), "America/Bogota", "dd/MM/yyyy") : "",
    fecha_limite_iso:r[10] ? new Date(r[10]).toISOString() : "",
    estado:          r[11] || "Activo",
    captura_url:     r[12] || "",
    ciudad:          r[13] ? r[13].toString() : "",
    direccion:       r[14] ? r[14].toString() : ""
  }));
}

function saveApartado(a) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let s = ss.getSheetByName("Apartados");
  if (!s) {
    s = ss.insertSheet("Apartados");
    s.appendRow(['Fecha', 'N°', 'Cédula', 'Cliente', 'Teléfono', 'Productos',
                 'Total USD', 'Abono USD', 'Saldo USD', 'Método', 'Fecha Límite', 'Estado', 'Comprobante', 'Ciudad', 'Dirección']);
    s.getRange(1, 1, 1, 15).setFontWeight('bold').setBackground('#0D2137').setFontColor('#F0A500');
  }
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() + 15);
  s.appendRow([
    new Date(), a.num, a.cedula, a.cliente, a.tel,
    a.productos, a.total_usd, a.abono_usd, a.saldo_usd,
    a.metodo_pago, fechaLimite, "Activo", a.captura_url || "",
    a.ciudad || '', a.direccion || ''
  ]);
  return "OK";
}

function crearHojaApartados() {
  const ss = SpreadsheetApp.openById(SS_ID);
  if (ss.getSheetByName("Apartados")) {
    Logger.log("La hoja Apartados ya existe.");
    return;
  }
  const s = ss.insertSheet("Apartados");
  s.appendRow(['Fecha', 'N°', 'Cédula', 'Cliente', 'Teléfono', 'Productos',
               'Total USD', 'Abono USD', 'Saldo USD', 'Método', 'Fecha Límite', 'Estado', 'Comprobante']);
  s.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#0D2137').setFontColor('#F0A500');
  s.setColumnWidth(1, 110);
  s.setColumnWidth(6, 200);
  s.setColumnWidth(13, 200);
  Logger.log("Hoja Apartados creada correctamente.");
}

function actualizarEstadoApartado(num, estado) {
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName("Apartados");
  if (!s) return "NO_HOJA";
  const d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (d[i][1] == num) { s.getRange(i + 1, 12).setValue(estado); return "OK"; }
  }
  return "NO_ENCONTRADO";
}

// ================================================
// EMPRESA — Socios, Gastos, Ingresos Novatech
// ================================================

function getSocios() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const s  = ss.getSheetByName("Socios");
  if (!s) return [];
  const d = s.getDataRange().getValues();
  if (d.length <= 1) return [];
  d.shift();
  return d.filter(r => r[0] !== "").map(r => ({
    fecha:       r[0] ? Utilities.formatDate(new Date(r[0]), "America/Bogota", "dd/MM/yyyy") : "",
    socio:       r[1] ? r[1].toString() : "",
    entidad:     r[2] ? r[2].toString() : "",
    monto_usd:   parseFloat(r[3]) || 0,
    descripcion: r[4] ? r[4].toString() : ""
  }));
}

function saveSocio(d) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let s = ss.getSheetByName("Socios");
  if (!s) {
    s = ss.insertSheet("Socios");
    s.appendRow(['Fecha', 'Socio', 'Entidad', 'Monto USD', 'Descripción']);
    s.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#0D2137').setFontColor('#F0A500');
    s.setColumnWidth(1, 110); s.setColumnWidth(2, 150); s.setColumnWidth(3, 120);
    s.setColumnWidth(4, 100); s.setColumnWidth(5, 260);
  }
  s.appendRow([new Date(), d.socio, d.entidad, d.monto_usd, d.descripcion || '']);
  return getSocios();
}

function getGastosEmpresa() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const s  = ss.getSheetByName("Gastos");
  if (!s) return [];
  const d = s.getDataRange().getValues();
  if (d.length <= 1) return [];
  d.shift();
  return d.filter(r => r[0] !== "").map(r => ({
    fecha:       r[0] ? Utilities.formatDate(new Date(r[0]), "America/Bogota", "dd/MM/yyyy") : "",
    descripcion: r[1] ? r[1].toString() : "",
    monto_usd:   parseFloat(r[2]) || 0,
    filial:      r[3] ? r[3].toString() : "",
    categoria:   r[4] ? r[4].toString() : ""
  }));
}

function saveGastoEmpresa(d) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let s = ss.getSheetByName("Gastos");
  if (!s) {
    s = ss.insertSheet("Gastos");
    s.appendRow(['Fecha', 'Descripción', 'Monto USD', 'Filial', 'Categoría']);
    s.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#0D2137').setFontColor('#F0A500');
    s.setColumnWidth(1, 110); s.setColumnWidth(2, 260); s.setColumnWidth(3, 100);
    s.setColumnWidth(4, 130); s.setColumnWidth(5, 130);
  }
  s.appendRow([new Date(), d.descripcion, d.monto_usd, d.filial, d.categoria]);
  return getGastosEmpresa();
}

function getComprasInv() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const s  = ss.getSheetByName("Compras_Inv");
  if (!s) return [];
  const d = s.getDataRange().getValues();
  if (d.length <= 1) return [];
  d.shift();
  return d.filter(r => r[0] !== "").map(r => ({
    fecha:        r[0] ? Utilities.formatDate(new Date(r[0]), "America/Bogota", "dd/MM/yyyy") : "",
    producto:     r[1] ? r[1].toString() : "",
    costo_cop:    parseFloat(r[2]) || 0,
    costo_usd:    parseFloat(r[3]) || 0,
    adelanto_usd: parseFloat(r[4]) || 0,
    neto_usd:     parseFloat(r[5]) || 0,
    pvp_min_usd:  parseFloat(r[6]) || 0,
    cliente:      r[7] ? r[7].toString() : "",
    filial:       r[8] ? r[8].toString() : "",
    estado:       r[9] ? r[9].toString() : "Pendiente"
  }));
}

function saveCompraInv(d) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let s = ss.getSheetByName("Compras_Inv");
  if (!s) {
    s = ss.insertSheet("Compras_Inv");
    s.appendRow(['Fecha', 'Producto', 'Costo COP', 'Costo USD', 'Adelanto USD', 'Neto USD', 'PVP Mín USD', 'Cliente', 'Filial', 'Estado']);
    s.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#0D2137').setFontColor('#F0A500');
    s.setColumnWidth(1, 110); s.setColumnWidth(2, 200); s.setColumnWidth(3, 110);
    s.setColumnWidth(4, 100); s.setColumnWidth(5, 110); s.setColumnWidth(6, 100);
    s.setColumnWidth(7, 110); s.setColumnWidth(8, 150); s.setColumnWidth(9, 120);
    s.setColumnWidth(10, 110);
  }
  s.appendRow([
    new Date(), d.producto,
    d.costo_cop, d.costo_usd,
    d.adelanto_usd, d.neto_usd, d.pvp_min_usd,
    d.cliente || '', d.filial, d.estado
  ]);
  return getComprasInv();
}

function getIngresosNT() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const s  = ss.getSheetByName("Ingresos_NT");
  if (!s) return [];
  const d = s.getDataRange().getValues();
  if (d.length <= 1) return [];
  d.shift();
  return d.filter(r => r[0] !== "").map(r => ({
    fecha:       r[0] ? Utilities.formatDate(new Date(r[0]), "America/Bogota", "dd/MM/yyyy") : "",
    descripcion: r[1] ? r[1].toString() : "",
    monto_usd:   parseFloat(r[2]) || 0,
    servicio:    r[3] ? r[3].toString() : ""
  }));
}

function saveIngresoNT(d) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let s = ss.getSheetByName("Ingresos_NT");
  if (!s) {
    s = ss.insertSheet("Ingresos_NT");
    s.appendRow(['Fecha', 'Descripción', 'Monto USD', 'Servicio']);
    s.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#4a0072').setFontColor('#e1bee7');
    s.setColumnWidth(1, 110); s.setColumnWidth(2, 260);
    s.setColumnWidth(3, 100); s.setColumnWidth(4, 160);
  }
  s.appendRow([new Date(), d.descripcion, d.monto_usd, d.servicio || '']);
  return "OK";
}

function getResumenFinanciero() {
  const socios    = getSocios();
  const gastos    = getGastosEmpresa();
  const compras   = getComprasInv();
  const ingNT     = getIngresosNT();
  const ordenes   = getOrdenes();
  const apartados = getApartados();

  const inv_cn = socios.filter(r => r.entidad === 'Cosa Nova')
                        .reduce((s, r) => s + r.monto_usd, 0);
  const inv_nt = socios.filter(r => r.entidad === 'Novatech')
                        .reduce((s, r) => s + r.monto_usd, 0);

  const gastos_cn = gastos.filter(r => r.filial === 'Cosa Nova')
                           .reduce((s, r) => s + r.monto_usd, 0);
  const gastos_nt = gastos.filter(r => r.filial === 'Novatech')
                           .reduce((s, r) => s + r.monto_usd, 0);

  const compras_neto_cn = compras.filter(r => r.filial === 'Cosa Nova')
                                  .reduce((s, r) => s + r.neto_usd, 0);
  const compras_neto_nt = compras.filter(r => r.filial === 'Novatech')
                                  .reduce((s, r) => s + r.neto_usd, 0);

  // Ventas realizadas: órdenes entregadas + apartados completados
  const ventas_ordenes   = ordenes.filter(r => r.estado === 'Entregada')
                                   .reduce((s, r) => s + (parseFloat(r.total_usd) || 0), 0);
  const ventas_apartados = apartados.filter(r => r.estado === 'Completado')
                                     .reduce((s, r) => s + (parseFloat(r.total_usd) || 0), 0);
  const ventas_cn = ventas_ordenes + ventas_apartados;

  // En proceso: órdenes activas + abonos de apartados activos
  const en_proceso_ordenes   = ordenes.filter(r => r.estado !== 'Cancelada' && r.estado !== 'Entregada')
                                       .reduce((s, r) => s + (parseFloat(r.total_usd) || 0), 0);
  const en_proceso_apartados = apartados.filter(r => r.estado === 'Activo')
                                         .reduce((s, r) => s + (parseFloat(r.abono_usd) || 0), 0);
  const en_proceso_cn = en_proceso_ordenes + en_proceso_apartados;

  const ingresos_nt = ingNT.reduce((s, r) => s + r.monto_usd, 0);

  return {
    cosa_nova: {
      inversion:   inv_cn,
      ventas:      ventas_cn,
      en_proceso:  en_proceso_cn,
      gastos:      gastos_cn,
      compras_neto: compras_neto_cn,
      neto:        inv_cn + ventas_cn - gastos_cn - compras_neto_cn
    },
    novatech: {
      inversion:          inv_nt,
      ingresos_servicios: ingresos_nt,
      gastos:             gastos_nt,
      compras_neto:       compras_neto_nt,
      prestamos_de_cn:    0,
      neto:               inv_nt + ingresos_nt - gastos_nt - compras_neto_nt
    }
  };
}

// ================================================
// RECEPCIÓN DE PEDIDOS DESDE EL MARKETPLACE
// ================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // ── RESEÑAS ──────────────────────────────────
    if (data.action === 'resena') {
      const hoja = SpreadsheetApp.openById(SS_ID).getSheetByName('Reseñas')
                || SpreadsheetApp.openById(SS_ID).insertSheet('Reseñas');
      if (hoja.getLastRow() === 0) {
        hoja.appendRow(['Fecha', 'Nombre', 'Ciudad', 'Estrellas', 'Reseña']);
      }
      hoja.appendRow([new Date(), data.nom || '', data.ciudad || '', data.estrellas || 0, data.texto || '']);
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── SUBIR IMAGEN A DRIVE (comprobantes / productos del marketplace Firebase) ──
    if (data.action === 'subirImagen') {
      const base64  = (data.imagen || '').split(',').pop();
      const nombre  = (data.nombre || ('img-' + Date.now())) + '.jpg';
      const blob    = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', nombre);
      const archivo = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
      archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const url = 'https://drive.google.com/thumbnail?id=' + archivo.getId() + '&sz=w1000';
      return ContentService.createTextOutput(JSON.stringify({ ok: true, url: url }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── NOTIFICAR PEDIDO POR TELEGRAM (marketplace Firebase) ──
    if (data.action === 'notificarPedido') {
      const esApartadoFb = (data.tipo_orden === 'Apartado');
      const numStrFb = (esApartadoFb ? 'AP-' : 'CN-') + (data.num || '');
      if (esApartadoFb) {
        notificarTelegram(
          '💰 *NUEVO APARTADO ' + numStrFb + '*\n' +
          '👤 ' + (data.nombre    || 'Sin nombre')   + '\n' +
          '📞 ' + (data.telefono  || 'Sin teléfono') + '\n' +
          '📍 ' + (data.ciudad    || '') + (data.direccion ? ' — ' + data.direccion : '') + '\n' +
          '📦 ' + (data.productos || 'Sin detalle')  + '\n' +
          '💵 Total: $'  + (data.total_usd || '0') + ' USD\n' +
          '✅ Abono: $'  + (data.abono_usd || '0') + ' USD\n' +
          '⏳ Saldo: $'  + (data.saldo_usd || '0') + ' USD\n' +
          '💳 ' + (data.metodo_pago || 'Sin método') + '\n' +
          (data.comprobanteUrl ? '🧾 ' + data.comprobanteUrl : '')
        );
      } else {
        notificarTelegram(
          '🛒 *Nuevo pedido ' + numStrFb + '*\n' +
          '👤 ' + (data.nombre     || 'Sin nombre')   + '\n' +
          '📞 ' + (data.telefono   || 'Sin teléfono') + '\n' +
          '📍 ' + (data.ciudad     || '') + (data.direccion ? ' — ' + data.direccion : '') + '\n' +
          '📦 ' + (data.productos  || 'Sin detalle')  + '\n' +
          '💵 $' + (data.total_usd || '0') + ' USD\n' +
          '💳 ' + (data.metodo_pago || 'Sin método')  + '\n' +
          (data.comprobanteUrl ? '🧾 ' + data.comprobanteUrl : '')
        );
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── PEDIDOS ──────────────────────────────────
    const num = getNextFactNum();

    let capturaUrl = '';
    if (data.captura) {
      const base64  = data.captura.split(',').pop();
      const blob    = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', 'comprobante-CN-' + num + '.jpg');
      const archivo = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
      archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      capturaUrl    = archivo.getUrl();
    }

    const esApartado = (data.tipo_orden === 'Apartado');

    if (esApartado) {
      // ── GUARDAR EN HOJA APARTADOS ────────────────
      saveApartado({
        num:        num,
        cedula:     data.cedula     || data.telefono || '',
        cliente:    data.nombre     || '',
        tel:        data.telefono   || '',
        productos:  data.productos  || '',
        total_usd:  data.total_usd  || '',
        abono_usd:  data.abono_usd  || '',
        saldo_usd:  data.saldo_usd  || '',
        metodo_pago:(data.metodo_pago || ''),
        captura_url: capturaUrl,
        ciudad:     data.ciudad     || '',
        direccion:  data.direccion  || ''
      });

      // ── TELEGRAM: APARTADO ───────────────────────
      const numStr = 'AP-' + String(num).padStart(4, '0');
      notificarTelegram(
        '💰 *NUEVO APARTADO ' + numStr + '*\n' +
        '👤 ' + (data.nombre    || 'Sin nombre')   + '\n' +
        '🪪 '  + (data.cedula   || 'Sin cédula')   + '\n' +
        '📞 ' + (data.telefono  || 'Sin teléfono') + '\n' +
        '📍 ' + (data.ciudad    || '') + (data.direccion ? ' — ' + data.direccion : '') + '\n' +
        '📦 ' + (data.productos || 'Sin detalle')  + '\n' +
        '💵 Total: $'  + (data.total_usd || '0') + ' USD\n' +
        '✅ Abono: $'  + (data.abono_usd || '0') + ' USD\n' +
        '⏳ Saldo: $'  + (data.saldo_usd || '0') + ' USD\n' +
        '💳 ' + (data.metodo_pago || 'Sin método') + '\n' +
        (capturaUrl ? '🧾 ' + capturaUrl : '')
      );
    } else {
      // ── GUARDAR EN HOJA ORDENES ──────────────────
      saveOrden({
        num:       num,
        doc:       data.cedula    || data.telefono || '',
        cliente:   data.nombre    || '',
        tel:       data.telefono  || '',
        productos: data.productos || '',
        total_usd: data.total_usd || '',
        total_bs:  data.total_bs  || '',
        pago:      (data.metodo_pago || '') + (capturaUrl ? ' | ' + capturaUrl : ''),
        ciudad:    data.ciudad    || '',
        direccion: data.direccion || ''
      });

      // ── TELEGRAM: PEDIDO NORMAL ──────────────────
      const numStr = 'CN-' + String(num).padStart(4, '0');
      notificarTelegram(
        '🛒 *Nuevo pedido ' + numStr + '*\n' +
        '👤 ' + (data.nombre     || 'Sin nombre')   + '\n' +
        '🪪 '  + (data.cedula    || 'Sin cédula')   + '\n' +
        '📞 ' + (data.telefono   || 'Sin teléfono') + '\n' +
        '📍 ' + (data.ciudad     || '') + (data.direccion ? ' — ' + data.direccion : '') + '\n' +
        '📦 ' + (data.productos  || 'Sin detalle')  + '\n' +
        '💵 $' + (data.total_usd || '0') + ' USD\n' +
        '💳 ' + (data.metodo_pago || 'Sin método')  + '\n' +
        (capturaUrl ? '🧾 ' + capturaUrl : '')
      );
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, num: num })).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}
