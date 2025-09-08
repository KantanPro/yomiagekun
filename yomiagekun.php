<?php
/**
 * Plugin Name: 読み上げくん
 * Plugin URI: https://github.com/your-username/yomiagekun
 * Description: ブログの内容をAIが要約して読み上げてくれるアクセシビリティプラグイン
 * Version: 1.0.1
 * Author: Your Name
 * Author URI: https://your-website.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: yomiagekun
 * Domain Path: /languages
 * Requires at least: 5.0
 * Tested up to: 6.4
 * Requires PHP: 7.4
 * Network: false
 * GitHub Plugin URI: your-username/yomiagekun
 */

// 直接アクセスを防ぐ
if (!defined('ABSPATH')) {
    exit;
}

// プラグインの定数定義
define('YOMIAGEKUN_VERSION', '1.0.1');
define('YOMIAGEKUN_PLUGIN_URL', plugin_dir_url(__FILE__));
define('YOMIAGEKUN_PLUGIN_PATH', plugin_dir_path(__FILE__));
define('YOMIAGEKUN_PLUGIN_BASENAME', plugin_basename(__FILE__));

// メインクラス
class YomiageKun {
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        add_action('init', array($this, 'init'));
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'admin_init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_action('wp_ajax_yomiagekun_summarize', array($this, 'ajax_summarize'));
        add_action('wp_ajax_nopriv_yomiagekun_summarize', array($this, 'ajax_summarize'));
        
        // プラグイン有効化時の処理
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
        
