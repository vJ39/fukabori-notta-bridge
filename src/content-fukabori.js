const LOG_PREFIX = '[fukabori-notta-bridge:fukabori]';

(function main() {
  const audioUrl = findAudioUrl();
  if (!audioUrl) {
    log('このページに音声URLが見つからないためボタンを表示しません', location.href);
    return; // エピソードページ以外(トップページ等)では何もしない
  }

  log('音声URLを検出', audioUrl);
  injectButton(audioUrl, findEpisodeTitle());
})();

function findAudioUrl() {
  const audio = document.querySelector('audio');
  const audioSrc = audio?.currentSrc || audio?.getAttribute('src');
  if (audioSrc) return new URL(audioSrc, location.href).href;

  const mp3Link = document.querySelector('a[href$=".mp3"]');
  if (mp3Link) return new URL(mp3Link.getAttribute('href'), location.href).href;

  return null;
}

function findEpisodeTitle() {
  const heading = document.querySelector('h1');
  return (heading?.textContent || document.title).trim();
}

function injectButton(audioUrl, title) {
  const button = document.createElement('button');
  button.textContent = 'Nottaで文字起こし';
  button.type = 'button';
  button.style.cssText = [
    'position:fixed',
    'right:20px',
    'bottom:20px',
    'z-index:2147483647',
    'padding:10px 18px',
    'background:#2d6cdf',
    'color:#fff',
    'border:none',
    'border-radius:24px',
    'font-size:14px',
    'font-family:sans-serif',
    'cursor:pointer',
    'box-shadow:0 2px 10px rgba(0,0,0,.35)',
  ].join(';');

  const defaultLabel = button.textContent;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = '送信中...';
    log('ボタン押下', { audioUrl, title });
    try {
      const response = await chrome.runtime.sendMessage({ type: 'SEND_TO_NOTTA', audioUrl, title });
      log('background応答', response);
      button.textContent = response?.ok ? '送信しました' : `失敗: ${response?.error ?? '不明なエラー'}`;
    } catch (error) {
      // service workerが起動していない/クラッシュしている場合などはここに来る
      console.error(LOG_PREFIX, 'background呼び出し自体が失敗', error);
      button.textContent = `失敗(拡張との通信エラー): ${error?.message ?? error}`;
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = defaultLabel;
      }, 8000);
    }
  });

  document.body.appendChild(button);
}

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}
