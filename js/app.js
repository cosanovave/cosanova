document.addEventListener('DOMContentLoaded', () => {
    const btnRopa = document.getElementById('btn-ropa-parent');
    const menuRopa = document.getElementById('menu-ropa');
    const allCategoryBtns = document.querySelectorAll('.cat-btn, .sub-cat-btn');

    // 1. Lógica para abrir/cerrar el menú de Ropa
    btnRopa.addEventListener('click', (e) => {
        e.stopPropagation(); // Evita que se cierre al hacer clic en sí mismo
        menuRopa.classList.toggle('show');
    });

    // Cerrar menú si se hace clic fuera
    document.addEventListener('click', () => {
        menuRopa.classList.remove('show');
    });

    // 2. Lógica de Filtrado de Productos
    allCategoryBtns.forEach(button => {
        button.addEventListener('click', () => {
            const category = button.getAttribute('data-category');
            
            // Si el botón no es el padre de Ropa, filtramos
            if (category) {
                // Actualizar estado visual
                allCategoryBtns.forEach(b => b.classList.remove('active'));
                button.classList.add('active');

                // Ejecutar tu función de renderizado/filtrado
                if (typeof renderizarProductos === 'function') {
                    renderizarProductos(category);
                } else {
                    // Fallback si la función tiene otro nombre
                    console.log("Filtrando por:", category);
                    filterLocalProducts(category);
                }
                
                // Si es un botón de subcategoría, cerramos el menú
                if (button.classList.contains('sub-cat-btn')) {
                    menuRopa.classList.remove('show');
                }
            }
        });
    });
});

// Función de apoyo para filtrar los elementos en el DOM
function filterLocalProducts(category) {
    const items = document.querySelectorAll('.producto-item, .product-card'); 
    items.forEach(item => {
        const itemCat = item.getAttribute('data-categoria'); // Ajusta según tu Excel
        if (category === 'all' || itemCat === category) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}