        // GitHub更新通知
        add_action('init', array($this, 'github_updater'));
    }
    
    public function init() {
        load_plugin_textdomain('yomiagekun', false, dirname(plugin_basename(__FILE__)) . '/languages');
    }
    
    public function activate() {
        // デフォルト設定を保存
        $default_options = array(
            'openai_api_key' => '',
            'voice_gender' => 'female',
            'speech_rate' => 1.0,
            'icon_url' => YOMIAGEKUN_PLUGIN_URL . 'assets/icon.png',
            'icon_position' => 'bottom-right',
            'summary_accuracy' => 'simple',
            'enabled' => true
        );
        
        add_option('yomiagekun_options', $default_options);
    }
    
    public function deactivate() {
        // クリーンアップ処理（必要に応じて）
    }
    
    public function add_admin_menu() {
        add_options_page(
            '読み上げくん設定',
            '読み上げくん',
            'manage_options',
            'yomiagekun',
            array($this, 'admin_page')
        );
    }
    
    public function admin_init() {
        register_setting('yomiagekun_options', 'yomiagekun_options', array($this, 'validate_options'));
        
        add_settings_section(
            'yomiagekun_main',
            '基本設定',
            null,
            'yomiagekun'
        );
        
        add_settings_field(
            'openai_api_key',
            'OpenAI API Key',
            array($this, 'api_key_field'),
            'yomiagekun',
            'yomiagekun_main'
        );
        
        add_settings_field(
            'voice_gender',
            '音声の性別',
            array($this, 'voice_gender_field'),
            'yomiagekun',
            'yomiagekun_main'
        );
        
        add_settings_field(
            'speech_rate',
            '読み上げ速度',
            array($this, 'speech_rate_field'),
            'yomiagekun',
            'yomiagekun_main'
        );
        
        add_settings_field(
            'summary_accuracy',
            '要約の精度',
            array($this, 'summary_accuracy_field'),
            'yomiagekun',
            'yomiagekun_main'
        );
        
        add_settings_field(
            'icon_upload',
            'アイコン画像',
            array($this, 'icon_upload_field'),
            'yomiagekun',
            'yomiagekun_main'
        );
        
        add_settings_field(
            'icon_position',
            'アイコンの表示位置',
            array($this, 'icon_position_field'),
            'yomiagekun',
            'yomiagekun_main'
        );
        
        add_settings_field(
            'enabled',
            'プラグインを有効にする',
            array($this, 'enabled_field'),
            'yomiagekun',
            'yomiagekun_main'
        );
    }
    
    public function admin_page() {
        $options = get_option('yomiagekun_options');
        ?>
        <div class="wrap">
            <h1>読み上げくん設定</h1>
            
            <form method="post" action="options.php" enctype="multipart/form-data">
                <?php
                settings_fields('yomiagekun_options');
                do_settings_sections('yomiagekun');
                submit_button();
                ?>
            </form>
        </div>
        <?php
    }
    
    public function api_key_field() {
        $options = get_option('yomiagekun_options');
        $value = isset($options['openai_api_key']) ? $options['openai_api_key'] : '';
        echo '<input type="password" name="yomiagekun_options[openai_api_key]" value="' . esc_attr($value) . '" class="regular-text" />';
        echo '<p class="description">OpenAI API Keyを入力してください。</p>';
    }
    
    public function voice_gender_field() {
        $options = get_option('yomiagekun_options');
        $value = isset($options['voice_gender']) ? $options['voice_gender'] : 'female';
        ?>
        <select name="yomiagekun_options[voice_gender]">
            <option value="female" <?php selected($value, 'female'); ?>>女性</option>
            <option value="male" <?php selected($value, 'male'); ?>>男性</option>
        </select>
        <?php
    }
    
    public function speech_rate_field() {
        $options = get_option('yomiagekun_options');
        $value = isset($options['speech_rate']) ? $options['speech_rate'] : 1.0;
        echo '<input type="range" name="yomiagekun_options[speech_rate]" min="0.5" max="2.0" step="0.1" value="' . esc_attr($value) . '" oninput="this.nextElementSibling.value = this.value" />';
        echo '<output>' . esc_attr($value) . '</output>';
        echo '<p class="description">読み上げ速度を調整してください（0.5倍〜2.0倍）</p>';
    }
    
    public function summary_accuracy_field() {
        $options = get_option('yomiagekun_options');
        $value = isset($options['summary_accuracy']) ? $options['summary_accuracy'] : 'simple';
        ?>
        <select name="yomiagekun_options[summary_accuracy]">
            <option value="simple" <?php selected($value, 'simple'); ?>>簡略（現在の仕様）</option>
            <option value="detailed" <?php selected($value, 'detailed'); ?>>詳細</option>
            <option value="full" <?php selected($value, 'full'); ?>>完全（全テキストを読み上げ）</option>
        </select>
        <p class="description">要約の詳細度を選択してください。簡略は短く要点のみ、詳細はより詳しい内容を含み、完全は要約せずに全テキストを読み上げます。</p>
        <?php
    }
    
    public function icon_upload_field() {
        $options = get_option('yomiagekun_options');
        $value = isset($options['icon_url']) ? $options['icon_url'] : YOMIAGEKUN_PLUGIN_URL . 'assets/icon.png';
        ?>
        <input type="file" name="yomiagekun_icon" accept="image/*" />
        <?php if ($value): ?>
            <p>現在のアイコン:</p>
            <img src="<?php echo esc_url($value); ?>" style="max-width: 100px; max-height: 100px;" />
        <?php endif; ?>
        <p class="description">アイコン画像をアップロードしてください（推奨サイズ: 64x64px）</p>
        <?php
    }
    
    public function icon_position_field() {
        $options = get_option('yomiagekun_options');
        $value = isset($options['icon_position']) ? $options['icon_position'] : 'bottom-right';
        ?>
        <select name="yomiagekun_options[icon_position]">
            <option value="top-right" <?php selected($value, 'top-right'); ?>>右上</option>
            <option value="top-left" <?php selected($value, 'top-left'); ?>>左上</option>
            <option value="middle-right" <?php selected($value, 'middle-right'); ?>>中右</option>
            <option value="middle-left" <?php selected($value, 'middle-left'); ?>>中左</option>
            <option value="bottom-right" <?php selected($value, 'bottom-right'); ?>>右下</option>
            <option value="bottom-left" <?php selected($value, 'bottom-left'); ?>>左下</option>
        </select>
        <p class="description">フローティングアイコンの表示位置を選択してください</p>
        <?php
    }
    
    public function enabled_field() {
        $options = get_option('yomiagekun_options');
        $value = isset($options['enabled']) ? $options['enabled'] : true;
        echo '<input type="checkbox" name="yomiagekun_options[enabled]" value="1" ' . checked(1, $value, false) . ' />';
        echo '<p class="description">プラグインを有効にします</p>';
    }
    
    public function validate_options($input) {
        $output = array();
        
        // デバッグ用：入力された設定をログ出力
        error_log('読み上げくん: 設定保存開始 - 入力データ: ' . print_r($input, true));
        
        if (isset($input['openai_api_key'])) {
            $output['openai_api_key'] = sanitize_text_field($input['openai_api_key']);
        }
        
        if (isset($input['voice_gender'])) {
            $output['voice_gender'] = in_array($input['voice_gender'], array('male', 'female')) ? $input['voice_gender'] : 'female';
            error_log('読み上げくん: 音声性別設定: ' . $output['voice_gender']);
        }
        
        if (isset($input['speech_rate'])) {
            $output['speech_rate'] = floatval($input['speech_rate']);
            if ($output['speech_rate'] < 0.5) $output['speech_rate'] = 0.5;
            if ($output['speech_rate'] > 2.0) $output['speech_rate'] = 2.0;
            error_log('読み上げくん: 読み上げ速度設定: ' . $output['speech_rate']);
        }
        
        if (isset($input['icon_position'])) {
            $valid_positions = array('top-right', 'top-left', 'middle-right', 'middle-left', 'bottom-right', 'bottom-left');
            $output['icon_position'] = in_array($input['icon_position'], $valid_positions) ? $input['icon_position'] : 'bottom-right';
            error_log('読み上げくん: アイコン位置設定: ' . $output['icon_position']);
        }
        
        if (isset($input['summary_accuracy'])) {
            $output['summary_accuracy'] = in_array($input['summary_accuracy'], array('simple', 'detailed', 'full')) ? $input['summary_accuracy'] : 'simple';
            error_log('読み上げくん: 要約精度設定: ' . $output['summary_accuracy']);
        }
        
        if (isset($input['enabled'])) {
            $output['enabled'] = (bool) $input['enabled'];
        } else {
            $output['enabled'] = false;
        }
        
        // アイコンアップロード処理
        if (!empty($_FILES['yomiagekun_icon']['name'])) {
            $upload = wp_handle_upload($_FILES['yomiagekun_icon'], array('test_form' => false));
            if (!isset($upload['error'])) {
                $output['icon_url'] = $upload['url'];
            }
        } else {
            $output['icon_url'] = isset($input['icon_url']) ? $input['icon_url'] : YOMIAGEKUN_PLUGIN_URL . 'assets/icon.png';
        }
        
        // デバッグ用：保存される設定をログ出力
        error_log('読み上げくん: 設定保存完了 - 保存データ: ' . print_r($output, true));
        
        return $output;
    }
    
    public function enqueue_scripts() {
        $options = get_option('yomiagekun_options');
        
        if (!isset($options['enabled']) || !$options['enabled']) {
            return;
        }
        
        // 単一記事ページでのみ表示
        if (!is_single()) {
            return;
        }
        
        wp_enqueue_script('yomiagekun', YOMIAGEKUN_PLUGIN_URL . 'assets/yomiagekun.js', array('jquery'), YOMIAGEKUN_VERSION, true);
        wp_enqueue_style('yomiagekun', YOMIAGEKUN_PLUGIN_URL . 'assets/yomiagekun.css', array(), YOMIAGEKUN_VERSION);
        
        // デバッグ用：設定をログ出力
        error_log('読み上げくん: フロントエンドに送信する設定: ' . print_r($options, true));
        
        wp_localize_script('yomiagekun', 'yomiagekun_ajax', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('yomiagekun_nonce'),
            'options' => $options,
            'post_id' => get_the_ID()
        ));
    }
    
    public function ajax_summarize() {
        check_ajax_referer('yomiagekun_nonce', 'nonce');
        
        $options = get_option('yomiagekun_options');
        $post_id = intval($_POST['post_id']);
        
        if (!$post_id || !isset($options['openai_api_key']) || empty($options['openai_api_key'])) {
            wp_die('Invalid request');
        }
        
        $post = get_post($post_id);
        if (!$post) {
            wp_die('Post not found');
        }
        
        // コンテンツを取得
        $content = strip_tags($post->post_content);
        
        // フロントエンドから送信された精度を優先、なければ管理画面の設定を使用
        $summary_accuracy = 'simple';
        if (isset($_POST['accuracy']) && in_array($_POST['accuracy'], array('simple', 'detailed', 'full'))) {
            $summary_accuracy = $_POST['accuracy'];
        } elseif (isset($options['summary_accuracy'])) {
            $summary_accuracy = $options['summary_accuracy'];
        }
        
        // 完全モードの場合は要約せずに全テキストを返す
        if ($summary_accuracy === 'full') {
            // 全テキストをそのまま返す（HTMLタグは除去済み）
            $summary = $content;
        } else {
            // 精度設定に応じてコンテンツの長さを調整
            if ($summary_accuracy === 'detailed') {
                $content = wp_trim_words($content, 500); // 詳細モードでは500語まで
            } else {
                $content = wp_trim_words($content, 200); // 簡略モードでは200語まで
            }
            
            // OpenAI APIで要約
            $summary = $this->get_openai_summary($content, $options['openai_api_key'], $summary_accuracy);
        }
        
        wp_send_json_success(array('summary' => $summary));
    }
    
    private function get_openai_summary($content, $api_key, $accuracy = 'simple') {
        // 精度設定に応じてプロンプトとトークン数を調整
        if ($accuracy === 'detailed') {
            $prompt = "以下のブログ記事を、視覚障害者の方にも分かりやすく、詳細に要約してください。タイプミスがあれば修正し、重要なポイントを具体的に説明し、記事の構成や流れも含めてまとめてください：\n\n" . $content;
            $max_tokens = 400;
        } else {
            $prompt = "以下のブログ記事を、視覚障害者の方にも分かりやすく、短く要約してください。タイプミスがあれば修正し、重要なポイントを簡潔にまとめてください：\n\n" . $content;
            $max_tokens = 200;
        }
        
        $response = wp_remote_post('https://api.openai.com/v1/chat/completions', array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type' => 'application/json',
            ),
            'body' => json_encode(array(
                'model' => 'gpt-3.5-turbo',
                'messages' => array(
                    array(
                        'role' => 'user',
                        'content' => $prompt
                    )
                ),
                'max_tokens' => $max_tokens,
                'temperature' => 0.7
            )),
            'timeout' => 30
        ));
        
        if (is_wp_error($response)) {
            return '要約の生成中にエラーが発生しました。';
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (isset($data['choices'][0]['message']['content'])) {
            return trim($data['choices'][0]['message']['content']);
        }
        
        return '要約の生成に失敗しました。';
    }
    
    public function github_updater() {
        if (!class_exists('GitHub_Updater')) {
            require_once YOMIAGEKUN_PLUGIN_PATH . 'includes/github-updater.php';
        }
    }
}

// プラグインを初期化
YomiageKun::get_instance();
