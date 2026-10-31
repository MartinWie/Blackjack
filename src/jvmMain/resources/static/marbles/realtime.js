window.realtimeShared = (function() {
    function wsUrl(path) {
        var proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        return proto + window.location.host + path;
    }

    function closeWebSocket(ws) {
        if (!ws) return null;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
            ws.close();
        } catch (_) {}
        return null;
    }

    function scheduleReconnect(state, connect) {
        if (!state.reconnectTimeout) {
            var delay = state.reconnectDelayMs;
            var jitter = Math.floor(Math.random() * 250);
            var waitMs = delay + jitter;
            state.reconnectTimeout = setTimeout(function() {
                state.reconnectTimeout = null;
                connect();
            }, waitMs);
            state.reconnectDelayMs = Math.min(30000, state.reconnectDelayMs * 2);
        }
    }

    function clearReconnectTimer(state) {
        if (state.reconnectTimeout) {
            clearTimeout(state.reconnectTimeout);
            state.reconnectTimeout = null;
        }
    }

    return {
        wsUrl: wsUrl,
        closeWebSocket: closeWebSocket,
        scheduleReconnect: scheduleReconnect,
        clearReconnectTimer: clearReconnectTimer,
    };
})();
