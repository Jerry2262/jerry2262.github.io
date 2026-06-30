const form = document.querySelector("#unlock-form");
const passwordInput = document.querySelector("#secret-password");
const unlockButton = document.querySelector("#unlock-button");
const statusText = document.querySelector("#unlock-status");

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function setStatus(message, mode = "error") {
  statusText.textContent = message;
  statusText.classList.toggle("is-working", mode === "working");
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function deriveAesKey(password, payload) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: payload.hash,
      salt: fromBase64(payload.salt),
      iterations: payload.iterations
    },
    passwordKey,
    {
      name: payload.cipher,
      length: payload.keyLength
    },
    false,
    ["decrypt"]
  );
}

async function decryptPage(password) {
  const key = await deriveAesKey(password, SECRET_PAGE_PAYLOAD);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: SECRET_PAGE_PAYLOAD.cipher,
      iv: fromBase64(SECRET_PAGE_PAYLOAD.iv)
    },
    key,
    fromBase64(SECRET_PAGE_PAYLOAD.ciphertext)
  );

  return decoder.decode(decrypted);
}

function renderDecryptedDocument(html) {
  document.open();
  document.write(html);
  document.close();
}

if (!window.crypto?.subtle) {
  unlockButton.disabled = true;
  setStatus("当前浏览器不支持 Web Crypto API。");
} else {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    unlockButton.disabled = true;
    setStatus("正在尝试解密...", "working");

    try {
      const html = await decryptPage(passwordInput.value);
      renderDecryptedDocument(html);
    } catch (error) {
      setStatus("密码错误，无法解密正确页面。");
      passwordInput.select();
      unlockButton.disabled = false;
    }
  });
}
