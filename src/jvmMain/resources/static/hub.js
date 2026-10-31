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

// Direct links. On the live site a game with its own subdomain links there
// (meow.7mw.de); elsewhere, and for games without one, the launcher path is the link.
(function () {
    const toast = document.querySelector('.share-toast');
    let hide = null;

    function linkFor(button) {
        const sub = button.dataset.subdomain;
        const labels = location.hostname.split('.');
        if (sub && labels.length >= 3) return `${location.protocol}//${sub}.${labels.slice(1).join('.')}`;
        return location.origin + button.dataset.path;
    }

    function say(text) {
        toast.textContent = text;
        toast.style.opacity = '1';
        clearTimeout(hide);
        hide = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
    }

    document.querySelectorAll('.share-link').forEach((button) => {
        button.addEventListener('click', async () => {
            const url = linkFor(button);
            // Phones get the share sheet; anything else copies.
            if (navigator.share && matchMedia('(pointer: coarse)').matches) {
                try { await navigator.share({url}); return; } catch (_) { /* closed, or refused: copy instead */ }
            }
            try {
                await navigator.clipboard.writeText(url);
                say(`Link copied: ${url.replace(/^https?:\/\//, '')}`);
            } catch (_) {
                say(url.replace(/^https?:\/\//, ''));
            }
        });
    });
})();

