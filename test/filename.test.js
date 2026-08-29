const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeFilename } = require('../src/lib/filename.js');

test('通常のタイトルはそのまま使われる', () => {
  assert.equal(sanitizeFilename('63. テレプレゼンス・ロボット・最後にRust'), '63. テレプレゼンス・ロボット・最後にRust');
});

test('改行・タブ等の制御文字を除去する(h1のtextContentにHTML整形上の改行が混入するケース)', () => {
  assert.equal(sanitizeFilename('0.\n  Fukabori.fmについて\n'), '0. Fukabori.fmについて');
});

test('OSで使えない予約文字をアンダースコアに置換する', () => {
  assert.equal(sanitizeFilename('a/b:c*d?e"f<g>h|i'), 'a_b_c_d_e_f_g_h_i');
});

test('連続する空白(スペース・タブ)を1つのスペースに集約する', () => {
  assert.equal(sanitizeFilename('a   b\t\tc'), 'a b c');
});

test('末尾のピリオド・空白を除去する(Windowsではファイル名末尾のピリオド・空白が不正)', () => {
  assert.equal(sanitizeFilename('タイトル. '), 'タイトル');
});

test('長すぎるタイトルは150文字に切り詰める', () => {
  const longTitle = 'あ'.repeat(200);
  assert.equal(sanitizeFilename(longTitle).length, 150);
});

test('サニタイズ後に空文字になる場合はepisodeにフォールバックする', () => {
  assert.equal(sanitizeFilename('\n\t   \n'), 'episode');
});

test('文字列以外の値も文字列化してから処理する', () => {
  assert.equal(sanitizeFilename(123), '123');
});
