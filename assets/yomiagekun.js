/**
 * 読み上げくん - フロントエンドJavaScript
 *
 * アイコンを押すと操作パネルが開く。読み方（簡略・詳細・完全）と速さを選んで読み上げる。
 * 本文は文ごとに短く区切ってキューで順に読む（Chrome は長い発話を途中で止めるため）。
 */

(function() {
    'use strict';

    var cfg = window.yomiagekunConfig;
    var synth = window.speechSynthesis;
    if (!cfg || !cfg.postId) {
        return;
    }

    var MODES = [
        { key: 'simple', title: '簡略', desc: '短く要点だけ', ai: true },
        { key: 'detailed', title: '詳細', desc: 'くわしく要約', ai: true },
        { key: 'full', title: '完全', desc: '全文を読む', ai: false }
    ];
    var RATES = [0.8, 1, 1.25, 1.5];

    // 1 回の発話の目安（日本語で 10 秒前後）。長い文は読点で切る
    var CHUNK_CHARS = 100;

    // 性別ごとの既知の日本語音声（名前の一部、小文字）。先にあるものを優先する
    var VOICE_NAMES = {
        female: ['nanami', 'kyoko', 'o-ren', 'haruka', 'ayumi', 'sayaka', 'aoi', 'mayu', 'shiori', 'google 日本語'],
        male: ['keita', 'otoya', 'hattori', 'ichiro', 'daichi', 'naoki']
    };

    var STORAGE_KEY = 'yomiagekun';

    var state = 'idle'; // idle | loading | playing | paused
    var runId = 0;       // 停止や作り直しで古い発話のイベントを無視するための番号
    var queue = [];
    var index = 0;
    var textCache = {};
    var textPending = {};
    var errorTimer = null;

    var hasAi = !!cfg.hasAi;
    var saved = loadPrefs();
    var mode = pickInitialMode(saved.mode || cfg.mode);
    var rate = RATES.indexOf(saved.rate) !== -1 ? saved.rate : nearestRate(parseFloat(cfg.rate) || 1);

    var el = {};

    // ---- 設定の保存（プライベートブラウズ等で使えなくても動く） ----

    function loadPrefs() {
        try {
            var raw = window.localStorage.getItem(STORAGE_KEY);
            var data = raw ? JSON.parse(raw) : {};
            return data && typeof data === 'object' ? data : {};
        } catch (e) {
            return {};
        }
    }

    function savePrefs() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: mode, rate: rate }));
        } catch (e) {
            // 保存できなくても読み上げには関係ない
        }
    }

    function pickInitialMode(wanted) {
        var found = MODES.filter(function(m) { return m.key === wanted && (hasAi || !m.ai); })[0];
        return found ? found.key : 'full';
    }

    function nearestRate(value) {
        return RATES.reduce(function(best, r) {
            return Math.abs(r - value) < Math.abs(best - value) ? r : best;
        }, RATES[0]);
    }

    // ---- 画面 ----

    function h(tag, attrs, children) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function(key) {
            if (key === 'text') {
                node.textContent = attrs[key];
            } else {
                node.setAttribute(key, attrs[key]);
            }
        });
        (children || []).forEach(function(child) { node.appendChild(child); });
        return node;
    }

    function build() {
        var position = /^(top|middle|bottom)-(left|right)$/.test(cfg.position) ? cfg.position : 'bottom-right';

        var iconChild = cfg.iconUrl
            ? h('img', { src: cfg.iconUrl, alt: '' })
            : h('span', { 'class': 'yomiagekun-default-icon', 'aria-hidden': 'true', text: '📢' });

        el.toggle = h('button', {
            type: 'button',
            'class': 'yomiagekun-toggle',
            'aria-expanded': 'false',
            'aria-controls': 'yomiagekun-panel',
            'aria-label': '読み上げくん（この記事を音声で聞く）',
            title: '読み上げましょうか？'
        }, [iconChild]);

        el.modeButtons = MODES.filter(function(m) { return hasAi || !m.ai; }).map(function(m) {
            var btn = h('button', { type: 'button', 'class': 'yomiagekun-mode', 'data-mode': m.key, 'aria-pressed': 'false' }, [
                h('span', { 'class': 'yomiagekun-mode__title', text: m.title }),
                h('span', { 'class': 'yomiagekun-mode__desc', text: m.desc })
            ]);
            btn.addEventListener('click', function() { selectMode(m.key); });
            return btn;
        });

        el.rateButtons = RATES.map(function(r) {
            var btn = h('button', { type: 'button', 'class': 'yomiagekun-rate', 'aria-pressed': 'false', 'aria-label': '速さ ' + r + '倍', text: r + '×' });
            btn.addEventListener('click', function() { selectRate(r); });
            return btn;
        });

        el.play = h('button', { type: 'button', 'class': 'yomiagekun-play' });
        el.play.addEventListener('click', onPlay);

        el.stop = h('button', { type: 'button', 'class': 'yomiagekun-stop', text: '■ 停止' });
        el.stop.addEventListener('click', stop);

        el.status = h('p', { 'class': 'yomiagekun-status', role: 'status', 'aria-live': 'polite' });

        el.panel = h('div', { id: 'yomiagekun-panel', 'class': 'yomiagekun-panel', role: 'group', 'aria-label': '読み上げの操作', hidden: '' }, [
            h('p', { 'class': 'yomiagekun-heading', text: '読み方' }),
            h('div', { 'class': 'yomiagekun-modes' }, el.modeButtons),
            h('div', { 'class': 'yomiagekun-controls' }, [el.play, el.stop]),
            h('div', { 'class': 'yomiagekun-rates' }, [h('span', { 'class': 'yomiagekun-heading', text: '速さ' })].concat(el.rateButtons)),
            el.status
        ]);

        el.root = h('div', { 'class': 'yomiagekun yomiagekun--' + position }, [el.panel, el.toggle]);
        document.body.appendChild(el.root);

        el.toggle.addEventListener('click', function() { setPanelOpen(el.panel.hidden); });

        document.addEventListener('click', function(e) {
            if (!el.panel.hidden && !el.root.contains(e.target)) {
                setPanelOpen(false);
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && !el.panel.hidden) {
                setPanelOpen(false);
                el.toggle.focus();
            }
        });

        render();
    }

    function setPanelOpen(open) {
        el.panel.hidden = !open;
        el.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        el.root.classList.toggle('is-open', open);
        if (open) {
            prefetch();
        }
    }

    // iPhone/iPad は「押してから約 1 秒以内」の speak() しか音にしない。
    // 全文は AI を使わず安いので、パネルを開いた時点で取っておき、押したらその場で読めるようにする
    function prefetch() {
        if (mode === 'full') {
            fetchText('full').catch(function() {
                // 失敗しても再生ボタンを押したときにもう一度取りに行く
            });
        }
    }

    function render() {
        el.root.classList.toggle('is-loading', state === 'loading');
        el.root.classList.toggle('is-playing', state === 'playing');
        el.root.classList.toggle('is-paused', state === 'paused');

        el.modeButtons.forEach(function(btn) {
            btn.setAttribute('aria-pressed', btn.getAttribute('data-mode') === mode ? 'true' : 'false');
        });
        el.rateButtons.forEach(function(btn, i) {
            btn.setAttribute('aria-pressed', RATES[i] === rate ? 'true' : 'false');
        });

        var label = { idle: '▶ 読み上げる', loading: '準備中…', playing: 'Ⅱ 一時停止', paused: '▶ 続きから' }[state];
        el.play.textContent = label;
        el.play.disabled = state === 'loading';
        el.stop.disabled = state === 'idle';
    }

    // Chrome は一時停止中に cancel() すると、次の speak() も止まったままになる
    function cancelSpeech() {
        if (!synth) {
            return;
        }
        if (synth.paused) {
            synth.resume();
        }
        synth.cancel();
    }

    function setStatus(text) {
        el.status.textContent = text;
    }

    function showError(message) {
        runId++;
        cancelSpeech();
        state = 'idle';
        queue = [];
        index = 0;
        render();
        setStatus(message);
        el.root.classList.add('is-error');
        clearTimeout(errorTimer);
        errorTimer = setTimeout(function() { el.root.classList.remove('is-error'); }, 3000);
    }

    // ---- 操作 ----

    function onPlay() {
        if (state === 'playing') {
            synth.pause();
            state = 'paused';
            setStatus('一時停止中');
            render();
        } else if (state === 'paused') {
            synth.resume();
            state = 'playing';
            setStatus(progressText());
            render();
        } else if (state === 'idle') {
            start();
        }
    }

    function selectMode(key) {
        if (key === mode && state !== 'idle') {
            return;
        }
        mode = key;
        savePrefs();
        if (state === 'idle') {
            render();
            prefetch();
        } else {
            // 読み上げ中に切り替えたら、新しい読み方で最初から
            stop();
            start();
        }
    }

    function selectRate(r) {
        rate = r;
        savePrefs();
        render();
        // 読み上げ中なら今の区切りから新しい速さで読み直す
        if (state === 'playing' || state === 'paused') {
            runId++;
            cancelSpeech();
            state = 'playing';
            render();
            speakCurrent();
        }
    }

    function stop() {
        runId++;
        cancelSpeech();
        state = 'idle';
        queue = [];
        index = 0;
        setStatus('');
        render();
    }

    function start() {
        if (!synth || typeof window.SpeechSynthesisUtterance === 'undefined') {
            showError('お使いのブラウザは音声の読み上げに対応していません。');
            return;
        }

        cancelSpeech();
        var myRun = ++runId;

        // 取得済みなら、押した操作の中でそのまま読み始める（iPhone/iPad で確実に音が出る）
        if (textCache[mode]) {
            begin(textCache[mode]);
            return;
        }

        // iPhone/iPad は押してから約 1 秒を過ぎた speak() を無音にする。通信が遅いサイトで黙るので、
        // 押した操作の中で実際に声を出して読み上げを始めておく（空白や音量 0 の発話では許可されない）
        var notice = makeUtterance(mode === 'full' ? '本文を読み込んでいます。' : '要約を作成しています。少しお待ちください。');
        synth.speak(notice);

        state = 'loading';
        setStatus(mode === 'full' ? '本文を読み込み中…' : '要約を作成中…（少し時間がかかります）');
        render();

        Promise.all([fetchText(mode), waitForVoices()]).then(function(results) {
            if (myRun !== runId) {
                return;
            }
            begin(results[0]);
        }).catch(function(err) {
            if (myRun === runId) {
                showError(err && err.message ? err.message : '通信エラーが発生しました。');
            }
        });
    }

    function begin(text) {
        queue = splitIntoChunks(text);
        index = 0;
        if (!queue.length) {
            showError('読み上げる文章がありませんでした。');
            return;
        }
        state = 'playing';
        render();
        speakCurrent();
    }

    function makeUtterance(text) {
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = rate;
        var voice = pickVoice(cfg.gender);
        if (voice) {
            utterance.voice = voice;
        }
        return utterance;
    }

    function progressText() {
        return '読み上げ中（' + (index + 1) + ' / ' + queue.length + '）';
    }

    function speakCurrent() {
        if (index >= queue.length) {
            stop();
            setStatus('最後まで読み上げました。');
            return;
        }

        var myRun = runId;
        var utterance = makeUtterance(queue[index]);

        utterance.onend = function() {
            if (myRun !== runId) {
                return;
            }
            index++;
            speakCurrent();
        };
        utterance.onerror = function(event) {
            // cancel() で止めたときの interrupted/canceled はエラーではない
            if (myRun !== runId || event.error === 'interrupted' || event.error === 'canceled') {
                return;
            }
            showError('音声の読み上げに失敗しました（' + event.error + '）。');
        };

        setStatus(progressText());
        synth.speak(utterance);
    }

    // ---- 本文の取得と分割 ----

    function fetchText(key) {
        if (textCache[key]) {
            return Promise.resolve(textCache[key]);
        }
        // 先読み中なら同じ通信を待つ（二重に取りに行かない）
        if (textPending[key]) {
            return textPending[key];
        }

        var body = new FormData();
        body.append('action', 'yomiagekun_summarize');
        body.append('post_id', cfg.postId);
        body.append('accuracy', key);

        textPending[key] = fetch(cfg.ajaxUrl, { method: 'POST', body: body, credentials: 'same-origin' })
            .then(function(res) {
                return res.json().catch(function() { return null; });
            })
            .then(function(json) {
                delete textPending[key];
                if (json && json.success && json.data && json.data.text) {
                    textCache[key] = json.data.text;
                    return json.data.text;
                }
                var message = json && json.data && json.data.message ? json.data.message : '文章を取得できませんでした。';
                throw new Error(message);
            }, function(err) {
                delete textPending[key];
                throw err;
            });
        return textPending[key];
    }

    function splitIntoChunks(text) {
        // 句点・感嘆符・疑問符・改行の後ろで切る（記号は文に残す）
        // 古い iOS Safari は後読み (?<=) を解釈できないので、区切り記号の後ろに改行を足してから分ける
        var sentences = String(text).replace(/([。！？!?])/g, '$1\n').split(/\n+/).map(function(s) {
            return s.trim();
        }).filter(Boolean);

        var chunks = [];
        var current = '';

        sentences.forEach(function(sentence) {
            // 1 文が長すぎるときは読点で分ける
            var parts = sentence.length > CHUNK_CHARS ? splitLongSentence(sentence) : [sentence];
            parts.forEach(function(part) {
                if (current && current.length + part.length > CHUNK_CHARS) {
                    chunks.push(current);
                    current = '';
                }
                current += part;
            });
        });
        if (current) {
            chunks.push(current);
        }
        return chunks;
    }

    function splitLongSentence(sentence) {
        var parts = [];
        var current = '';
        sentence.replace(/([、，,])/g, '$1\n').split('\n').forEach(function(piece) {
            while (piece.length > CHUNK_CHARS) {
                // 読点が無い長い塊は文字数で切る
                parts.push(piece.slice(0, CHUNK_CHARS));
                piece = piece.slice(CHUNK_CHARS);
            }
            if (current && current.length + piece.length > CHUNK_CHARS) {
                parts.push(current);
                current = '';
            }
            current += piece;
        });
        if (current) {
            parts.push(current);
        }
        return parts;
    }

    // ---- 音声 ----

    function waitForVoices() {
        return new Promise(function(resolve) {
            if (synth.getVoices().length) {
                resolve();
                return;
            }
            var done = false;
            function finish() {
                if (!done) {
                    done = true;
                    resolve();
                }
            }
            synth.addEventListener('voiceschanged', finish);
            // 一覧が来ない端末でも既定の声で読めるので、待つのは最大 1.5 秒
            setTimeout(finish, 1500);
        });
    }

    function pickVoice(gender) {
        var voices = synth.getVoices().filter(function(v) {
            return /^ja[-_]?/i.test(v.lang);
        });
        if (!voices.length) {
            return null;
        }

        var wanted = VOICE_NAMES[gender === 'male' ? 'male' : 'female'];
        var other = VOICE_NAMES[gender === 'male' ? 'female' : 'male'];

        for (var i = 0; i < wanted.length; i++) {
            for (var j = 0; j < voices.length; j++) {
                if (voices[j].name.toLowerCase().indexOf(wanted[i]) !== -1) {
                    return voices[j];
                }
            }
        }

        // 名前で分からなければ、反対の性別と分かっている声を避けて先頭を使う
        var neutral = voices.filter(function(v) {
            var name = v.name.toLowerCase();
            return !other.some(function(n) { return name.indexOf(n) !== -1; });
        });
        return neutral[0] || voices[0];
    }

    // ---- 起動 ----

    function init() {
        build();
        if (synth) {
            // 一覧の読み込みを先に始めておく（Chrome は最初の呼び出しで空を返す）
            synth.getVoices();
            window.addEventListener('pagehide', cancelSpeech);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
