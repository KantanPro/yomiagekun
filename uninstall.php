<?php
/**
 * 読み上げくん - アンインストール時に設定と要約キャッシュを消す
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('yomiagekun_options');
delete_transient('yomiagekun_updater');

foreach (array('simple', 'detailed') as $accuracy) {
    delete_post_meta_by_key('_yomiagekun_summary_' . $accuracy);
}
