document.addEventListener('DOMContentLoaded', () => {
    // Intersección Observer para animaciones al hacer scroll
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-active');
                // Si es la sección de beneficios, animar las barras del gráfico
                if (entry.target.classList.contains('chart-mockup')) {
                    animateChart();
                }
            }
        });
    }, observerOptions);

    // Seleccionar elementos a animar
    document.querySelectorAll('.glass-card, .feature-card, .benefit-text, .section-title').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.8s ease-out';
        observer.observe(el);
    });

    // Función para manejar las animaciones de clase
    function animateActiveElements() {
        document.querySelectorAll('.animate-active').forEach(el => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
    }

    // Ejecutar check inicial
    animateActiveElements();

    // Sobrescribir el observer para aplicar estilos directamente
    const scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.glass-card, .feature-card, .benefit-text, .section-title').forEach(el => {
        scrollObserver.observe(el);
    });

    // Smooth scroll para links de navegación
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // Pequeña interactividad en el hero
    const glassCard = document.querySelector('.hero-visual .glass-card');
    if (glassCard) {
        glassCard.addEventListener('mousemove', (e) => {
            const rect = glassCard.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / 20;
            const rotateY = (centerX - x) / 20;
            
            glassCard.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        });

        glassCard.addEventListener('mouseleave', () => {
            glassCard.style.transform = 'perspective(1000px) rotateX(0) rotateY(0)';
        });
    }
});
