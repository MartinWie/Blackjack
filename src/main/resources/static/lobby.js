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
        await fetch('/api/name', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name}),
        });
    }

    async function enter(code) {
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

    $('solo').addEventListener('click', createTable);
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

    window.Bank.pruneLedgers(null);
    paintCash();
    window.anime.animate('h1', {opacity: [0, 1], translateY: [12, 0], duration: 520, ease: 'out(3)'});
})();
