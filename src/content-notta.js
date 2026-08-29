// NOTE: 以下2つのセレクタは実機未検証の暫定値。
// Notta Web版に実際にログインした状態でアップロード画面のDOMを確認し、
// 正しいセレクタに差し替えること(docs/spec.md の「未検証・要確認事項」参照)。
const NOTTA_FILE_INPUT_SELECTOR = 'input[type="file"]';
const NOTTA_DROPZONE_SELECTOR = '[data-testid="upload-dropzone"], .upload-dropzone';
// ホーム画面に直接アップロード欄が無く、まず「インポート」的なボタンを押して
// モーダルを開く必要がある構成を想定したフォールバック探索用の文言。
const IMPORT_TRIGGER_TEXTS = ['インポート', 'Import', 'ファイルをアップロード', 'アップロード', 'Upload'];

const LOG_PREFIX = '[fukabori-notta-bridge:notta]';
const INITIAL_TARGET_TIMEOUT_MS = 3000;
const AFTER_TRIGGER_TARGET_TIMEOUT_MS = 15000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'UPLOAD_AUDIO') return false;

  uploadAudio(message.audioUrl, message.filename)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      const reason = String(error?.message ?? error);
      console.error(LOG_PREFIX, 'アップロード失敗:', error);
      showToast(`失敗: ${reason}`);
      sendResponse({ ok: false, error: reason });
    });

  return true;
});

async function uploadAudio(audioUrl, filename) {
  log('開始', { audioUrl, filename, pageUrl: location.href });
  showToast('fukabori.fmの音声を取得中...');

  const file = await fetchAsFile(audioUrl, filename);
  log('音声取得完了', { size: file.size, type: file.type });

  showToast('Nottaのアップロード欄を探索中...');
  let target = await findUploadTarget(INITIAL_TARGET_TIMEOUT_MS);

  if (!target) {
    log('直接は見つからず。インポート系ボタンを探索します');
    const trigger = findClickableByText(IMPORT_TRIGGER_TEXTS);
    if (trigger) {
      log('トリガー要素をクリック', { text: trigger.textContent?.trim() });
      trigger.click();
      await sleep(1000);
    } else {
      log('インポート系ボタンも見つかりませんでした');
    }
    target = await findUploadTarget(AFTER_TRIGGER_TARGET_TIMEOUT_MS);
  }

  if (!target) {
    throw new Error(
      'Nottaのアップロード欄が見つかりませんでした(input[type=file]・ドロップゾーン・インポートボタンいずれも未検出)。' +
        'F12コンソールのログと合わせてセレクタの調整が必要です'
    );
  }

  log('アップロード対象要素を検出', { tag: target.tagName, selector: describe(target) });

  if (target.tagName === 'INPUT') {
    setFileToInput(target, file);
  } else {
    dispatchFileDrop(target, file);
  }

  log('ファイルをセットしました(Notta側で実際に受理されたかはUI上で要確認)');
  showToast('ファイルを送り込みました。Notta側の画面で反映を確認してください');
}

async function findUploadTarget(timeoutMs) {
  const input = await waitForElement(NOTTA_FILE_INPUT_SELECTOR, timeoutMs).catch(() => null);
  if (input) return input;
  return waitForElement(NOTTA_DROPZONE_SELECTOR, Math.min(timeoutMs, 3000)).catch(() => null);
}

function findClickableByText(texts) {
  const candidates = document.querySelectorAll('button, a, [role="button"]');
  for (const el of candidates) {
    const text = (el.textContent || '').trim();
    if (!text) continue;
    if (texts.some((t) => text.includes(t))) return el;
  }
  return null;
}

async function fetchAsFile(url, filename) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`音声ファイルの取得でネットワークエラー(CORS等の可能性): ${error.message}`);
  }
  if (!response.ok) throw new Error(`音声ファイルの取得に失敗しました (HTTP ${response.status})`);
  const blob = await response.blob();
  return new File([blob], filename, { type: 'audio/mpeg' });
}

function setFileToInput(input, file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  // Reactなどが 'change' のみを監視していないケースに備え両方発火する
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function dispatchFileDrop(target, file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  for (const type of ['dragenter', 'dragover', 'drop']) {
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
  }
}

function waitForElement(selector, timeoutMs) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`要素が見つかりませんでした: ${selector}`));
    }, timeoutMs);
  });
}

function describe(el) {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').join('.')}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function showToast(message) {
  let toast = document.getElementById('fukabori-notta-bridge-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'fukabori-notta-bridge-toast';
    toast.style.cssText = [
      'position:fixed',
      'right:20px',
      'bottom:20px',
      'z-index:2147483647',
      'padding:10px 16px',
      'background:#111',
      'color:#fff',
      'font-size:13px',
      'font-family:sans-serif',
      'border-radius:8px',
      'box-shadow:0 2px 10px rgba(0,0,0,.35)',
      'max-width:320px',
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
}
