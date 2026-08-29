// ダウンロード用ファイル名のサニタイズ処理。
// Node(テスト)とブラウザ(service worker / content script)の両方から
// importScripts()やrequire()で読み込めるよう、ビルド無しでCommonJS/クラシックスクリプト両対応にしている。
function sanitizeFilename(name) {
  const CONTROL_CHARS = new RegExp('[\\x00-\\x1f\\x7f]', 'g');
  const sanitized = String(name)
    .replace(CONTROL_CHARS, ' ') // 改行・タブ等の制御文字を空白に置換(h1のtextContentにHTML整形上の改行が混入するケースに対応。空文字にすると隣接文字がくっつくため空白に)
    .replace(/[\\/:*?"<>|]/g, '_') // OSで使えない予約文字を置換
    .replace(/\s+/g, ' ') // 連続する空白を1つに集約
    .trim()
    .replace(/[. ]+$/, '') // 末尾のピリオド・空白を除去(Windowsで不正になるため)
    .slice(0, 150);
  return sanitized || 'episode';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sanitizeFilename };
} else {
  self.sanitizeFilename = sanitizeFilename;
}
