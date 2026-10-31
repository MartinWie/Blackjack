/**
 * Game page client-side logic for WebSocket handling, reconnection, and UI interactions.
 * 
 * Handles:
 * - WebSocket connection and reconnection on errors
 * - Ping timeout detection (reconnects if no ping for 45 seconds)
 * - Tab visibility changes (reconnects when tab becomes visible)
 * - Countdown timers for disconnected players
 * - Marble picker UI for placing marbles
 * - Marble animations (fly in/out)
 */
function initGame(gameId) {
    // Update URL to include game ID (for bookmarking/sharing)
    if (window.location.pathname !== '/marbles/game/' + gameId) {
        history.replaceState(null, '', '/marbles/game/' + gameId);
    }
    
    var gameContent = document.getElementById('game-content');
    var lastPingTime = Date.now();
    var pingCheckInterval = null;
    var countdownInterval = null;
    var previousMarbleCount = null;
    var reconnectTimeout = null;
    var isConnecting = false;
    var webSocket = null;
    var reconnectDelayMs = 1000;
    var consecutiveConnectFailures = 0;
    var realtimeFailureBannerShown = false;
    var uiShared = window.uiShared;
    var soundMuted = localStorage.getItem('marblegame_sound_muted') === '1';
    var audioCtx = null;
    var audioUnlocked = false;
    var lastPhaseClass = '';
    var lastYourTurn = false;
    var realtimeShared = window.realtimeShared;

    function closeRealtimeConnection() {
        if (realtimeShared) {
            webSocket = realtimeShared.closeWebSocket(webSocket);
        } else if (webSocket) {
            webSocket.onopen = null;
            webSocket.onmessage = null;
            webSocket.onerror = null;
            webSocket.onclose = null;
            try {
                webSocket.close();
            } catch (_) {}
            webSocket = null;
        }
    }

    function showToast(message, atTop) {
        if (uiShared) {
            uiShared.showToast(message, atTop, 1400);
            return;
        }
        if (!message) return;
        var existing = document.getElementById('game-toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.id = 'game-toast';
        toast.className = 'game-toast';
        if (atTop) toast.classList.add('toast-top');
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(function() {
            toast.classList.add('show');
        });

        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 220);
        }, 1400);
    }

    function showRealtimeFailureBanner() {
        if (realtimeFailureBannerShown) return;
        realtimeFailureBannerShown = true;
        showToast('Realtime connection lost. Trying to reconnect...', true);
    }

    function ensureAudioContext() {
        if (!audioCtx) {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audioCtx = new Ctx();
        }
        return audioCtx;
    }

    function unlockAudio() {
        var ctx = ensureAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume().catch(function() {});
        }
        audioUnlocked = true;
    }

    function playTone(freq, durationMs, gain) {
        if (soundMuted) return;
        var ctx = ensureAudioContext();
        if (!ctx || !audioUnlocked) return;
        var osc = ctx.createOscillator();
        var amp = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        amp.gain.value = gain;
        osc.connect(amp);
        amp.connect(ctx.destination);
        var now = ctx.currentTime;
        osc.start(now);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
        osc.stop(now + durationMs / 1000);
    }

    function playRoundStartSound() {
        playTone(523, 180, 0.06);
        setTimeout(function() { playTone(659, 220, 0.05); }, 140);
    }

    function playYourTurnSound() {
        playTone(784, 220, 0.05);
    }

    function syncSoundButton() {
        if (uiShared) return;
        var btn = document.getElementById('sound-btn');
        if (!btn) return;
        var onText = btn.dataset.soundOn || 'Sound On';
        var offText = btn.dataset.soundOff || 'Sound Off';
        var iconWrap = btn.querySelector('.sound-icon');
        if (iconWrap) {
            iconWrap.innerHTML = soundMuted ? '🔇' : '🔊';
        }
        var stateText = soundMuted ? offText : onText;
        btn.setAttribute('aria-label', stateText);
        btn.setAttribute('title', stateText);
    }

    function bindSoundButton() {
        if (uiShared) {
            uiShared.bindSoundButton({
                buttonId: 'sound-btn',
                storageKey: 'marblegame_sound_muted',
                onToggle: function(nextMuted) {
                    soundMuted = !!nextMuted;
                    unlockAudio();
                },
            });
            return;
        }
        var btn = document.getElementById('sound-btn');
        if (!btn || btn.dataset.soundBound === '1') return;
        btn.dataset.soundBound = '1';
        syncSoundButton();
        btn.addEventListener('click', function() {
            soundMuted = !soundMuted;
            localStorage.setItem('marblegame_sound_muted', soundMuted ? '1' : '0');
            unlockAudio();
            syncSoundButton();
        });
    }

    function phaseState() {
        var phaseInfo = document.querySelector('.phase-info');
        if (!phaseInfo) return { phaseClass: '', yourTurn: false };
        var phaseClass = phaseInfo.className || '';
        var heading = phaseInfo.querySelector('h2');
        var turnLine = phaseInfo.querySelector('.turn-your');
        var yourTurn = false;
        if (turnLine) {
            yourTurn = true;
        } else if (heading) {
            yourTurn = /Your Turn|Du bist dran/i.test(heading.textContent || '');
        }
        return { phaseClass: phaseClass, yourTurn: yourTurn };
    }

    function bindShareButton() {
        if (uiShared) {
            uiShared.bindShareButton({ buttonId: 'share-btn', toastDurationMs: 1400 });
            return;
        }
        var shareBtn = document.getElementById('share-btn');
        if (!shareBtn || shareBtn.dataset.shareBound === '1') return;
        shareBtn.dataset.shareBound = '1';

        function toAbsoluteShareUrl(pathOrUrl) {
            if (!pathOrUrl) return window.location.href;
            try {
                var parsed = new URL(pathOrUrl, window.location.origin);
                if (!/^https?:$/.test(parsed.protocol)) return window.location.href;
                if (parsed.origin !== window.location.origin) return window.location.href;
                return parsed.toString();
            } catch (_) {
                return window.location.origin + pathOrUrl;
            }
        }

        function showCopied(btn) {
            var shareText = btn.dataset.shareText || 'Share';
            var copiedText = btn.dataset.copiedText || shareText;
            btn.setAttribute('aria-label', copiedText);
            btn.setAttribute('title', copiedText);
            btn.classList.add('copied');
            showToast(copiedText, true);
            setTimeout(function() {
                btn.setAttribute('aria-label', shareText);
                btn.setAttribute('title', shareText);
                btn.classList.remove('copied');
            }, 2000);
        }

        function fallbackCopy(url, btn) {
            var ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, 99999);
            try {
                document.execCommand('copy');
                showCopied(btn);
            } catch (_) {
                prompt('Copy this link:', url);
            }
            document.body.removeChild(ta);
        }

        function clipboardCopy(url, btn) {
            if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
                navigator.clipboard.writeText(url).then(function() {
                    showCopied(btn);
                }).catch(function() {
                    fallbackCopy(url, btn);
                });
            } else {
                fallbackCopy(url, btn);
            }
        }

        shareBtn.addEventListener('click', function() {
            var btn = this;
            var shareUrl = toAbsoluteShareUrl(btn.dataset.shareUrl || '');
            var shareTitle = btn.dataset.shareTitle || '';
            var shareMessage = btn.dataset.shareMessage || '';
            var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            if (isMobile && navigator.share) {
                navigator.share({
                    title: shareTitle,
                    text: shareMessage,
                    url: shareUrl,
                }).catch(function() {});
                return;
            }

            clipboardCopy(shareUrl, btn);
        });
    }

    function bindQrButton() {
        var qrBtn = document.getElementById('qr-btn');
        var qrModal = document.getElementById('qr-modal');
        var qrImage = document.getElementById('qr-image');
        var shareBtn = document.getElementById('share-btn');
        if (!qrBtn || !qrModal || !qrImage || !shareBtn || qrBtn.dataset.qrBound === '1') return;
        qrBtn.dataset.qrBound = '1';

        qrModal.addEventListener('close', function() {
            qrBtn.classList.remove('active');
            qrBtn.setAttribute('aria-expanded', 'false');
        });

        qrModal.addEventListener('click', function(e) {
            var box = qrModal.querySelector('.qr-modal-box');
            if (box && !box.contains(e.target)) {
                qrModal.close();
            }
        });

        qrBtn.addEventListener('click', function() {
            var sharePath = shareBtn.dataset.shareUrl || '';
            if (!sharePath) return;
            if (qrImage.dataset.src !== sharePath) {
                qrImage.src = '/marbles/qr?target=' + encodeURIComponent(sharePath);
                qrImage.dataset.src = sharePath;
            }
            if (!qrModal.open) {
                qrModal.showModal();
                qrBtn.classList.add('active');
                qrBtn.setAttribute('aria-expanded', 'true');
            } else {
                qrModal.close();
                qrBtn.classList.remove('active');
                qrBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }
    
    // Create animation container if it doesn't exist
    function getAnimationContainer() {
        var container = document.querySelector('.marble-animation-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'marble-animation-container';
            document.body.appendChild(container);
        }
        return container;
    }
    
    // Animate marbles flying out (when playing or losing)
    function animateMarblesOut(count, startElement, isLost) {
        var container = getAnimationContainer();
        var rect = startElement.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var centerY = rect.top + rect.height / 2;
        
        for (var i = 0; i < Math.min(count, 10); i++) {
            (function(index) {
                setTimeout(function() {
                    var marble = document.createElement('div');
                    marble.className = 'animated-marble fly-out' + (isLost ? ' lost' : '');
                    // Spread marbles horizontally
                    var offsetX = (index - Math.min(count, 10) / 2) * 20;
                    marble.style.left = (centerX + offsetX - 16) + 'px';
                    marble.style.top = (centerY - 16) + 'px';
                    container.appendChild(marble);
                    
                    // Remove after animation
                    setTimeout(function() {
                        marble.remove();
                    }, 1200);
                }, index * 80);
            })(i);
        }
    }
    
    // Animate marbles flying in (when receiving)
    function animateMarblesIn(count, targetElement) {
        var container = getAnimationContainer();
        var rect = targetElement.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var centerY = rect.top;
        
        for (var i = 0; i < Math.min(count, 10); i++) {
            (function(index) {
                setTimeout(function() {
                    var marble = document.createElement('div');
                    marble.className = 'animated-marble fly-in';
                    // Spread marbles horizontally
                    var offsetX = (index - Math.min(count, 10) / 2) * 25;
                    marble.style.left = (centerX + offsetX - 16) + 'px';
                    marble.style.top = (centerY - 16) + 'px';
                    container.appendChild(marble);
                    
                    // Remove after animation
                    setTimeout(function() {
                        marble.remove();
                    }, 1400);
                }, index * 120);
            })(i);
        }
    }
    
    // Get current marble count from status bar
    function getCurrentMarbleCount() {
        var statusBar = document.querySelector('.your-status strong');
        if (statusBar) {
            var count = parseInt(statusBar.textContent);
            return isNaN(count) ? null : count;
        }
        return null;
    }
    
    // Check for marble count changes and animate
    function checkMarbleChanges() {
        var currentCount = getCurrentMarbleCount();
        if (currentCount !== null && previousMarbleCount !== null) {
            var diff = currentCount - previousMarbleCount;
            var statusBar = document.querySelector('.your-status');
            var gameArea = document.querySelector('.game-area');
            if (diff > 0 && statusBar) {
                // Gained marbles - animate them flying in
                animateMarblesIn(diff, statusBar);
                statusBar.classList.add('marbles-changed', 'marbles-gained');
                setTimeout(function() {
                    statusBar.classList.remove('marbles-changed', 'marbles-gained');
                }, 600);
            } else if (diff < 0 && gameArea) {
                // Lost marbles - animate them flying away from game area
                animateMarblesOut(Math.abs(diff), gameArea, true);
                if (statusBar) {
                    statusBar.classList.add('marbles-changed', 'marbles-lost');
                    setTimeout(function() {
                        statusBar.classList.remove('marbles-changed', 'marbles-lost');
                    }, 600);
                }
            }
        }
        previousMarbleCount = currentCount;
    }
    
    // Countdown timer for disconnected players
    function startCountdowns() {
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(function() {
            var countdowns = document.querySelectorAll('.player-countdown');
            countdowns.forEach(function(el) {
                var seconds = parseInt(el.dataset.seconds) - 1;
                el.dataset.seconds = seconds;
                var timerSpan = el.querySelector('.countdown-timer');
                if (timerSpan) timerSpan.textContent = seconds + 's';
            });
            
            // Handle round result countdown (visual only - server auto-advances)
            var resultCountdown = document.querySelector('.result-countdown');
            if (resultCountdown) {
                var seconds = parseInt(resultCountdown.dataset.seconds) - 1;
                if (seconds >= 0) {
                    resultCountdown.dataset.seconds = seconds;
                    var timerSpan = resultCountdown.querySelector('.countdown-timer');
                    if (timerSpan) timerSpan.textContent = seconds;
                }
            }
        }, 1000);
    }
    
    // Setup marble picker click handlers
    function setupMarblePicker() {
        var picker = document.getElementById('marble-picker');
        if (!picker) return;
        var input = document.getElementById('marble-amount');
        var countDisplay = document.getElementById('selected-count');
        if (!input || !countDisplay) return;
        
        picker.onclick = function(e) {
            var btn = e.target;
            while (btn && !btn.classList.contains('marble-btn')) {
                btn = btn.parentElement;
            }
            if (!btn) return;
            
            var value = btn.getAttribute('data-value');
            input.value = value;
            countDisplay.textContent = value;
            
            var allBtns = picker.getElementsByClassName('marble-btn');
            for (var i = 0; i < allBtns.length; i++) {
                if (allBtns[i].getAttribute('data-value') === value) {
                    allBtns[i].classList.add('selected');
                } else {
                    allBtns[i].classList.remove('selected');
                }
            }
        };
        
        // Setup form submit handler for fly-out animation
        var form = document.getElementById('place-form');
        if (form) {
            form.addEventListener('htmx:beforeRequest', function(e) {
                var amount = parseInt(input.value) || 1;
                var selectedBtn = picker.querySelector('.marble-btn.selected');
                if (selectedBtn) {
                    animateMarblesOut(amount, selectedBtn);
                }
            });
        }
    }

    function handleGameUpdate(data) {
        gameContent.innerHTML = data;
        htmx.process(gameContent);
        startCountdowns();
        setupMarblePicker();
        bindShareButton();
        bindSoundButton();
        bindQrButton();
        var phase = phaseState();
        if (lastPhaseClass && phase.phaseClass && lastPhaseClass !== phase.phaseClass && /phase-info/.test(phase.phaseClass)) {
            playRoundStartSound();
        }
        if (!lastYourTurn && phase.yourTurn) {
            playYourTurnSound();
        }
        lastPhaseClass = phase.phaseClass;
        lastYourTurn = phase.yourTurn;
        checkMarbleChanges();
        var countdowns = document.querySelectorAll('.player-countdown');
        console.log('Found ' + countdowns.length + ' countdown elements');
    }

    function scheduleReconnect() {
        if (realtimeShared) {
            var state = {
                reconnectTimeout: reconnectTimeout,
                reconnectDelayMs: reconnectDelayMs,
            };
            realtimeShared.scheduleReconnect(state, function() {
                reconnectTimeout = null;
                connect();
            });
            reconnectTimeout = state.reconnectTimeout;
            reconnectDelayMs = state.reconnectDelayMs;
            return;
        }
        if (!reconnectTimeout) {
            var delay = reconnectDelayMs;
            var jitter = Math.floor(Math.random() * 250);
            var waitMs = delay + jitter;
            reconnectTimeout = setTimeout(function() {
                reconnectTimeout = null;
                connect();
            }, waitMs);
            reconnectDelayMs = Math.min(30000, reconnectDelayMs * 2);
        }
    }

    function connectWs() {
        if (typeof window.WebSocket !== 'function') {
            isConnecting = false;
            consecutiveConnectFailures += 1;
            if (consecutiveConnectFailures >= 5) {
                showRealtimeFailureBanner();
            }
            scheduleReconnect();
            return;
        }
        console.log('WS connecting...');
        webSocket = new WebSocket(realtimeShared ? realtimeShared.wsUrl('/marbles/ws/game/' + gameId) : ((window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/marbles/ws/game/' + gameId));
        lastPingTime = Date.now();

        webSocket.onopen = function() {
            console.log('WS connection opened');
            isConnecting = false;
            reconnectDelayMs = 1000;
            consecutiveConnectFailures = 0;
            realtimeFailureBannerShown = false;
        };

        webSocket.onmessage = function(e) {
            var text = typeof e.data === 'string' ? e.data : '';
            if (!text) return;
            if (text === '__PING__') {
                lastPingTime = Date.now();
                return;
            }
            if (text.indexOf('__GAME_UPDATE__:') === 0) {
                lastPingTime = Date.now();
                handleGameUpdate(text.slice('__GAME_UPDATE__:'.length));
            }
        };

        webSocket.onerror = function() {
            // Keep reconnect logic in onclose.
        };

        webSocket.onclose = function() {
            console.log('WS connection closed');
            isConnecting = false;
            closeRealtimeConnection();
            consecutiveConnectFailures += 1;
            if (consecutiveConnectFailures >= 5) {
                showRealtimeFailureBanner();
            }
            scheduleReconnect();
        };
    }
    
    function connect() {
        // Prevent multiple simultaneous connection attempts
        if (isConnecting) {
            console.log('Connection already in progress, skipping');
            return;
        }
        isConnecting = true;
        
        // Clear any pending reconnect
        if (reconnectTimeout) {
            if (realtimeShared) {
                realtimeShared.clearReconnectTimer({ reconnectTimeout: reconnectTimeout });
                reconnectTimeout = null;
            } else {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
        }

        closeRealtimeConnection();
        connectWs();
    }
    
    // Check if we've received a ping recently (within 45 seconds)
    pingCheckInterval = setInterval(function() {
        var timeSinceLastPing = Date.now() - lastPingTime;
        if (timeSinceLastPing > 45000) {
            console.log('No ping received for 45s, reconnecting...');
            connect();
        }
    }, 10000);
    
    // Handle tab visibility changes - refresh state when tab becomes visible
    // This fixes sync issues caused by browser throttling background tabs
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            console.log('Tab became visible, refreshing state...');
            connect();
        }
    });
    
    // Initial connection and countdowns
    connect();
    startCountdowns();
    setupMarblePicker();
    bindShareButton();
    bindSoundButton();
    bindQrButton();
    var initialPhase = phaseState();
    lastPhaseClass = initialPhase.phaseClass;
    lastYourTurn = initialPhase.yourTurn;
    document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    previousMarbleCount = getCurrentMarbleCount();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
        if (pingCheckInterval) clearInterval(pingCheckInterval);
        if (countdownInterval) clearInterval(countdownInterval);
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        closeRealtimeConnection();
    });
}
