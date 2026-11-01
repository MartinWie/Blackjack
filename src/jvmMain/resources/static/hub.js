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

// Direct links. On the live site each game links to its own subdomain (meow.7mw.de);
// elsewhere (localhost) the launcher path is the link.
(function () {
    const toast = document.querySelector('.share-toast');
    let hide = null;

    function linkFor(button) {
        const sub = button.dataset.subdomain;
        const host = location.hostname;
        const labels = host.split('.');
        // A LAN address (the phone-testing setup) has no subdomains: use the path.
        const named = labels.length >= 3 && !/^[\d.]+$/.test(host) && !host.includes(':');
        if (sub && named) return `${location.protocol}//${sub}.${labels.slice(1).join('.')}${location.port ? `:${location.port}` : ''}`;
        return location.origin + button.dataset.path;
    }

    function say(text) {
        toast.textContent = text;
        toast.style.opacity = '1';
        clearTimeout(hide);
        hide = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
    }

    // Each game installs from its own origin, so its install button opens it there.
    document.querySelectorAll('.install-link').forEach((link) => {
        link.href = `${linkFor(link)}#install`;
    });

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

