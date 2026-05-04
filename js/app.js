document.addEventListener('DOMContentLoaded', () => {
    const btnRopa = document.getElementById('btn-ropa-parent');
    const menuRopa = document.getElementById('menu-ropa');
    const todosLosBotones = document.querySelectorAll('.cat-btn, .sub-cat-btn');

    // 1. Control del Menú Desplegable (Clic)
    if (btnRopa) {
        btnRopa.addEventListener('click', (e) => {
            e.stopPropagation();
            menuRopa.classList.toggle('show');
        });
    }

    // Cerrar menú si el usuario hace clic en cualquier otra parte de la pantalla
    document.addEventListener('click', () => {
        if (menuRopa) menuRopa.classList.remove('show');
    });

    // 2. Lógica de Filtrado
    todosLosBotones.forEach(boton => {
        boton.addEventListener('click', () => {
            const categoriaSeleccionada = boton.getAttribute('data-category');

            // Solo filtramos si el botón tiene una categoría definida (evita filtrar al pulsar el padre 'Ropa')
            if (categoriaSeleccionada) {
                // Actualizar estilo visual 'active'
                todosLosBotones.forEach(b => b.classList.remove('active'));
                boton.classList.add('active');

                // Llamada a la función de filtrado
                ejecutarFiltrado(categoriaSeleccionada);

                // Cerrar menú si se eligió una subcategoría (Dama/Caballero)
                if (boton.classList.contains('sub-cat-btn')) {
                    menuRopa.classList.remove('show');
                }
            }
        });
    });
});

/**
 * Función que conecta con los productos en pantalla.
 * Asegúrate de que tus productos en el HTML tengan el atributo 'data-categoria'
 */
function ejecutarFiltrado(categoria) {
    const productos = document.querySelectorAll('.product-card, .producto-item');
    
    productos.forEach(producto => {
        const catProducto = producto.getAttribute('data-categoria') || producto.getAttribute('data-product-category');

        if (categoria === 'all' || catProducto === categoria) {
            producto.style.display = 'block';
        } else {
            producto.style.display = 'none';
        }
    });
}
