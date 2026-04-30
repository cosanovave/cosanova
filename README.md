# Cosa Nova Marketplace

## Estructura de archivos

```
marketplace-web/
  index.html          ← Sitio web completo
  css/styles.css      ← Estilos y paleta de colores
  js/app.js           ← Lógica, conexión con Google Sheets
  assets/
    logo_sin_fondo.png  ← Copia aquí tu logo
    products/           ← Aquí van las fotos de productos
  README.md
```

---

## PASO 1 — Publicar Google Sheets

Para que el marketplace lea los productos y tasas automáticamente:

1. Abre tu Google Spreadsheet (el de la Business Suite)
2. Menú → **Archivo → Compartir → Publicar en la web**
3. Selecciona **"Todo el documento"** y formato **"Valores separados por comas (.csv)"**
4. Haz clic en **"Publicar"** → confirma
5. Listo — el Sheet ya es público para lectura

---

## PASO 2 — Copiar el logo

Copia tu archivo `logo_sin_fondo.png` a la carpeta:
```
marketplace-web/assets/logo_sin_fondo.png
```

---

## PASO 3 — Subir a GitHub Pages

### 3a. Crear repositorio en GitHub
1. Ve a github.com → **New repository**
2. Nombre: `cosanova` (o el que prefieras)
3. Público ✅
4. Clic en **Create repository**

### 3b. Subir los archivos
1. En el repositorio → clic en **"uploading an existing file"**
2. Arrastra toda la carpeta `marketplace-web/` 
3. Clic en **Commit changes**

### 3c. Activar GitHub Pages
1. En el repositorio → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** → carpeta: **/ (root)**
4. Clic en **Save**

Tu sitio estará en:
```
https://TU_USUARIO.github.io/cosanova/
```
(Tarda 1-2 minutos en activarse la primera vez)

---

## PASO 4 — Agregar productos con foto

Para cada producto nuevo:

1. **En Business Suite** → agrega el producto normalmente
2. **En la carpeta** `assets/products/` → sube la foto del producto  
   Ejemplo: `dior-sauvage.jpg`
3. **En Google Sheets, hoja Stock** → columna G (imagen) → escribe el nombre del archivo  
   Ejemplo: `dior-sauvage.jpg`
4. **Sube los cambios a GitHub** → el sitio se actualiza solo

### Nombres de imágenes recomendados
- Sin espacios ni acentos
- Solo minúsculas y guiones
- Ejemplos: `dior-sauvage-100ml.jpg`, `labial-mac-rojo.jpg`

---

## Flujo automático de precios

Los precios en USD y bolívares se calculan automáticamente usando:
- **Tasa Binance** del día (actualizada desde Business Suite)
- **Margen**: 30%
- **Fee de pago**: 2%

Cuando actualizas las tasas en la Business Suite → el marketplace muestra precios actualizados automáticamente.

---

## Contacto para pedidos

Todos los botones "Pedir por WhatsApp" abren un mensaje pre-escrito con:
- Nombre del producto
- Precio en USD
- Equivalente en Bs
- Solicitud de información de pago

El cliente solo toca "Enviar" en WhatsApp.
