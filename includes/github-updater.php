<?php
/**
 * GitHub Updater for 読み上げくん
 * WordPress標準の更新通知機能をGitHubのリリースに対応させる
 */

if (!defined('ABSPATH')) {
    exit;
}

class YomiageKun_GitHub_Updater {

    private $plugin_file;
    private $basename;   // yomiagekun/yomiagekun.php
    private $slug;       // yomiagekun
    private $repo;       // KantanPro/yomiagekun
    private $version;
    private $cache_key = 'yomiagekun_updater';

    public function __construct($plugin_file, $repo) {
        $this->plugin_file = $plugin_file;
        $this->basename = plugin_basename($plugin_file);
        $this->slug = dirname($this->basename);
        $this->repo = $repo;
        $this->version = YOMIAGEKUN_VERSION;

        add_filter('pre_set_site_transient_update_plugins', array($this, 'modify_transient'), 10, 1);
        add_filter('plugins_api', array($this, 'plugin_popup'), 10, 3);
        add_filter('upgrader_post_install', array($this, 'after_install'), 10, 3);
    }

    /**
     * 最新リリースの情報。失敗も 12 時間覚えておき、GitHub API を叩き続けない
     */
    public function request() {
        $cached = get_transient($this->cache_key);
        if (false !== $cached) {
            return $cached === 'none' ? false : $cached;
        }

        $response = wp_remote_get(
            'https://api.github.com/repos/' . $this->repo . '/releases/latest',
            array(
                'timeout' => 10,
                'headers' => array(
                    'Accept' => 'application/vnd.github.v3+json',
                )
            )
        );

        $remote = is_wp_error($response) ? null : json_decode(wp_remote_retrieve_body($response));
        if (empty($remote) || empty($remote->tag_name)) {
            set_transient($this->cache_key, 'none', 43200);
            return false;
        }

        $res = new stdClass();
        $res->name = '読み上げくん';
        $res->slug = $this->slug;
        $res->version = ltrim($remote->tag_name, 'vV');
        $res->requires = '5.0';
        $res->requires_php = '7.4';
        $res->author = 'KantanPro';
        $res->homepage = $remote->html_url;
        $res->last_updated = $remote->published_at;
        $res->sections = array(
            'description' => 'ブログの内容をAIが要約して読み上げてくれるアクセシビリティプラグイン',
            'changelog' => nl2br(esc_html((string) $remote->body)),
        );

        // リリースに添付した ZIP（中身が yomiagekun/ フォルダ）を優先する
        $res->download_link = $remote->zipball_url;
        if (!empty($remote->assets)) {
            foreach ($remote->assets as $asset) {
                if (substr($asset->name, -4) === '.zip') {
                    $res->download_link = $asset->browser_download_url;
                    break;
                }
            }
        }

        set_transient($this->cache_key, $res, 43200); // 12時間キャッシュ

        return $res;
    }

    public function modify_transient($transient) {
        if (!is_object($transient) || empty($transient->checked)) {
            return $transient;
        }

        $remote = $this->request();

        if ($remote && version_compare($this->version, $remote->version, '<')) {
            $res = new stdClass();
            $res->slug = $this->slug;
            $res->plugin = $this->basename;
            $res->new_version = $remote->version;
            $res->url = $remote->homepage;
            $res->package = $remote->download_link;

            $transient->response[$this->basename] = $res;
        }

        return $transient;
    }

    public function plugin_popup($result, $action, $args) {
        if ($action !== 'plugin_information' || empty($args->slug) || $args->slug !== $this->slug) {
            return $result;
        }

        $remote = $this->request();
        return $remote ? $remote : $result;
    }

    /**
     * zipball のようにフォルダ名が違う ZIP でも、yomiagekun/ に入れ直す
     */
    public function after_install($response, $hook_extra, $result) {
        global $wp_filesystem;

        if (empty($hook_extra['plugin']) || $hook_extra['plugin'] !== $this->basename) {
            return $response;
        }

        $install_directory = trailingslashit(WP_PLUGIN_DIR) . $this->slug;
        if (untrailingslashit($result['destination']) !== $install_directory) {
            $wp_filesystem->move($result['destination'], $install_directory, true);
            $result['destination'] = $install_directory;
        }

        return $result;
    }
}
