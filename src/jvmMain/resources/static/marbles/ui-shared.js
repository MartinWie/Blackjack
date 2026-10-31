window.uiShared = (function() {
    var soundOnIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-volume-up" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M11.536 14.01A8.47 8.47 0 0 0 14.026 8a8.47 8.47 0 0 0-2.49-6.01l-.708.707A7.48 7.48 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303z"/><path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.48 5.48 0 0 1 11.025 8a5.48 5.48 0 0 1-1.61 3.89z"/><path d="M10.025 8a4.5 4.5 0 0 1-1.318 3.182L8 10.475A3.5 3.5 0 0 0 9.025 8c0-.966-.392-1.841-1.025-2.475l.707-.707A4.5 4.5 0 0 1 10.025 8M7 4a.5.5 0 0 0-.812-.39L3.825 5.5H1.5A.5.5 0 0 0 1 6v4a.5.5 0 0 0 .5.5h2.325l2.363 1.89A.5.5 0 0 0 7 12zM4.312 6.39 6 5.04v5.92L4.312 9.61A.5.5 0 0 0 4 9.5H2v-3h2a.5.5 0 0 0 .312-.11"/></svg>';
    var soundMutedIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-volume-mute-fill" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06m7.137 2.096a.5.5 0 0 1 0 .708L12.207 8l1.647 1.646a.5.5 0 0 1-.708.708L11.5 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L10.793 8 9.146 6.354a.5.5 0 1 1 .708-.708L11.5 7.293l1.646-1.647a.5.5 0 0 1 .708 0"/></svg>';

    function showToast(message, atTop, durationMs) {
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
        }, durationMs || 1600);
    }

    function bindSoundButton(options) {
        var buttonId = (options && options.buttonId) || 'sound-btn';
        var storageKey = (options && options.storageKey) || 'marblegame_sound_muted';
        var onToggle = options && options.onToggle;

        var btn = document.getElementById(buttonId);
        if (!btn || btn.dataset.soundBound === '1') return;
        btn.dataset.soundBound = '1';

        function isMuted() {
            return localStorage.getItem(storageKey) === '1';
        }

        function sync() {
            var muted = isMuted();
            var onText = btn.dataset.soundOn || 'Sound On';
            var offText = btn.dataset.soundOff || 'Sound Off';
            var iconWrap = btn.querySelector('.sound-icon');
            if (iconWrap) {
                iconWrap.innerHTML = muted ? soundMutedIcon : soundOnIcon;
            }
            var stateText = muted ? offText : onText;
            btn.setAttribute('aria-label', stateText);
            btn.setAttribute('title', stateText);
        }

        sync();
        btn.addEventListener('click', function() {
            var nextMuted = !isMuted();
            localStorage.setItem(storageKey, nextMuted ? '1' : '0');
            if (typeof onToggle === 'function') {
                onToggle(nextMuted);
            }
            sync();
        });
    }

    function bindShareButton(options) {
        var buttonId = (options && options.buttonId) || 'share-btn';
        var toastDuration = (options && options.toastDurationMs) || 1800;

        var shareBtn = document.getElementById(buttonId);
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
            showToast(copiedText, true, toastDuration);
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

    return {
        showToast: showToast,
        bindShareButton: bindShareButton,
        bindSoundButton: bindSoundButton,
    };
})();
