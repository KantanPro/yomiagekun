#!/bin/bash

# プラグインのリリース用ZIPファイル作成スクリプト
# 作成者: KantanPro
# 作成日: $(date +%Y-%m-%d)

set -e  # エラー時に停止

# プラグインディレクトリのパス
PLUGIN_DIR="/Users/kantanpro/Desktop/KantanPro/wordpress/wp-content/plugins/yomiagekun"
OUTPUT_DIR="/Users/kantanpro/Desktop/Game_TEST_UP"

# プラグイン名とバージョンを動的に取得
PLUGIN_NAME="yomiagekun"
VERSION=$(grep "Version:" "$PLUGIN_DIR/yomiagekun.php" | sed 's/.*Version: *//' | sed 's/ *$//')
TODAY=$(date +%Y%m%d)

# 出力ファイル名
ZIP_NAME="${PLUGIN_NAME}_${VERSION}_${TODAY}.zip"
ZIP_PATH="$OUTPUT_DIR/$ZIP_NAME"

echo "=========================================="
echo "プラグインリリースZIP作成スクリプト"
echo "=========================================="
echo "プラグイン名: $PLUGIN_NAME"
echo "バージョン: $VERSION"
echo "作成日: $(date +%Y-%m-%d)"
echo "出力先: $ZIP_PATH"
echo "=========================================="

# 出力ディレクトリが存在しない場合は作成
if [ ! -d "$OUTPUT_DIR" ]; then
    echo "出力ディレクトリを作成します: $OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"
fi

# プラグインディレクトリに移動
cd "$PLUGIN_DIR"

# 一時ディレクトリを作成
TEMP_DIR=$(mktemp -d)
echo "一時ディレクトリ: $TEMP_DIR"

# プラグインのコピー先ディレクトリを作成
PLUGIN_COPY_DIR="$TEMP_DIR/$PLUGIN_NAME"
mkdir -p "$PLUGIN_COPY_DIR"

echo "プラグインファイルをコピー中..."

# 必要なファイルのみをコピー（配布に必要な最小構成）
# メインファイル
cp "yomiagekun.php" "$PLUGIN_COPY_DIR/"

# assetsディレクトリ
if [ -d "assets" ]; then
    cp -r "assets" "$PLUGIN_COPY_DIR/"
fi

# includesディレクトリ
if [ -d "includes" ]; then
    cp -r "includes" "$PLUGIN_COPY_DIR/"
fi

# README.md（存在する場合）
if [ -f "README.md" ]; then
    cp "README.md" "$PLUGIN_COPY_DIR/"
fi

# 不要なファイルを除外（.git、.DS_Store、開発用ファイルなど）
find "$PLUGIN_COPY_DIR" -name ".DS_Store" -delete
find "$PLUGIN_COPY_DIR" -name "*.log" -delete
find "$PLUGIN_COPY_DIR" -name "*.tmp" -delete
find "$PLUGIN_COPY_DIR" -name ".git*" -delete

echo "ZIPファイルを作成中..."

# ZIPファイルを作成
cd "$TEMP_DIR"
zip -r "$ZIP_PATH" "$PLUGIN_NAME" -x "*.DS_Store" "*.log" "*.tmp" ".git*"

# 一時ディレクトリを削除
rm -rf "$TEMP_DIR"

# ファイルサイズを取得
FILE_SIZE=$(ls -lh "$ZIP_PATH" | awk '{print $5}')
FILE_SIZE_BYTES=$(stat -f%z "$ZIP_PATH")

echo "=========================================="
echo "ZIPファイル作成完了！"
echo "=========================================="
echo "ファイル名: $ZIP_NAME"
echo "ファイルサイズ: $FILE_SIZE ($FILE_SIZE_BYTES bytes)"
echo "保存先: $ZIP_PATH"
echo "=========================================="

# ファイルサイズが期待値内かチェック
if [ $FILE_SIZE_BYTES -lt 2097152 ]; then  # 2MB未満
    echo "✅ ファイルサイズは期待値内です（2MB未満）"
else
    echo "⚠️  ファイルサイズが大きすぎます（2MB以上）"
fi

echo "プラグインの配布準備が完了しました！"
