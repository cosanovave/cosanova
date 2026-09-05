// ════════════════════════════════════════════════════════════
//  AGREGAR EN UiFactura.html — pegar AL FINAL del <script> existente
//  (después de la función validar(), antes del </script>)
// ════════════════════════════════════════════════════════════

  // ── Cargar orden del marketplace en el formulario ────────
  window.facturarOrden = function(num) {
    const o = (window._ordenesData || []).find(function(x) { return x.num == num; });
    if (!o) return alert('Orden no encontrada. Recarga las órdenes e intenta de nuevo.');

    // 1. Navegar a la pestaña Factura
    cambiarSeccion('factura');

    // 2. Llenar datos del cliente
    document.getElementById('f_d').value   = o.doc     || '';
    document.getElementById('f_n').value   = o.cliente || '';
    document.getElementById('f_t').value   = o.tel     || '';
    document.getElementById('f_dir').value = '';
    document.getElementById('f_a').value   = '0';

    // 3. Buscar dirección guardada en Clientes (asíncrono)
    if (o.doc) {
      google.script.run.withSuccessHandler(function(cl) {
        if (cl && cl.dir) document.getElementById('f_dir').value = cl.dir;
      }).findCl(o.doc);
    }

    // 4. Método de pago
    var metStr = ((o.pago || '').split(' | ')[0]).toLowerCase();
    var metSel = document.getElementById('f_met');
    if (metSel) {
      if      (metStr.indexOf('usdt') >= 0 || metStr.indexOf('binance') >= 0) metSel.value = 'USDT';
      else if (metStr.indexOf('zelle') >= 0)                                  metSel.value = 'Zelle';
      else if (metStr.indexOf('bolívar') >= 0 || metStr.indexOf('movil') >= 0
            || metStr.indexOf('móvil')  >= 0 || metStr.indexOf('bdv') >= 0)  metSel.value = 'Bolívares';
    }

    // 5. Parsear productos y distribuir total_usd exactamente
    var totalUsd = parseFloat(o.total_usd) || 0;
    var partes   = (o.productos || '').split(',')
      .map(function(p) {
        var m = p.trim().match(/^(.+?)\s+x(\d+)$/i);
        return { desc: m ? m[1].trim() : p.trim(), q: m ? parseInt(m[2]) : 1 };
      })
      .filter(function(p) { return p.desc !== ''; });

    if (partes.length === 0) {
      // Si no hay productos parseables, agregar el total como un solo ítem
      partes = [{ desc: o.productos || 'Orden CN-' + String(o.num).padStart(4,'0'), q: 1 }];
    }

    var totalQty = partes.reduce(function(s, p) { return s + p.q; }, 0) || 1;
    var acum = 0;

    itemsFactura = partes.map(function(p, i) {
      var itemTotal;
      if (i === partes.length - 1) {
        // Último ítem: asignar el resto para cuadrar exactamente
        itemTotal = Math.round((totalUsd - acum) * 100) / 100;
      } else {
        itemTotal = Math.round((totalUsd * p.q / totalQty) * 100) / 100;
        acum += itemTotal;
      }
      var pu = p.q > 0 ? Math.round(itemTotal / p.q * 100) / 100 : 0;
      return { desc: p.desc, q: p.q, pu: pu, total: itemTotal };
    });

    // 6. Limpiar campos del selector de producto
    document.getElementById('f_p').value = '';
    document.getElementById('f_q').value = '1';

    // 7. Renderizar lista y recalcular totales
    renderListaItems();
    totales();
  };
