const NOTTA_HOME_URL = 'https://app.notta.ai/home';
const NOTTA_URL_PATTERN = 'https://app.notta.ai/*';
const LOG_PREFIX = '[fukabori-notta-bridge:bg]';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'SEND_TO_NOTTA') return false;

  handleSendToNotta(message.audioUrl, message.title)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error(LOG_PREFIX, '処理失敗:', error);
      sendResponse({ ok: false, error: String(error?.message ?? error) });
    });

  return true; // 非同期でsendResponseを呼ぶことを示す
});

async function handleSendToNotta(audioUrl, title) {
  log('開始', { audioUrl, title });
  const baseName = sanitizeFilename(title);

  await downloadLocally(audioUrl, `fukabori.fm/${baseName}.mp3`);

  const tabId = await openOrFocusNottaTab();
  log('Nottaタブ確定', { tabId });

  await sendUploadJobWithRetry(tabId, { type: 'UPLOAD_AUDIO', audioUrl, filename: `${baseName}.mp3` });
  log('Notta側へのアップロード指示が完了応答を返しました');
}

function downloadLocally(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, conflictAction: 'uniquify' }, (downloadId) => {
      if (chrome.runtime.lastError) {
        log('ローカル保存に失敗', chrome.runtime.lastError.message);
        reject(new Error(`ダウンロード失敗: ${chrome.runtime.lastError.message}`));
        return;
      }
      log('ローカル保存を開始', { downloadId, filename });
      resolve(downloadId);
    });
  });
}

async function openOrFocusNottaTab() {
  const existingTabs = await chrome.tabs.query({ url: NOTTA_URL_PATTERN });
  if (existingTabs.length > 0) {
    const tab = existingTabs[0];
    log('既存のNottaタブを再利用', { tabId: tab.id, url: tab.url });
    await chrome.tabs.update(tab.id, { active: true });
    return tab.id;
  }

  log('Nottaタブを新規に開く', { url: NOTTA_HOME_URL });
  const tab = await chrome.tabs.create({ url: NOTTA_HOME_URL, active: true });
  await waitForTabComplete(tab.id);

  const loaded = await chrome.tabs.get(tab.id);
  log('Nottaタブの読み込み完了', { tabId: tab.id, finalUrl: loaded.url });
  if (loaded.url && /\/login/.test(loaded.url)) {
    log('警告: ログイン画面にリダイレクトされている可能性があります');
  }

  return tab.id;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (tab.status === 'complete') {
        resolve();
        return;
      }
      function listener(updatedTabId, info) {
        if (updatedTabId === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function sendUploadJobWithRetry(tabId, message, retries = 15, intervalMs = 800) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      if (response?.ok) return response;
      lastError = new Error(response?.error ?? 'Notta側で不明なエラーが発生しました');
      log(`Notta側からエラー応答 (試行${i + 1}/${retries})`, lastError.message);
      break; // content script自体は生きていて明示的に失敗を返した場合は即エラーとして扱う
    } catch (error) {
      lastError = error; // content scriptがまだ注入されていない等
      log(`Notta側content scriptへの接続待ち (試行${i + 1}/${retries})`, String(error?.message ?? error));
    }
    await sleep(intervalMs);
  }
  throw lastError ?? new Error('Nottaページへの接続がタイムアウトしました');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 150);
}

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}
