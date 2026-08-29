importScripts('lib/filename.js'); // sanitizeFilenameを提供(src/lib/filename.js)

const NOTTA_HOME_URL = 'https://app.notta.ai/'; // ログイン済みなら実際のワークスペースID付きダッシュボードURLへNotta側でクライアントリダイレクトされる
const NOTTA_URL_PATTERN = 'https://app.notta.ai/*';
const LOG_PREFIX = '[fukabori-notta-bridge:bg]';
const DOWNLOAD_COMPLETE_TIMEOUT_MS = 20000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'SEND_TO_NOTTA') return false;

  handleSendToNotta(message.audioUrl, message.title).then((result) => {
    log('最終結果', result);
    sendResponse({ ok: result.download.ok && result.notta.ok, ...result });
  });

  return true; // 非同期でsendResponseを呼ぶことを示す
});

async function handleSendToNotta(audioUrl, title) {
  log('開始', { audioUrl, title });
  const baseName = sanitizeFilename(title);

  // ダウンロードとNotta送信は互いに独立(Notta側は自分でaudioUrlをfetchするため、
  // ローカル保存が失敗してもNotta送信は試みる)。両方の結果を別々に返す。
  const download = await tryDownloadLocally(audioUrl, `fukabori.fm/${baseName}.mp3`);
  const notta = await tryUploadToNotta(audioUrl, `${baseName}.mp3`);
  return { download, notta };
}

async function tryDownloadLocally(url, filename) {
  try {
    const downloadId = await downloadLocally(url, filename);
    return { ok: true, downloadId };
  } catch (error) {
    console.error(LOG_PREFIX, 'ダウンロード失敗:', error);
    return { ok: false, error: String(error?.message ?? error) };
  }
}

async function tryUploadToNotta(audioUrl, filename) {
  try {
    const tabId = await openOrFocusNottaTab();
    log('Nottaタブ確定', { tabId });
    await sendUploadJobWithRetry(tabId, { type: 'UPLOAD_AUDIO', audioUrl, filename });
    return { ok: true };
  } catch (error) {
    console.error(LOG_PREFIX, 'Notta送信失敗:', error);
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function downloadLocally(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        const reason = chrome.runtime.lastError?.message ?? 'downloadIdが返りませんでした(ファイル名が不正な可能性)';
        log('ローカル保存の開始に失敗', reason);
        reject(new Error(reason));
        return;
      }
      log('ローカル保存を開始', { downloadId, filename, url });
      watchDownloadCompletion(downloadId).then(resolve, reject);
    });
  });
}

function watchDownloadCompletion(downloadId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.downloads.onChanged.removeListener(listener);
      log('ダウンロード完了確認がタイムアウトしました(バックグラウンドで継続中の可能性)', { downloadId });
      resolve(downloadId);
    }, DOWNLOAD_COMPLETE_TIMEOUT_MS);

    function listener(delta) {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === 'complete') {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(listener);
        log('ダウンロード完了', { downloadId });
        resolve(downloadId);
      } else if (delta.state?.current === 'interrupted') {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(listener);
        const reason = delta.error?.current ?? '不明なエラー';
        log('ダウンロードが中断されました', { downloadId, reason });
        reject(new Error(reason));
      }
    }
    chrome.downloads.onChanged.addListener(listener);
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

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}
