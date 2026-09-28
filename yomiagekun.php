<?php
/**
 * Plugin Name: 読み上げくん
 * Plugin URI: https://github.com/KantanPro/yomiagekun
 * Description: ブログの内容をAIが要約して読み上げてくれるアクセシビリティプラグイン
 * Version: 1.1.1
 * Author: KantanPro
 * Author URI: https://www.kantanpro.com/
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: yomiagekun
 * Domain Path: /languages
 * Requires at least: 5.0
 * Tested up to: 6.8
 * Requires PHP: 7.4
 * Network: false
 * GitHub Plugin URI: KantanPro/yomiagekun
 */

// 直接アクセスを防ぐ
if (!defined('ABSPATH')) {
    exit;
}

// プラグインの定数定義
define('YOMIAGEKUN_VERSION', '1.1.1');
define('YOMIAGEKUN_PLUGIN_FILE', __FILE__);
define('YOMIAGEKUN_PLUGIN_URL', plugin_dir_url(__FILE__));
define('YOMIAGEKUN_PLUGIN_PATH', plugin_dir_path(__FILE__));
define('YOMIAGEKUN_PLUGIN_BASENAME', plugin_basename(__FILE__));

// メインクラス
class YomiageKun {

    const DEFAULT_MODEL = 'gpt-4o-mini';

    // 要約キャッシュの post meta（モードごと）。uninstall.php でも同じ名前で消す
    const SUMMARY_META_PREFIX = '_yomiagekun_summary_';

    // プロンプトや整形を変えたら上げる（キャッシュを作り直させるため）
    const SUMMARY_FORMAT_VERSION = 2;

    // AI 要約の生成（キャッシュに無いときだけ）を IP ごとにこの回数まで
    const RATE_LIMIT_COUNT = 20;
    const RATE_LIMIT_WINDOW = 600;

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

