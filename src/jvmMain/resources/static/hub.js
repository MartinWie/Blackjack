// Online-only games are dimmed while there is no network, instead of opening onto
// the offline page.
(function () {
    const cards = document.querySelectorAll('[data-online-only]');
    function update() {
        cards.forEach((card) => {
            const off = !navigator.onLine;
            card.setAttribute('aria-disabled', String(off));
            card.querySelector('.status').textContent = off ? 'Needs signal' : 'Online';
        });
    }
    // pointer-events-none stops taps only; this stops Enter too.
    cards.forEach((card) => card.addEventListener('click', (e) => {
        if (card.getAttribute('aria-disabled') === 'true') e.preventDefault();
    }));
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
})();
