<?php
/**
 * GitHub Updater for 読み上げくん
 * WordPress標準の更新通知機能をGitHubに対応させる
 */

if (!defined('ABSPATH')) {
    exit;
}

class YomiageKun_GitHub_Updater {
    
    private $plugin_slug;
    private $version;
    private $cache_key;
    private $cache_allowed;
    
    public function __construct() {
        $this->plugin_slug = plugin_basename(__FILE__);
        $this->version = YOMIAGEKUN_VERSION;
        $this->cache_key = 'yomiagekun_updater';
        $this->cache_allowed = false;
        
        add_filter('pre_set_site_transient_update_plugins', array($this, 'modify_transient'), 10, 1);
        add_filter('plugins_api', array($this, 'plugin_popup'), 10, 3);
        add_filter('upgrader_post_install', array($this, 'after_install'), 10, 3);
    }
    
    public function request() {
        $remote = get_transient($this->cache_key);
        
        if (false === $remote || $this->cache_allowed) {
            $remote = wp_remote_get(
                'https://api.github.com/repos/your-username/yomiagekun/releases/latest',
                array(
                    'timeout' => 10,
                    'headers' => array(
                        'Accept' => 'application/vnd.github.v3+json',
                    )
                )
            );
            
            if (is_wp_error($remote)) {
                return false;
            }
            
            $remote = wp_remote_retrieve_body($remote);
            $remote = json_decode($remote);
            
            if (empty($remote) || isset($remote->message)) {
                return false;
            }
            
            $res = new stdClass();
            $res->name = $remote->name;
            $res->slug = $this->plugin_slug;
            $res->version = $remote->tag_name;
            $res->tested = $remote->target_commitish;
            $res->requires = '5.0';
            $res->author = 'Your Name';
            $res->author_profile = 'https://github.com/your-username';
            $res->homepage = $remote->html_url;
            $res->trunk = $remote->zipball_url;
            $res->private = false;
            $res->requires_php = '7.4';
            $res->last_updated = $remote->published_at;
            $res->sections = array(
                'description' => 'ブログの内容をAIが要約して読み上げてくれるアクセシビリティプラグイン',
                'installation' => 'プラグインを有効化するだけで使用できます。',
                'changelog' => $remote->body,
            );
            
            if (!empty($remote->assets[0])) {
                $res->download_link = $remote->assets[0]->browser_download_url;
            } else {
                $res->download_link = $remote->zipball_url;
            }
            
            set_transient($this->cache_key, $res, 43200); // 12時間キャッシュ
        }
        
        return $res;
    }
    
    public function modify_transient($transient) {
        if (empty($transient->checked)) {
            return $transient;
        }
        
        $remote = $this->request();
        
        if ($remote && version_compare($this->version, $remote->version, '<')) {
            $res = new stdClass();
            $res->slug = $this->plugin_slug;
            $res->plugin = plugin_basename(__FILE__);
            $res->new_version = $remote->version;
            $res->tested = $remote->tested;
            $res->package = $remote->download_link;
            
            $transient->response[$res->plugin] = $res;
        }
        
        return $transient;
    }
    
    public function plugin_popup($result, $action, $args) {
        if (!empty($args->slug)) {
            if ($args->slug == current(explode('/', $this->plugin_slug))) {
                $remote = $this->request();
                
                if ($remote) {
                    $result = $remote;
                }
            }
        }
        
        return $result;
    }
    
    public function after_install($response, $hook_extra, $result) {
        global $wp_filesystem;
        
        $install_directory = plugin_dir_path(__FILE__);
        $wp_filesystem->move($result['destination'], $install_directory);
        $result['destination'] = $install_directory;
        
        if (is_plugin_active(plugin_basename(__FILE__))) {
            deactivate_plugins(plugin_basename(__FILE__));
            activate_plugin(plugin_basename(__FILE__));
        }
        
        return $result;
    }
}

// GitHub Updaterを初期化
new YomiageKun_GitHub_Updater();
