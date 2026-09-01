const form = document.querySelector("#unlock-form");
const passwordInput = document.querySelector("#secret-password");
const unlockButton = document.querySelector("#unlock-button");
const statusText = document.querySelector("#unlock-status");
const secretState = document.querySelector("#secretState");

const encoder = new TextEncoder();
const decoder = new TextDecoder();

class PayloadFormatError extends Error {}

// 生成器默认 210000，此处上限防止篡改的 payload 让 PBKDF2 跑几十亿轮卡死页面。
const MAX_ITERATIONS = 10_000_000;

function isUsableBase64(value) {
  try {
    return atob(value).length > 0;
  } catch {
    return false;
  }
}

function validatePayload(payload) {
  if (
    !payload ||
    payload.version !== 1 ||
    payload.kdf !== "PBKDF2" ||
    payload.hash !== "SHA-256" ||
    payload.cipher !== "AES-GCM" ||
    payload.keyLength !== 256 ||
    !Number.isSafeInteger(payload.iterations) ||
    payload.iterations <= 0 ||
    payload.iterations > MAX_ITERATIONS ||
    ![payload.salt, payload.iv, payload.ciphertext].every(
      (value) => typeof value === "string" && isUsableBase64(value),
    )
  ) {
    throw new PayloadFormatError("Unsupported encrypted payload format.");
  }

  return payload;
}

function setStatus(message, mode = "error") {
  statusText.textContent = message;
  statusText.classList.toggle("is-working", mode === "working");
}

function fromBase64(value) {
  let binary;

  try {
    binary = atob(value);
  } catch {
    throw new PayloadFormatError("Invalid Base64 in encrypted payload.");
  }

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
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: payload.hash,
      salt: fromBase64(payload.salt),
      iterations: payload.iterations,
    },
    passwordKey,
    {
      name: payload.cipher,
      length: payload.keyLength,
    },
    false,
    ["decrypt"],
  );
}

async function decryptPage(password, payload) {
  const key = await deriveAesKey(password, payload);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: payload.cipher,
      iv: fromBase64(payload.iv),
    },
    key,
    fromBase64(payload.ciphertext),
  );

  return decoder.decode(decrypted);
}

function renderDecryptedDocument(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");

  document.replaceChild(
    document.importNode(parsed.documentElement, true),
    document.documentElement,
  );

  // DOMParser 解析出的 <script> 是惰性的（"already started"）不会执行，
  // 重新创建并替换它们，恢复 document.write 时代的脚本执行语义。
  document.querySelectorAll("script").forEach((script) => {
    const replacement = document.createElement("script");

    for (const attribute of [...script.attributes]) {
      replacement.setAttribute(attribute.name, attribute.value);
    }

    replacement.textContent = script.textContent;
    script.replaceWith(replacement);
  });
}

let payload = null;

try {
  payload = validatePayload(SECRET_PAGE_PAYLOAD);
} catch (error) {
  console.error("Encrypted payload validation failed.", error);
}

if (!window.crypto?.subtle) {
  unlockButton.disabled = true;
  secretState.textContent = "不可用";
  setStatus("当前浏览器不支持 Web Crypto API。");
} else if (payload) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    unlockButton.disabled = true;
    secretState.textContent = "解密中";
    setStatus("正在解密……", "working");

    try {
      const html = await decryptPage(passwordInput.value, payload);
      renderDecryptedDocument(html);
    } catch (error) {
      if (
        error instanceof PayloadFormatError ||
        error?.name === "NotSupportedError"
      ) {
        setStatus("密文格式损坏，或当前浏览器不支持所需算法。");
      } else {
        setStatus("密码错误或密文已损坏，无法完成解密。");
      }
      secretState.textContent = "解锁失败";
      passwordInput.select();
      unlockButton.disabled = false;
    }
  });
} else {
  unlockButton.disabled = true;
  secretState.textContent = "不可用";
  setStatus("密文格式或版本不受支持，请重新生成密文页面。");
}