        // GitHub更新通知
        add_action('init', array($this, 'github_updater'));
    }

    public function init() {
        load_plugin_textdomain('yomiagekun', false, dirname(plugin_basename(__FILE__)) . '/languages');
    }

    public static function default_options() {
        return array(
            'openai_api_key' => '',
            'openai_model' => self::DEFAULT_MODEL,
            'voice_gender' => 'female',
            'speech_rate' => 1.0,
            'icon_url' => YOMIAGEKUN_PLUGIN_URL . 'assets/icon.png',
            'icon_position' => 'bottom-right',
            'summary_accuracy' => 'simple',
            'enabled_categories' => array(),
            'enabled' => true
        );
    }

    /**
     * 保存済みの設定に、後から増えた項目の初期値を補って返す
     */
    public static function get_options() {
        $options = get_option('yomiagekun_options');
        if (!is_array($options)) {
            $options = array();
        }
        return array_merge(self::default_options(), $options);
    }

    public function activate() {
        add_option('yomiagekun_options', self::default_options());
    }

    public function add_admin_menu() {
        add_menu_page(
            '読み上げくん設定',
            '読み上げくん',
            'manage_options',
            'yomiagekun',
            array($this, 'admin_page'),
            'dashicons-controls-volumeon',
            30
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
            'openai_model',
            '要約に使うモデル',
            array($this, 'model_field'),
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
            'enabled_categories',
            '表示するカテゴリー',
            array($this, 'enabled_categories_field'),
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
        $options = self::get_options();
        $value = $options['openai_api_key'];

        // 既存のAPIキーがある場合はマスク表示
        $display_value = '';
        if (!empty($value)) {
            $display_value = str_repeat('*', max(0, strlen($value) - 4)) . substr($value, -4);
        }

        echo '<input type="password" name="yomiagekun_options[openai_api_key]" value="' . esc_attr($display_value) . '" class="regular-text" placeholder="sk-proj-..." autocomplete="off" />';
        echo '<p class="description">OpenAI API Keyを入力してください。既存のキーを変更する場合は、新しいキーを入力してください。</p>';
        echo '<p class="description">未設定のときは「完全（全文を読み上げ）」だけが使えます。</p>';

        // 設定エラーの表示
        settings_errors('yomiagekun_options');
    }

    public function model_field() {
        $options = self::get_options();
        echo '<input type="text" name="yomiagekun_options[openai_model]" value="' . esc_attr($options['openai_model']) . '" class="regular-text" placeholder="' . esc_attr(self::DEFAULT_MODEL) . '" />';
        echo '<p class="description">OpenAI のモデル名。空欄なら ' . esc_html(self::DEFAULT_MODEL) . ' を使います。変更すると要約は作り直されます。</p>';
    }

    public function voice_gender_field() {
        $options = self::get_options();
        $value = $options['voice_gender'];
        ?>
        <select name="yomiagekun_options[voice_gender]">
            <option value="female" <?php selected($value, 'female'); ?>>女性</option>
            <option value="male" <?php selected($value, 'male'); ?>>男性</option>
        </select>
        <p class="description">声はブラウザに入っている日本語音声から選びます。該当する声が無い端末では、使える日本語音声で読みます。</p>
        <?php
    }

    public function speech_rate_field() {
        $options = self::get_options();
        $value = $options['speech_rate'];
        echo '<input type="range" name="yomiagekun_options[speech_rate]" min="0.5" max="2.0" step="0.1" value="' . esc_attr($value) . '" oninput="this.nextElementSibling.value = this.value" />';
        echo '<output>' . esc_html($value) . '</output>';
        echo '<p class="description">最初の読み上げ速度（0.5倍〜2.0倍）。訪問者は画面上で速さを変えられ、その選択はブラウザに記憶されます。</p>';
    }

    public function summary_accuracy_field() {
        $options = self::get_options();
        $value = $options['summary_accuracy'];
        ?>
        <select name="yomiagekun_options[summary_accuracy]">
            <option value="simple" <?php selected($value, 'simple'); ?>>簡略</option>
            <option value="detailed" <?php selected($value, 'detailed'); ?>>詳細</option>
            <option value="full" <?php selected($value, 'full'); ?>>完全（全テキストを読み上げ）</option>
        </select>
        <p class="description">最初に選ばれている読み方です。簡略は短く要点のみ、詳細はより詳しい内容を含み、完全は要約せずに全テキストを読み上げます。訪問者は画面上で切り替えられます。</p>
        <?php
    }

    public function icon_upload_field() {
        $options = self::get_options();
        $value = $options['icon_url'];
        ?>
        <input type="file" name="yomiagekun_icon" accept="image/png,image/jpeg,image/gif,image/webp" />
        <?php if ($value): ?>
            <p>現在のアイコン:</p>
            <img src="<?php echo esc_url($value); ?>" alt="" style="max-width: 100px; max-height: 100px;" />
        <?php endif; ?>
        <p class="description">アイコン画像をアップロードしてください（PNG/JPEG/GIF/WebP、推奨サイズ: 64x64px）</p>
        <?php
    }

    public function icon_position_field() {
        $options = self::get_options();
        $value = $options['icon_position'];
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

    public function enabled_categories_field() {
        $options = self::get_options();
        $selected_categories = array_map('intval', (array) $options['enabled_categories']);

        // カテゴリー一覧を取得
        $categories = get_categories(array(
            'hide_empty' => false,
            'orderby' => 'name',
            'order' => 'ASC'
        ));

        if (empty($categories)) {
            echo '<p>カテゴリーが登録されていません。</p>';
            return;
        }

        echo '<div style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px;">';
        foreach ($categories as $category) {
            $checked = in_array((int) $category->term_id, $selected_categories, true) ? 'checked' : '';
            echo '<label style="display: block; margin-bottom: 5px;">';
            echo '<input type="checkbox" name="yomiagekun_options[enabled_categories][]" value="' . esc_attr($category->term_id) . '" ' . $checked . ' /> ';
            echo esc_html($category->name) . ' (' . intval($category->count) . '件)';
            echo '</label>';
        }
        echo '</div>';
        echo '<p class="description">読み上げくんを表示するカテゴリーを選択してください。何も選択しない場合は全てのカテゴリーで表示されます。</p>';
    }

    public function enabled_field() {
        $options = self::get_options();
        echo '<input type="checkbox" name="yomiagekun_options[enabled]" value="1" ' . checked(true, (bool) $options['enabled'], false) . ' />';
        echo '<p class="description">プラグインを有効にします</p>';
    }

    public function validate_options($input) {
        // オプションが未作成だと update_option → add_option で 2 回呼ばれる。
        // アイコンを二重にアップロードしないよう、同じリクエスト内では 1 回目の結果を返す
        static $validated = null;
        if (null !== $validated) {
            return $validated;
        }

        $input = is_array($input) ? $input : array();
        $existing = self::get_options();
        $output = array();

        if (isset($input['openai_api_key'])) {
            $api_key = trim(sanitize_text_field($input['openai_api_key']));

            if (strpos($api_key, '*') !== false) {
                // マスク表示された値（***...）の場合は既存のキーを保持
                $output['openai_api_key'] = $existing['openai_api_key'];
            } elseif ($api_key !== '' && (!preg_match('/^sk-[a-zA-Z0-9\-_]+$/', $api_key) || strlen($api_key) < 20)) {
                add_settings_error('yomiagekun_options', 'invalid_api_key', 'OpenAI API Keyの形式が正しくありません。sk-で始まる文字列を入力してください。');
                // 打ち間違いで既存の正しいキーを消さない
                $output['openai_api_key'] = $existing['openai_api_key'];
            } else {
                $output['openai_api_key'] = $api_key;
            }
        } else {
            $output['openai_api_key'] = $existing['openai_api_key'];
        }

        $model = isset($input['openai_model']) ? trim(sanitize_text_field($input['openai_model'])) : '';
        $output['openai_model'] = preg_match('/^[a-zA-Z0-9.\-_:]{1,64}$/', $model) ? $model : self::DEFAULT_MODEL;

        $output['voice_gender'] = (isset($input['voice_gender']) && in_array($input['voice_gender'], array('male', 'female'), true)) ? $input['voice_gender'] : 'female';

        $rate = isset($input['speech_rate']) ? floatval($input['speech_rate']) : 1.0;
        $output['speech_rate'] = min(2.0, max(0.5, $rate));

        $valid_positions = array('top-right', 'top-left', 'middle-right', 'middle-left', 'bottom-right', 'bottom-left');
        $output['icon_position'] = (isset($input['icon_position']) && in_array($input['icon_position'], $valid_positions, true)) ? $input['icon_position'] : 'bottom-right';

        $output['summary_accuracy'] = (isset($input['summary_accuracy']) && in_array($input['summary_accuracy'], array('simple', 'detailed', 'full'), true)) ? $input['summary_accuracy'] : 'simple';

        $output['enabled_categories'] = isset($input['enabled_categories']) ? array_values(array_filter(array_map('intval', (array) $input['enabled_categories']))) : array();

        $output['enabled'] = !empty($input['enabled']);

        // アイコンアップロード処理（画像のみ受け付ける）。失敗・未選択なら既存のアイコンを保持
        $output['icon_url'] = $existing['icon_url'];
        if (!empty($_FILES['yomiagekun_icon']['name']) && current_user_can('manage_options')) {
            if (!function_exists('wp_handle_upload')) {
                require_once ABSPATH . 'wp-admin/includes/file.php';
            }
            $upload = wp_handle_upload($_FILES['yomiagekun_icon'], array(
                'test_form' => false,
                'mimes' => array(
                    'jpg|jpeg|jpe' => 'image/jpeg',
                    'png' => 'image/png',
                    'gif' => 'image/gif',
                    'webp' => 'image/webp',
                ),
            ));
            if (!isset($upload['error'])) {
                $output['icon_url'] = $upload['url'];
            } else {
                add_settings_error('yomiagekun_options', 'icon_upload', 'アイコン画像をアップロードできませんでした: ' . $upload['error']);
            }
        }

        $validated = $output;
        return $output;
    }

    /**
     * この記事で読み上げくんを使ってよいか（公開済み・パスワードなし・対象カテゴリー）
     */
    public function is_post_allowed($post) {
        $post = get_post($post);
        if (!$post || $post->post_type !== 'post') {
            return false;
        }
        if (get_post_status($post) !== 'publish' || post_password_required($post)) {
            return false;
        }

        $options = self::get_options();
        $enabled_categories = array_map('intval', (array) $options['enabled_categories']);
        if (!empty($enabled_categories)) {
            $post_categories = array_map('intval', wp_get_post_categories($post->ID));
            if (!array_intersect($post_categories, $enabled_categories)) {
                return false;
            }
        }

        return true;
    }

    public function enqueue_scripts() {
        $options = self::get_options();

        if (empty($options['enabled'])) {
            return;
        }

        // 単一記事ページでのみ表示
        if (!is_singular('post')) {
            return;
        }

        $post_id = get_queried_object_id();
        if (!$this->is_post_allowed($post_id)) {
            return;
        }

        wp_enqueue_script('yomiagekun', YOMIAGEKUN_PLUGIN_URL . 'assets/yomiagekun.js', array(), YOMIAGEKUN_VERSION, true);
        wp_enqueue_style('yomiagekun', YOMIAGEKUN_PLUGIN_URL . 'assets/yomiagekun.css', array(), YOMIAGEKUN_VERSION);

        // 画面に必要な値だけを渡す（API キーは絶対に入れない）
        wp_localize_script('yomiagekun', 'yomiagekunConfig', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'postId' => (int) $post_id,
            'hasAi' => $options['openai_api_key'] !== '' ? '1' : '',
            'mode' => $options['summary_accuracy'],
            'rate' => (string) $options['speech_rate'],
            'gender' => $options['voice_gender'],
            'iconUrl' => esc_url_raw($options['icon_url']),
            'position' => $options['icon_position'],
        ));
    }

    /**
     * 公開記事の本文（または要約）を読み上げ用テキストで返す。
     * 返すのは公開済みの記事だけなので、ページキャッシュで期限切れになる nonce は使わない。
     * 課金の上限は「記事×モードごとのキャッシュ」と「IP ごとの生成回数制限」で抑える。
     */
    public function ajax_summarize() {
        $post_id = isset($_POST['post_id']) ? absint($_POST['post_id']) : 0;
        $accuracy = isset($_POST['accuracy']) ? sanitize_key(wp_unslash($_POST['accuracy'])) : '';

        $options = self::get_options();
        if (!$options['enabled'] || !$post_id || !$this->is_post_allowed($post_id)) {
            wp_send_json_error(array('message' => 'この記事は読み上げできません。'), 404);
        }

        if (!in_array($accuracy, array('simple', 'detailed', 'full'), true)) {
            $accuracy = $options['summary_accuracy'];
        }

        $post = get_post($post_id);
        $text = $this->get_readable_text($post);
        if ($text === '') {
            wp_send_json_error(array('message' => '読み上げる本文がありません。'), 404);
        }

        // 完全モードは要約せずに全テキストを返す（タイトルから読む）
        if ($accuracy === 'full') {
            wp_send_json_success(array('text' => $this->get_title_text($post) . "。\n" . $text));
        }

        if ($options['openai_api_key'] === '') {
            wp_send_json_error(array('message' => '要約機能が設定されていません。「完全」で読み上げてください。'), 400);
        }

        $model = $options['openai_model'] !== '' ? $options['openai_model'] : self::DEFAULT_MODEL;
        $cache_key = self::SUMMARY_META_PREFIX . $accuracy;
        $cache_hash = md5($post->post_modified_gmt . '|' . $model . '|' . self::SUMMARY_FORMAT_VERSION);

        $cached = get_post_meta($post_id, $cache_key, true);
        if (is_array($cached) && isset($cached['hash'], $cached['text']) && $cached['hash'] === $cache_hash) {
            wp_send_json_success(array('text' => $cached['text']));
        }

        if (!$this->consume_rate_limit()) {
            wp_send_json_error(array('message' => '混み合っています。しばらくしてからもう一度お試しください。'), 429);
        }

        $summary = $this->get_summary($this->get_title_text($post), $text, $accuracy, $options['openai_api_key'], $model);
        if (is_wp_error($summary)) {
            $message = $summary->get_error_message();
            // 原因（キーの誤りなど）は管理者にだけ見せる
            $reason = $summary->get_error_data();
            if (is_string($reason) && $reason !== '' && current_user_can('manage_options')) {
                $message .= '（管理者向け: ' . $reason . '）';
            }
            // 502/504 は Cloudflare が自前のエラーページに差し替えて本文が届かないため 500 で返す
            wp_send_json_error(array('message' => $message), 500);
        }

        update_post_meta($post_id, $cache_key, array('hash' => $cache_hash, 'text' => $summary));

        wp_send_json_success(array('text' => $summary));
    }

    /**
     * IP ごとの要約生成回数を数え、上限内なら true
     */
    private function consume_rate_limit() {
        // 偽装できるヘッダーは信用せず REMOTE_ADDR だけで数える
        $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : 'unknown';
        $key = 'yomiagekun_rl_' . md5($ip);

        $count = (int) get_transient($key);
        if ($count >= self::RATE_LIMIT_COUNT) {
            return false;
        }
        set_transient($key, $count + 1, self::RATE_LIMIT_WINDOW);
        return true;
    }

    private function get_title_text($post) {
        return trim(html_entity_decode(wp_strip_all_tags(get_the_title($post)), ENT_QUOTES, 'UTF-8'));
    }

    /**
     * 本文から読み上げに向かない部分（ショートコード・HTML・文字参照）を取り除く
     */
    public function get_readable_text($post) {
        $content = (string) $post->post_content;

        // 登録済みのショートコードを外し、未登録のもの（[foo ...] / [/foo]）も消す
        $content = strip_shortcodes($content);
        $content = preg_replace('/\[\/?[a-zA-Z][a-zA-Z0-9_\-]*(?:\s[^\]]*)?\]/u', '', $content);

        // 段落や見出しの切れ目は改行として残す（文の区切りに使う）
        $content = preg_replace('#<(br|/p|/h[1-6]|/li|/div|/tr|/blockquote|/figcaption)\b[^>]*>#i', "\n", $content);
        $content = wp_strip_all_tags($content);
        $content = html_entity_decode($content, ENT_QUOTES, 'UTF-8');

        // 空白を整える（全角スペースも対象）
        $content = preg_replace('/[ \t\x{3000}\x{00A0}]+/u', ' ', $content);
        $content = preg_replace('/ *\n[\s]*/u', "\n", $content);

        return trim($content);
    }

    /**
     * OpenAI で読み上げ用の要約を作る。別の AI に対応するときはここだけを差し替える
     *
     * @return string|WP_Error
     */
    private function get_summary($title, $content, $accuracy, $api_key, $model) {
        if ($accuracy === 'detailed') {
            $content = mb_substr($content, 0, 12000);
            $length = '800〜1200字程度で、記事の流れに沿って重要なポイントを具体的に説明してください。';
            $max_tokens = 2000;
        } else {
            $content = mb_substr($content, 0, 6000);
            $length = '3〜5文、300字程度で、記事の要点だけをまとめてください。';
            $max_tokens = 800;
        }

        $system = 'あなたはブログ記事を音声で聞く人のために要約を作る編集者です。'
            . '出力はそのまま音声合成で読み上げられます。'
            . '見出し記号、箇条書き、番号付きリスト、太字などの Markdown、絵文字、URL は使わず、話し言葉として自然な地の文だけで書いてください。'
            . '「この記事では」などの前置きは短くし、記事に書かれていないことは付け加えないでください。';

        $user = $length . "\n\n記事タイトル: " . $title . "\n\n本文:\n" . $content;

        $response = wp_remote_post('https://api.openai.com/v1/chat/completions', array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type' => 'application/json',
            ),
            'body' => wp_json_encode(array(
                'model' => $model,
                'messages' => array(
                    array('role' => 'system', 'content' => $system),
                    array('role' => 'user', 'content' => $user),
                ),
                'max_completion_tokens' => $max_tokens,
            )),
            'timeout' => 60
        ));

        if (is_wp_error($response)) {
            return new WP_Error('yomiagekun_http', '要約の生成中に通信エラーが発生しました。', $response->get_error_message());
        }

        $data = json_decode(wp_remote_retrieve_body($response), true);
        $summary = isset($data['choices'][0]['message']['content']) ? (string) $data['choices'][0]['message']['content'] : '';

        if (wp_remote_retrieve_response_code($response) !== 200 || $summary === '') {
            $reason = 'OpenAI HTTP ' . wp_remote_retrieve_response_code($response);
            if (isset($data['error']['code']) && is_string($data['error']['code'])) {
                $reason .= ' ' . $data['error']['code'];
            }
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log('読み上げくん: 要約の生成に失敗: ' . $reason);
            }
            return new WP_Error('yomiagekun_api', '要約の生成に失敗しました。', $reason);
        }

        return $this->clean_spoken_text($summary);
    }

    /**
     * AI が Markdown を返してきたときに、記号を読み上げないよう落とす
     */
    private function clean_spoken_text($text) {
        $text = preg_replace('/^\s*(#{1,6}\s*|[-*・•]\s+|\d+[.)]\s+)/mu', '', $text);
        $text = str_replace(array('**', '__', '`'), '', $text);
        return trim($text);
    }

    public function github_updater() {
        if (!is_admin() && !wp_doing_cron() && !(defined('WP_CLI') && WP_CLI)) {
            return;
        }
        if (!class_exists('YomiageKun_GitHub_Updater')) {
            require_once YOMIAGEKUN_PLUGIN_PATH . 'includes/github-updater.php';
            new YomiageKun_GitHub_Updater(YOMIAGEKUN_PLUGIN_FILE, 'KantanPro/yomiagekun');
        }
    }
}

// プラグインを初期化
YomiageKun::get_instance();
