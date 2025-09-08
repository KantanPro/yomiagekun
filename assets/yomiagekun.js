/**
 * 読み上げくん - フロントエンドJavaScript
 */

(function($) {
    'use strict';
    
    var YomiageKun = {
        isPlaying: false,
        isPaused: false,
        currentUtterance: null,
        currentChunks: [],
        currentChunkIndex: 0,
        selectedAccuracy: 'simple', // デフォルトは簡略
        showAccuracyMenu: false,
        
        init: function() {
            this.createFloatingIcon();
            this.bindEvents();
        },
        
        createFloatingIcon: function() {
            var options = yomiagekun_ajax.options;
            var iconHtml = '';
            
            if (options.icon_url && options.icon_url !== '') {
                iconHtml = '<img src="' + options.icon_url + '" alt="読み上げくん" />';
            } else {
                iconHtml = '<div class="default-icon">📢</div>';
            }
            
            // 位置設定に基づいてクラスを追加
            var positionClass = '';
            if (options.icon_position === 'bottom-left') {
                positionClass = ' position-bottom-left';
            }
            
            var accuracyMenu = '<div class="yomiagekun-accuracy-menu">' +
                '<div class="yomiagekun-accuracy-option" data-accuracy="simple">' +
                    '<div class="option-title">簡略</div>' +
                    '<div class="option-description">短く要点のみを要約</div>' +
                '</div>' +
                '<div class="yomiagekun-accuracy-option" data-accuracy="detailed">' +
                    '<div class="option-title">詳細</div>' +
                    '<div class="option-description">より詳しい内容を含む要約</div>' +
                '</div>' +
                '<div class="yomiagekun-accuracy-option" data-accuracy="full">' +
                    '<div class="option-title">完全</div>' +
                    '<div class="option-description">要約せずに全テキストを読み上げ</div>' +
                '</div>' +
                '</div>';
            
            var floatingIcon = $('<div class="yomiagekun-floating-icon' + positionClass + '" title="読み上げくん">' +
                iconHtml +
                '<div class="yomiagekun-tooltip">クリックして読み上げ</div>' +
                accuracyMenu +
                '</div>');
            
            $('body').append(floatingIcon);
        },
        
        bindEvents: function() {
            var self = this;
            
            // アイコンのクリックイベント
            $(document).on('click', '.yomiagekun-floating-icon', this.handleClick.bind(this));
            
            // マウスオーバーイベント
            $(document).on('mouseenter', '.yomiagekun-floating-icon', function() {
                if (!self.isPlaying) {
                    self.showAccuracyMenu($(this));
                }
            });
            
            $(document).on('mouseleave', '.yomiagekun-floating-icon', function() {
                self.hideAccuracyMenu($(this));
            });
            
            // 精度選択オプションのクリックイベント
            $(document).on('click', '.yomiagekun-accuracy-option', function(e) {
                e.stopPropagation();
                var accuracy = $(this).data('accuracy');
                var $icon = $(this).closest('.yomiagekun-floating-icon');
                self.selectAccuracy(accuracy, $icon);
            });
            
            // メニュー外クリックで閉じる
            $(document).on('click', function(e) {
                if (!$(e.target).closest('.yomiagekun-floating-icon').length) {
                    self.hideAllAccuracyMenus();
                }
            });
        },
        
        handleClick: function(e) {
            e.preventDefault();
            
            var $icon = $(e.currentTarget);
            
            // 読み上げ中の場合は一時停止/再開
            if (this.isPlaying) {
                if (this.isPaused) {
                    this.resumeReading($icon);
                } else {
                    this.pauseReading($icon);
                }
                return;
            }
            
            // 停止中の場合はデフォルト精度で読み上げ開始
            this.startReadingWithAccuracy(this.selectedAccuracy, $icon);
        },
        
        startReadingWithAccuracy: function(accuracy, $icon) {
            var postId = this.getCurrentPostId();
            
            if (!postId) {
                this.showError($icon, '記事が見つかりません');
                return;
            }
            
            this.startReading($icon);
            
            // AJAXで要約を取得（精度を指定）
            var self = this;
            $.ajax({
                url: yomiagekun_ajax.ajax_url,
                type: 'POST',
                data: {
                    action: 'yomiagekun_summarize',
                    post_id: postId,
                    nonce: yomiagekun_ajax.nonce,
                    accuracy: accuracy
                },
                success: function(response) {
                    if (response.success && response.data.summary) {
                        self.speakText(response.data.summary, $icon);
                    } else {
                        self.showError($icon, '要約の生成に失敗しました');
                    }
                },
                error: function() {
                    self.showError($icon, '通信エラーが発生しました');
                }
            });
        },
        
        getCurrentPostId: function() {
            // 単一記事ページかどうかをチェック
            if (typeof yomiagekun_ajax.post_id !== 'undefined') {
                return yomiagekun_ajax.post_id;
            }
            
            // グローバル変数から取得を試行
            if (typeof wp !== 'undefined' && wp.data && wp.data.select) {
                try {
                    return wp.data.select('core/editor').getCurrentPostId();
                } catch (e) {
                    // エラーを無視
                }
            }
            
            // URLから取得を試行
            var url = window.location.href;
            var match = url.match(/\/\d+\//);
            if (match) {
                return match[0].replace(/\//g, '');
            }
            
            return null;
        },
        
        startReading: function($icon) {
            $icon.removeClass('completed error paused').addClass('reading');
            $icon.find('.yomiagekun-tooltip').text('読み上げ中...');
        },
        
        pauseReading: function($icon) {
            if (this.isPlaying && !this.isPaused) {
                speechSynthesis.pause();
                this.isPaused = true;
                $icon.removeClass('reading').addClass('paused');
                $icon.find('.yomiagekun-tooltip').text('一時停止中... クリックで再開');
            }
        },
        
        resumeReading: function($icon) {
            if (this.isPlaying && this.isPaused) {
                speechSynthesis.resume();
                this.isPaused = false;
                $icon.removeClass('paused').addClass('reading');
                $icon.find('.yomiagekun-tooltip').text('読み上げ中...');
            }
        },
        
        stopReading: function($icon) {
            speechSynthesis.cancel();
            this.isPlaying = false;
            this.isPaused = false;
            this.currentUtterance = null;
            this.currentChunks = [];
            this.currentChunkIndex = 0;
            $icon.removeClass('reading paused completed error');
            $icon.find('.yomiagekun-tooltip').text('クリックして読み上げ');
        },
        
        showAccuracyMenu: function($icon) {
            if (this.isPlaying) return;
            
            $icon.find('.yomiagekun-accuracy-menu').addClass('show');
            $icon.find('.yomiagekun-tooltip').hide();
            this.updateActiveOption($icon);
        },
        
        hideAccuracyMenu: function($icon) {
            $icon.find('.yomiagekun-accuracy-menu').removeClass('show');
            $icon.find('.yomiagekun-tooltip').show();
        },
        
        hideAllAccuracyMenus: function() {
            $('.yomiagekun-accuracy-menu').removeClass('show');
            $('.yomiagekun-tooltip').show();
        },
        
        selectAccuracy: function(accuracy, $icon) {
            this.selectedAccuracy = accuracy;
            this.hideAccuracyMenu($icon);
            this.startReadingWithAccuracy(accuracy, $icon);
        },
        
        updateActiveOption: function($icon) {
            $icon.find('.yomiagekun-accuracy-option').removeClass('active');
            $icon.find('.yomiagekun-accuracy-option[data-accuracy="' + this.selectedAccuracy + '"]').addClass('active');
        },
        
        speakText: function(text, $icon) {
            var options = yomiagekun_ajax.options;
            var self = this;
            
            // Web Speech APIのサポートチェック
            if (!('speechSynthesis' in window)) {
                this.showError($icon, 'お使いのブラウザは音声合成に対応していません');
                return;
            }
            
            // 既存の音声を停止
            this.stopReading($icon);
            
            // 完全モードの場合は長いテキストになる可能性があることを通知
            if (options.summary_accuracy === 'full' && text.length > 1000) {
                $icon.find('.yomiagekun-tooltip').text('長いテキストを読み上げ中...');
            }
            
            // 完全モードで長いテキストの場合は分割して読み上げ
            if (options.summary_accuracy === 'full' && text.length > 2000) {
                this.speakLongText(text, $icon, options);
                return;
            }
            
            var utterance = new SpeechSynthesisUtterance(text);
            this.currentUtterance = utterance;
            
            // 音声設定
            utterance.rate = parseFloat(options.speech_rate) || 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 0.8;
            
            // 音声の性別設定
            var voices = speechSynthesis.getVoices();
            var selectedVoice = null;
            
            if (options.voice_gender === 'male') {
                selectedVoice = voices.find(function(voice) {
                    return voice.lang.startsWith('ja') && voice.name.includes('Male');
                });
            } else {
                selectedVoice = voices.find(function(voice) {
                    return voice.lang.startsWith('ja') && voice.name.includes('Female');
                });
            }
            
            // 日本語音声が見つからない場合はデフォルトを使用
            if (!selectedVoice) {
                selectedVoice = voices.find(function(voice) {
                    return voice.lang.startsWith('ja');
                });
            }
            
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }
            
            // イベントハンドラー
            utterance.onstart = function() {
                self.isPlaying = true;
                self.isPaused = false;
                $icon.removeClass('paused').addClass('reading');
                $icon.find('.yomiagekun-tooltip').text('読み上げ中... クリックで一時停止');
            };
            
            utterance.onend = function() {
                self.stopReading($icon);
            };
            
            utterance.onerror = function(event) {
                self.showError($icon, '音声読み上げエラー: ' + event.error);
            };
            
            // 音声を開始
            speechSynthesis.speak(utterance);
        },
        
        speakLongText: function(text, $icon, options) {
            var self = this;
            this.currentChunks = this.splitTextIntoChunks(text, 2000);
            this.currentChunkIndex = 0;
            
            function speakNextChunk() {
                if (self.currentChunkIndex >= self.currentChunks.length) {
                    // 全てのチャンクの読み上げが完了
                    self.stopReading($icon);
                    return;
                }
                
                var chunk = self.currentChunks[self.currentChunkIndex];
                var utterance = new SpeechSynthesisUtterance(chunk);
                self.currentUtterance = utterance;
                
                // 音声設定
                utterance.rate = parseFloat(options.speech_rate) || 1.0;
                utterance.pitch = 1.0;
                utterance.volume = 0.8;
                
                // 音声の性別設定
                var voices = speechSynthesis.getVoices();
                var selectedVoice = null;
                
                if (options.voice_gender === 'male') {
                    selectedVoice = voices.find(function(voice) {
                        return voice.lang.startsWith('ja') && voice.name.includes('Male');
                    });
                } else {
                    selectedVoice = voices.find(function(voice) {
                        return voice.lang.startsWith('ja') && voice.name.includes('Female');
                    });
                }
                
                if (!selectedVoice) {
                    selectedVoice = voices.find(function(voice) {
                        return voice.lang.startsWith('ja');
                    });
                }
                
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                }
                
                // 進捗表示
                $icon.find('.yomiagekun-tooltip').text('読み上げ中... (' + (self.currentChunkIndex + 1) + '/' + self.currentChunks.length + ') クリックで一時停止');
                
                utterance.onstart = function() {
                    self.isPlaying = true;
                    self.isPaused = false;
                };
                
                utterance.onend = function() {
                    self.currentChunkIndex++;
                    setTimeout(speakNextChunk, 500); // 0.5秒の間隔
                };
                
                utterance.onerror = function(event) {
                    self.showError($icon, '音声読み上げエラー: ' + event.error);
                };
                
                speechSynthesis.speak(utterance);
            }
            
            speakNextChunk();
        },
        
        splitTextIntoChunks: function(text, chunkSize) {
            var chunks = [];
            var sentences = text.split(/[。！？\n]/);
            var currentChunk = '';
            
            for (var i = 0; i < sentences.length; i++) {
                var sentence = sentences[i].trim();
                if (sentence.length === 0) continue;
                
                if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = sentence;
                } else {
                    currentChunk += (currentChunk.length > 0 ? '。' : '') + sentence;
                }
            }
            
            if (currentChunk.trim().length > 0) {
                chunks.push(currentChunk.trim());
            }
            
            return chunks;
        },
        
        showError: function($icon, message) {
            $icon.removeClass('reading completed').addClass('error');
            $icon.find('.yomiagekun-tooltip').text(message);
            
            // 3秒後に元の状態に戻す
            setTimeout(function() {
                $icon.removeClass('error');
                $icon.find('.yomiagekun-tooltip').text('クリックして読み上げ');
            }, 3000);
        }
    };
    
    // DOM読み込み完了後に初期化
    $(document).ready(function() {
        YomiageKun.init();
    });
    
    // 音声リストの読み込み待ち（一部のブラウザで必要）
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = function() {
            // 音声リストが更新された時の処理（必要に応じて）
        };
    }
    
})(jQuery);
