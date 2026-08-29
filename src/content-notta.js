// NOTE: 以下2つのセレクタは実機未検証の暫定値。
// Notta Web版に実際にログインした状態でアップロード画面のDOMを確認し、
// 正しいセレクタに差し替えること(docs/spec.md の「未検証・要確認事項」参照)。
const NOTTA_FILE_INPUT_SELECTOR = 'input[type="file"]';
const NOTTA_DROPZONE_SELECTOR = '[data-testid="upload-dropzone"], .upload-dropzone';

const WAIT_FOR_ELEMENT_TIMEOUT_MS = 15000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'UPLOAD_AUDIO') return false;

  uploadAudio(message.audioUrl, message.filename)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error('[fukabori-notta-bridge]', error);
      showToast(`失敗: ${error?.message ?? error}`);
      sendResponse({ ok: false, error: String(error?.message ?? error) });
    });

  return true;
});

async function uploadAudio(audioUrl, filename) {
  showToast('fukabori.fmの音声を取得中...');
  const file = await fetchAsFile(audioUrl, filename);

  const fileInput = await waitForElement(NOTTA_FILE_INPUT_SELECTOR, WAIT_FOR_ELEMENT_TIMEOUT_MS).catch(() => null);
  if (fileInput) {
    setFileToInput(fileInput, file);
    showToast('Nottaへアップロードしました');
    return;
  }

  const dropzone = await waitForElement(NOTTA_DROPZONE_SELECTOR, 5000).catch(() => null);
  if (dropzone) {
    dispatchFileDrop(dropzone, file);
    showToast('Nottaへアップロードしました(ドロップ)');
    return;
  }

  throw new Error('Nottaのアップロード欄が見つかりませんでした。セレクタの見直しが必要です');
}

async function fetchAsFile(url, filename) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`音声ファイルの取得に失敗しました (HTTP ${response.status})`);
  const blob = await response.blob();
  return new File([blob], filename, { type: 'audio/mpeg' });
}

function setFileToInput(input, file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
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
