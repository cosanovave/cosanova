document.addEventListener('DOMContentLoaded', () => {
    const btnRopa = document.getElementById('btn-ropa-parent');
    const menuRopa = document.getElementById('menu-ropa');
    const allBtns = document.querySelectorAll('.cat-btn, .sub-cat-btn');

    // 1. Abrir/Cerrar menú de Ropa al hacer clic
    if (btnRopa) {
        btnRopa.addEventListener('click', (e) => {
            e.stopPropagation();
            menuRopa.classList.toggle('show');
        });
    }

    // Cerrar si se hace clic en cualquier otro lado
    document.addEventListener('click', () => {
        menuRopa.classList.remove('show');
    });

    // 2. Lógica de Filtrado
    allBtns.forEach(button => {
        button.addEventListener('click', () => {
            const category = button.getAttribute('data-category');
            
            // Si el botón tiene una categoría (no es el padre 'Ropa')
            if (category) {
                // Cambiar estado visual del botón activo
                allBtns.forEach(b => b.classList.remove('active'));
                button.classList.add('active');

                // Filtrar productos
                filtrarProductosPorCategoria(category);

                // Si es subcategoría, cerramos el menú
                if (button.classList.contains('sub-cat-btn')) {
                    menuRopa.classList.remove('show');
                }
            }
        });
    });
});

/**
 * Función que oculta o muestra productos según la categoría seleccionada.
 * Busca elementos que tengan la clase .producto-item o .product-card
 */
function filtrarProductosPorCategoria(cat) {
    const items = document.querySelectorAll('.producto-item, .product-card');
    
    items.forEach(item => {
        // Obtenemos la categoría que viene de tu Google Sheets (data-categoria)
        const itemCat = item.getAttribute('data-categoria') || item.getAttribute('data-product-category');
        
        if (cat === 'all' || itemCat === cat) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}
