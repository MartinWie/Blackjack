(function () {
    const $ = (id) => document.getElementById(id);
    const cashEl = $('cash');
    const errorEl = $('error');

    function paintCash() {
        cashEl.textContent = '$' + window.Bank.cash;
    }

    function fail(message) {
        errorEl.textContent = message;
        window.anime.animate(errorEl, {opacity: [0, 1], translateY: [-4, 0], duration: 240});
    }

    async function saveName() {
        const name = $('name').value.trim();
        if (!name) return;
        // Locally first: a solo table reads it from here, with or without a network.
        window.Bank.rememberName(name);
        await fetch('/api/name', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name}),
        });
    }

    async function enter(code) {
        window.Bank.rememberName($('name').value);
        const res = await fetch('/api/rooms/' + code + '/join', {method: 'POST'});
        if (!res.ok) {
            const body = await res.json().catch(() => ({error: 'could not join'}));
            fail(body.error);
            return;
        }
        location.href = '/t/' + code;
    }

    async function createTable() {
        await saveName();
        const res = await fetch('/api/rooms', {method: 'POST'});
        if (!res.ok) {
            fail('no free tables right now');
            return;
        }
        const {code} = await res.json();
        await enter(code);
    }

    // Solo is a plain link to a page that plays itself — no request, so it works
    // with the radio off. Only shared tables need the server.
    $('solo').addEventListener('click', () => window.Bank.rememberName($('name').value));
    $('create').addEventListener('click', createTable);

    $('join').addEventListener('click', async () => {
        const code = $('code').value.trim().toUpperCase();
        if (code.length !== 4) return fail('a table code is four characters');
        await saveName();
        await enter(code);
    });

    $('reset').addEventListener('click', () => {
        window.Bank.reset();
        paintCash();
        window.anime.animate(cashEl, {scale: [1, 1.25, 1], duration: 420, ease: 'out(3)'});
    });

    $('name').addEventListener('change', () => window.Bank.rememberName($('name').value));

    // Offline, only the solo table can be reached — say so instead of failing on tap.
    function paintConnectivity() {
        const offline = !navigator.onLine;
        ['create', 'join', 'code'].forEach((id) => {
            $(id).disabled = offline;
            $(id).classList.toggle('opacity-40', offline);
        });
        if (offline) errorEl.textContent = 'No signal — solo play still works';
        else if (errorEl.textContent.startsWith('No signal')) errorEl.textContent = '';
    }

    window.addEventListener('online', paintConnectivity);
    window.addEventListener('offline', paintConnectivity);
    paintConnectivity();

    window.Bank.pruneLedgers(null);
    paintCash();
    window.anime.animate('h1', {opacity: [0, 1], translateY: [12, 0], duration: 520, ease: 'out(3)'});
})();
