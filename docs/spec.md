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

### src/lib/filename.js (共有ロジック)
- `sanitizeFilename(name)`: ダウンロード用ファイル名のサニタイズ処理。制御文字(改行・タブ含む)を空白に置換→OS予約文字(`\/:*?"<>|`)を`_`に置換→連続空白を1つに集約→前後空白トリム→末尾のピリオド・空白を除去(Windows制約)→150文字に切り詰め。全て除去されて空文字になった場合は`episode`にフォールバック
- CommonJS(`module.exports`、テストから`require`)とクラシックスクリプト(`self.sanitizeFilename`、`importScripts()`で読み込み)の両方に対応させ、ビルド無しで背景スクリプトとNode両方から使えるようにしている
- テスト: `test/filename.test.js` (`npm test` または `node --test`)

### content-fukabori.js (fukabori.fmに注入)
- ページ内の`<audio>`要素のsrc、なければ`a[href$=".mp3"]`のhrefから音声URLを取得
- エピソードタイトルを`<h1>`またはdocument.titleから取得
- 音声URLが取得できたページにのみ、右下にフローティングボタン「Nottaで文字起こし」を表示
- ボタン押下でbackgroundへ`SEND_TO_NOTTA`メッセージを送信し、結果をボタンのラベルに反映

### background.js (service worker)
- `SEND_TO_NOTTA`受信時、ダウンロードとNotta送信を独立したステップとして両方試みる(Notta側は自分でaudioUrlをfetchするため、ローカル保存が失敗してもNotta送信は続行する)。それぞれの成否・エラー内容を`{ download: {ok, error?}, notta: {ok, error?} }`として呼び出し元に返す
  1. `chrome.downloads.download`でローカル保存(ファイル名は`sanitizeFilename`で処理したもの、保存先フォルダは`fukabori.fm/`配下)。`chrome.downloads.onChanged`で実際の完了/中断まで監視し、中断時は理由を返す
  2. 既存のNottaタブを探す。なければ新規タブで`https://app.notta.ai/home`を開き、読み込み完了を待つ(ログイン画面へのリダイレクトも検知してログに出す)
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

## 既知の不具合(修正済み)
- **ダウンロードが`Invalid filename`で失敗する**: `<h1>`のtextContentにHTML整形上の改行・インデント空白が混入し、`chrome.downloads.download`のfilenameに制御文字が渡っていたことが原因。`sanitizeFilename`で制御文字を空白に置換するよう修正(空文字への置換だと隣接文字がくっついてしまうバグも合わせて修正、テストで検出)

## デバッグ方法
アップロードが動かない/失敗する場合、以下3箇所のログを確認する。すべて `[fukabori-notta-bridge:*]` プレフィックス付きで出力される。

1. **background.js (service worker)のログ**: `chrome://extensions` → 本拡張の「Service Worker」リンクをクリックしてDevToolsを開く → Consoleタブ。ダウンロード開始・Nottaタブの検出/作成・content scriptへの送信リトライ状況が出る
2. **fukabori.fmページのログ**: エピソードページでF12 → Consoleタブ。ボタン押下時のbackground応答が出る
3. **Nottaタブのログ**: Nottaのタブ上でF12 → Consoleタブ。音声取得・アップロード欄の探索状況・実際にセットした要素が出る

`uploadAudio`はファイルを`input.files`にセットする、またはドロップイベントを発火するところまでしか保証しない。Notta側の画面に実際にファイル名やプログレスバーが表示されたかは目視で確認すること(この拡張はNotta内部の状態までは検知していない)。

セレクタが外れている場合は、Nottaタブのログに `アップロード対象要素を検出` が出ずに `Nottaのアップロード欄が見つかりませんでした` エラーになる。その場合は実際のNottaのアップロード画面でinput[type=file]やドロップゾーンのクラス名・data属性をDevTools要素選択で確認し、`src/content-notta.js`の`NOTTA_FILE_INPUT_SELECTOR`/`NOTTA_DROPZONE_SELECTOR`/`IMPORT_TRIGGER_TEXTS`を実際の値に差し替える。
