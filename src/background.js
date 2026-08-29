const NOTTA_HOME_URL = 'https://app.notta.ai/home';
const NOTTA_URL_PATTERN = 'https://app.notta.ai/*';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'SEND_TO_NOTTA') return false;

  handleSendToNotta(message.audioUrl, message.title)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: String(error?.message ?? error) }));

  return true; // 非同期でsendResponseを呼ぶことを示す
});

async function handleSendToNotta(audioUrl, title) {
  const filename = `fukabori.fm/${sanitizeFilename(title)}.mp3`;
  chrome.downloads.download({ url: audioUrl, filename, conflictAction: 'uniquify' });

  const tabId = await openOrFocusNottaTab();
  await sendUploadJobWithRetry(tabId, { type: 'UPLOAD_AUDIO', audioUrl, filename: `${sanitizeFilename(title)}.mp3` });
}

async function openOrFocusNottaTab() {
  const existingTabs = await chrome.tabs.query({ url: NOTTA_URL_PATTERN });
  if (existingTabs.length > 0) {
    const tab = existingTabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    return tab.id;
  }

  const tab = await chrome.tabs.create({ url: NOTTA_HOME_URL, active: true });
  await waitForTabComplete(tab.id);
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
    } catch (error) {
      lastError = error; // content scriptがまだ注入されていない等
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
