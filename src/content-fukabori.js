(function main() {
  const audioUrl = findAudioUrl();
  if (!audioUrl) return; // エピソードページ以外(トップページ等)では何もしない

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
    try {
      const response = await chrome.runtime.sendMessage({ type: 'SEND_TO_NOTTA', audioUrl, title });
      button.textContent = response?.ok ? '送信しました' : `失敗: ${response?.error ?? '不明なエラー'}`;
    } catch (error) {
      button.textContent = `失敗: ${error?.message ?? error}`;
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = defaultLabel;
      }, 5000);
    }
  });

  document.body.appendChild(button);
}
