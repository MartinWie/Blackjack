if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            /* http on a LAN address, or a browser that says no — the app still runs. */
        });
    });
}
