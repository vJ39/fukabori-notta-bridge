# fukabori-notta-bridge 仕様書

## 目的
fukabori.fmのエピソードページから、音声ファイルのダウンロードとNottaへのアップロード(文字起こし開始)をワンクリックで行うChrome拡張機能。

## 対象範囲
- fukabori.fm (https://fukabori.fm/) の個別エピソードページ
- Notta Web版 (https://app.notta.ai/)

## 前提
- ユーザーはNottaアカウントを持ち、Chromeで既にログイン済みであること
- fukabori.fmのエピソードページには `<audio src="...mp3">` とMP3ダウンロードリンクが直接埋め込まれている(yattecastというJekyllテンプレートの仕様)

## 技術構成
- Manifest V3
- 素のJavaScript(ビルド不要)
- ライブラリ・フレームワーク不使用

## 権限
- `downloads`: 音声ファイルのローカル保存
- `tabs`: Nottaタブの検索・作成・状態監視
- `scripting`: 将来的な動的注入に備え宣言(現状はcontent_scriptsの静的マッチのみ使用)
- host_permissions: `https://fukabori.fm/*`, `https://app.notta.ai/*`

## 構成要素

### content-fukabori.js (fukabori.fmに注入)
- ページ内の`<audio>`要素のsrc、なければ`a[href$=".mp3"]`のhrefから音声URLを取得
- エピソードタイトルを`<h1>`またはdocument.titleから取得
- 音声URLが取得できたページにのみ、右下にフローティングボタン「Nottaで文字起こし」を表示
- ボタン押下でbackgroundへ`SEND_TO_NOTTA`メッセージを送信し、結果をボタンのラベルに反映

### background.js (service worker)
- `SEND_TO_NOTTA`受信時:
  1. `chrome.downloads.download`でローカル保存(ファイル名はエピソードタイトルをサニタイズしたもの、保存先フォルダは`fukabori.fm/`配下)
  2. 既存のNottaタブを探す。なければ新規タブで`https://app.notta.ai/home`を開き、読み込み完了を待つ
  3. Notta側content scriptへ`UPLOAD_AUDIO`メッセージを送信(未注入の場合を考慮しリトライ)

### content-notta.js (app.notta.aiに注入)
- `UPLOAD_AUDIO`受信時:
  1. 渡された音声URLをfetchしBlob化(host_permissionsによりCORS制約を受けない想定)
  2. `File`オブジェクトを生成
  3. アップロード用の`input[type=file]`にDataTransfer経由でファイルをセットし`change`イベントを発火。見つからない場合はドロップゾーンへdrag&dropイベントを発火
  4. 画面右下にトースト表示で進捗を通知

## 未検証・要確認事項(重要)
以下はブラウザでの実機確認ができておらず、公開されているヘルプ記事等からの推測に基づく暫定実装。**実際にChromeへ読み込んで動作確認・セレクタの調整が必須。**

- Notta Web版アプリのログイン後URL(`app.notta.ai/home`と仮定)
- アップロード欄のDOMセレクタ(`input[type="file"]`および`.upload-dropzone`等は仮置き)
- Nottaの利用規約上、自動化ツールでのアップロードが許容されるか(個人利用の範囲内と考えられるが未確認)

## 動作しないケース(既知の制約)
- Notta側の画面構成が変わった場合、アップロード自動化は失敗する(手動アップロードへのフォールバック導線は用意していない v0.1時点)
- 1エピソードが非常に大きい(1GB超など)場合の動作は未検証
