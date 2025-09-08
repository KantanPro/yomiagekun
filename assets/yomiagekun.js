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
            console.log('読み上げくん: プラグイン初期化中...');
            console.log('読み上げくん: 設定オプション:', yomiagekun_ajax.options);
            this.createFloatingIcon();
            this.bindEvents();
            console.log('読み上げくん: プラグイン初期化完了');
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
            switch (options.icon_position) {
                case 'top-right':
                    positionClass = ' position-top-right';
                    break;
                case 'top-left':
                    positionClass = ' position-top-left';
                    break;
                case 'middle-right':
                    positionClass = ' position-middle-right';
                    break;
                case 'middle-left':
                    positionClass = ' position-middle-left';
                    break;
                case 'bottom-left':
                    positionClass = ' position-bottom-left';
                    break;
                case 'bottom-right':
                default:
                    positionClass = ' position-bottom-right';
                    break;
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
                '<div class="yomiagekun-tooltip">読み上げましょうか？</div>' +
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
            e.stopPropagation();
            
            var $icon = $(e.currentTarget);
            
            // モバイルデバイスの検出
            var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // 読み上げ中の場合は一時停止/再開
            if (this.isPlaying) {
                if (this.isPaused) {
                    this.resumeReading($icon);
                } else {
                    this.pauseReading($icon);
                }
                return;
            }
            
            // モバイルでは音声合成を開始する前にユーザーインタラクションを確実にする
            if (isMobile) {
                // モバイルでは少し遅延を入れてから開始
                setTimeout(function() {
                    this.startReadingWithAccuracy(this.selectedAccuracy, $icon);
                }.bind(this), 50);
            } else {
                // 停止中の場合はデフォルト精度で読み上げ開始
                this.startReadingWithAccuracy(this.selectedAccuracy, $icon);
            }
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
            $icon.find('.yomiagekun-tooltip').hide();
        },
        
        pauseReading: function($icon) {
            if (this.isPlaying && !this.isPaused) {
                speechSynthesis.pause();
                this.isPaused = true;
                $icon.removeClass('reading').addClass('paused');
                $icon.find('.yomiagekun-tooltip').hide();
            }
        },
        
        resumeReading: function($icon) {
            if (this.isPlaying && this.isPaused) {
                speechSynthesis.resume();
                this.isPaused = false;
                $icon.removeClass('paused').addClass('reading');
                $icon.find('.yomiagekun-tooltip').hide();
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
            $icon.find('.yomiagekun-tooltip').text('読み上げましょうか？').show();
        },
        
        showAccuracyMenu: function($icon) {
            if (this.isPlaying) return;
            
            $icon.find('.yomiagekun-accuracy-menu').addClass('show');
            $icon.find('.yomiagekun-tooltip').hide();
            this.updateActiveOption($icon);
        },
        
        hideAccuracyMenu: function($icon) {
            $icon.find('.yomiagekun-accuracy-menu').removeClass('show');
            if (!this.isPlaying) {
                $icon.find('.yomiagekun-tooltip').show();
            }
        },
        
        hideAllAccuracyMenus: function() {
            $('.yomiagekun-accuracy-menu').removeClass('show');
            if (!this.isPlaying) {
                $('.yomiagekun-tooltip').show();
            }
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
            
            // モバイルデバイスの検出
            var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // 既存の音声を停止
            this.stopReading($icon);
            
            // 完全モードの場合は長いテキストになる可能性があることを通知
            if (options.summary_accuracy === 'full' && text.length > 1000) {
                $icon.find('.yomiagekun-tooltip').text('長いテキストを読み上げ中...');
            }
            
            // 長いテキストの場合は分割して読み上げ（完全モードまたは詳細モード）
            if ((options.summary_accuracy === 'full' && text.length > 2000) || 
                (options.summary_accuracy === 'detailed' && text.length > 1500)) {
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
            
            // デバッグ用：利用可能な音声をコンソールに出力
            console.log('読み上げくん: 利用可能な音声数:', voices.length);
            console.log('読み上げくん: 利用可能な音声:', voices.map(function(v) { return v.name + ' (' + v.lang + ')'; }));
            
            // 日本語音声を優先して検索
            var japaneseVoices = voices.filter(function(voice) {
                return voice.lang.startsWith('ja');
            });
            
            console.log('読み上げくん: 日本語音声数:', japaneseVoices.length);
            console.log('読み上げくん: 日本語音声:', japaneseVoices.map(function(v) { return v.name; }));
            console.log('読み上げくん: 選択された性別:', options.voice_gender);
            
            if (japaneseVoices.length > 0) {
                if (options.voice_gender === 'male') {
                    // 男性音声を検索（より多くのパターンを試す）
                    selectedVoice = japaneseVoices.find(function(voice) {
                        var name = voice.name.toLowerCase();
                        return name.includes('male') || 
                               name.includes('男') ||
                               name.includes('masculine') ||
                               name.includes('man') ||
                               name.includes('男性');
                    });
                    
                    // 男性音声が見つからない場合は、最初の日本語音声を使用
                    if (!selectedVoice) {
                        selectedVoice = japaneseVoices[0];
                    }
                } else {
                    // 女性音声を検索（より多くのパターンを試す）
                    selectedVoice = japaneseVoices.find(function(voice) {
                        var name = voice.name.toLowerCase();
                        return name.includes('female') || 
                               name.includes('女') ||
                               name.includes('feminine') ||
                               name.includes('woman') ||
                               name.includes('女性') ||
                               name.includes('girl') ||
                               name.includes('lady') ||
                               name.includes('voice') ||
                               name.includes('speech');
                    });
                    
                    // 女性音声が見つからない場合は、音声のインデックスで判断
                    if (!selectedVoice && japaneseVoices.length > 1) {
                        // 通常、女性音声は男性音声より後に来ることが多い
                        // 複数の音声がある場合、後半の音声を試す
                        for (var i = Math.floor(japaneseVoices.length / 2); i < japaneseVoices.length; i++) {
                            var voice = japaneseVoices[i];
                            var name = voice.name.toLowerCase();
                            // 男性を示すキーワードが含まれていない場合は女性音声と判断
                            if (!name.includes('male') && 
                                !name.includes('男') && 
                                !name.includes('masculine') && 
                                !name.includes('man') && 
                                !name.includes('男性')) {
                                selectedVoice = voice;
                                break;
                            }
                        }
                        
                        // まだ見つからない場合は最後の音声を使用
                        if (!selectedVoice) {
                            selectedVoice = japaneseVoices[japaneseVoices.length - 1];
                        }
                    } else if (!selectedVoice && japaneseVoices.length === 1) {
                        // 音声が1つしかない場合は、その音声を使用
                        selectedVoice = japaneseVoices[0];
                    }
                }
            } else {
                // 日本語音声がない場合は、利用可能な最初の音声を使用
                selectedVoice = voices[0];
            }
            
            console.log('読み上げくん: 選択された音声:', selectedVoice ? selectedVoice.name + ' (' + selectedVoice.lang + ')' : 'なし');
            if (selectedVoice) {
                console.log('読み上げくん: 音声の詳細:', {
                    name: selectedVoice.name,
                    lang: selectedVoice.lang,
                    default: selectedVoice.default,
                    localService: selectedVoice.localService
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
                console.log('音声読み上げエラー:', event.error);
                self.showError($icon, '音声読み上げエラー: ' + event.error);
            };
            
            // モバイルでは少し遅延を入れて音声を開始
            if (isMobile) {
                setTimeout(function() {
                    speechSynthesis.speak(utterance);
                }, 100);
            } else {
                speechSynthesis.speak(utterance);
            }
        },
        
        speakLongText: function(text, $icon, options) {
            var self = this;
            // モバイルデバイスの検出
            var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // チャンクサイズを調整（詳細モードでは少し小さく、モバイルではさらに小さく）
            var chunkSize = options.summary_accuracy === 'detailed' ? 1500 : 2000;
            if (isMobile) {
                chunkSize = Math.min(chunkSize, 1000); // モバイルでは1000文字以下に制限
            }
            this.currentChunks = this.splitTextIntoChunks(text, chunkSize);
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
                
                // 日本語音声を優先して検索
                var japaneseVoices = voices.filter(function(voice) {
                    return voice.lang.startsWith('ja');
                });
                
                if (japaneseVoices.length > 0) {
                    if (options.voice_gender === 'male') {
                        // 男性音声を検索（より多くのパターンを試す）
                        selectedVoice = japaneseVoices.find(function(voice) {
                            var name = voice.name.toLowerCase();
                            return name.includes('male') || 
                                   name.includes('男') ||
                                   name.includes('masculine') ||
                                   name.includes('man') ||
                                   name.includes('男性');
                        });
                        
                        // 男性音声が見つからない場合は、最初の日本語音声を使用
                        if (!selectedVoice) {
                            selectedVoice = japaneseVoices[0];
                        }
                    } else {
                        // 女性音声を検索（より多くのパターンを試す）
                        selectedVoice = japaneseVoices.find(function(voice) {
                            var name = voice.name.toLowerCase();
                            return name.includes('female') || 
                                   name.includes('女') ||
                                   name.includes('feminine') ||
                                   name.includes('woman') ||
                                   name.includes('女性') ||
                                   name.includes('girl') ||
                                   name.includes('lady') ||
                                   name.includes('voice') ||
                                   name.includes('speech');
                        });
                        
                        // 女性音声が見つからない場合は、音声のインデックスで判断
                        if (!selectedVoice && japaneseVoices.length > 1) {
                            // 通常、女性音声は男性音声より後に来ることが多い
                            // 複数の音声がある場合、後半の音声を試す
                            for (var i = Math.floor(japaneseVoices.length / 2); i < japaneseVoices.length; i++) {
                                var voice = japaneseVoices[i];
                                var name = voice.name.toLowerCase();
                                // 男性を示すキーワードが含まれていない場合は女性音声と判断
                                if (!name.includes('male') && 
                                    !name.includes('男') && 
                                    !name.includes('masculine') && 
                                    !name.includes('man') && 
                                    !name.includes('男性')) {
                                    selectedVoice = voice;
                                    break;
                                }
                            }
                            
                            // まだ見つからない場合は最後の音声を使用
                            if (!selectedVoice) {
                                selectedVoice = japaneseVoices[japaneseVoices.length - 1];
                            }
                        } else if (!selectedVoice && japaneseVoices.length === 1) {
                            // 音声が1つしかない場合は、その音声を使用
                            selectedVoice = japaneseVoices[0];
                        }
                    }
                } else {
                    // 日本語音声がない場合は、利用可能な最初の音声を使用
                    selectedVoice = voices[0];
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
                    console.log('音声読み上げエラー:', event.error);
                    self.showError($icon, '音声読み上げエラー: ' + event.error);
                };
                
                // モバイルでは少し遅延を入れて音声を開始
                if (isMobile) {
                    setTimeout(function() {
                        speechSynthesis.speak(utterance);
                    }, 100);
                } else {
                    speechSynthesis.speak(utterance);
                }
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
                
                // 現在のチャンクに文を追加した場合の長さを計算
                var potentialLength = currentChunk.length + (currentChunk.length > 0 ? '。' : '') + sentence;
                
                if (potentialLength > chunkSize && currentChunk.length > 0) {
                    // 現在のチャンクを保存して新しいチャンクを開始
                    chunks.push(currentChunk.trim());
                    currentChunk = sentence;
                } else {
                    // 現在のチャンクに文を追加
                    currentChunk += (currentChunk.length > 0 ? '。' : '') + sentence;
                }
            }
            
            // 最後のチャンクを追加
            if (currentChunk.trim().length > 0) {
                chunks.push(currentChunk.trim());
            }
            
            // デバッグ用：チャンク数をログ出力
            console.log('読み上げくん: テキストを' + chunks.length + '個のチャンクに分割しました');
            
            return chunks;
        },
        
        showError: function($icon, message) {
            $icon.removeClass('reading completed').addClass('error');
            $icon.find('.yomiagekun-tooltip').text(message).show();
            
            // 3秒後に元の状態に戻す
            setTimeout(function() {
                $icon.removeClass('error');
                $icon.find('.yomiagekun-tooltip').text('もう一度お試しください').show();
            }, 3000);
        }
    };
    
    // DOM読み込み完了後に初期化
    $(document).ready(function() {
        console.log('読み上げくんプラグイン: 初期化開始');
        YomiageKun.init();
        console.log('読み上げくんプラグイン: 初期化完了');
    });
    
    // 音声リストの読み込み待ち（一部のブラウザで必要）
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = function() {
            // 音声リストが更新された時の処理
            console.log('音声リストが更新されました:', speechSynthesis.getVoices().length + '個の音声が利用可能');
        };
    }
    
    // 音声リストの読み込みを待つ関数
    function waitForVoices(callback) {
        var voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
            callback(voices);
        } else {
            setTimeout(function() {
                waitForVoices(callback);
            }, 100);
        }
    }
    
})(jQuery);
