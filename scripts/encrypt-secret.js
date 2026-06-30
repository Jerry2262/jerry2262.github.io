#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const defaults = {
  source: "apps/secret/private/page.html",
  passwordFile: "apps/secret/private/password.txt",
  output: "apps/secret/payload.js",
  example: "apps/secret/secret-source.example.html",
  iterations: 210000
};

function resolveRepoPath(relativePath) {
  return path.resolve(repoRoot, relativePath);
}

function readOption(args, name, fallback) {
  const index = args.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function showHelp() {
  console.log(`Usage:
  node scripts/encrypt-secret.js
  node scripts/encrypt-secret.js --init

Options:
  --source <path>         Plain HTML source. Default: ${defaults.source}
  --password-file <path>  Local password file. Default: ${defaults.passwordFile}
  --out <path>            Payload output file. Default: ${defaults.output}
  --iterations <number>   PBKDF2 iterations. Default: ${defaults.iterations}
  --init                  Create local private source/password files if missing.
  --force                 Allow --init to overwrite existing private files.

You can also set SECRET_PAGE_PASSWORD to override --password-file.`);
}

function ensureInsideRepo(filePath) {
  const relative = path.relative(repoRoot, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside the repository: ${filePath}`);
  }
}

function readPassword(passwordFile) {
  if (process.env.SECRET_PAGE_PASSWORD) {
    return process.env.SECRET_PAGE_PASSWORD;
  }

  return fs.readFileSync(passwordFile, "utf8").replace(/\r?\n$/, "");
}

function initPrivateFiles(sourceFile, passwordFile, force) {
  ensureInsideRepo(sourceFile);
  ensureInsideRepo(passwordFile);

  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });

  if (force || !fs.existsSync(sourceFile)) {
    fs.copyFileSync(resolveRepoPath(defaults.example), sourceFile);
    console.log(`Wrote ${path.relative(repoRoot, sourceFile)}`);
  } else {
    console.log(`Kept existing ${path.relative(repoRoot, sourceFile)}`);
  }

  if (force || !fs.existsSync(passwordFile)) {
    const password = `secret-${crypto.randomBytes(12).toString("base64url")}`;
    fs.writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
    console.log(`Wrote ${path.relative(repoRoot, passwordFile)}`);
  } else {
    console.log(`Kept existing ${path.relative(repoRoot, passwordFile)}`);
  }
}

function encryptHtml({ html, password, iterations }) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(
    Buffer.from(password.normalize("NFKC"), "utf8"),
    salt,
    iterations,
    32,
    "sha256"
  );
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(html, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    kdf: "PBKDF2",
    hash: "SHA-256",
    iterations,
    keyLength: 256,
    cipher: "AES-GCM",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: Buffer.concat([encrypted, tag]).toString("base64")
  };
}

function formatPayload(payload) {
  const chunks = payload.ciphertext.match(/.{1,88}/g) ?? [];

  return `const SECRET_PAGE_PAYLOAD = {
  version: ${payload.version},
  kdf: ${JSON.stringify(payload.kdf)},
  hash: ${JSON.stringify(payload.hash)},
  iterations: ${payload.iterations},
  keyLength: ${payload.keyLength},
  cipher: ${JSON.stringify(payload.cipher)},
  salt: ${JSON.stringify(payload.salt)},
  iv: ${JSON.stringify(payload.iv)},
  ciphertext: [
${chunks.map((chunk) => `    ${JSON.stringify(chunk)}`).join(",\n")}
  ].join("")
};
`;
}

function main() {
  const args = process.argv.slice(2);

  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    showHelp();
    return;
  }

  const sourceFile = resolveRepoPath(readOption(args, "--source", defaults.source));
  const passwordFile = resolveRepoPath(
    readOption(args, "--password-file", defaults.passwordFile)
  );
  const outputFile = resolveRepoPath(readOption(args, "--out", defaults.output));
  const iterations = Number(readOption(args, "--iterations", defaults.iterations));

  if (!Number.isSafeInteger(iterations) || iterations < 100000) {
    throw new Error("--iterations must be an integer >= 100000.");
  }

  if (hasFlag(args, "--init")) {
    initPrivateFiles(sourceFile, passwordFile, hasFlag(args, "--force"));
  }

  if (!fs.existsSync(sourceFile)) {
    throw new Error(
      `Missing ${path.relative(repoRoot, sourceFile)}. Run node scripts/encrypt-secret.js --init first.`
    );
  }

  if (!process.env.SECRET_PAGE_PASSWORD && !fs.existsSync(passwordFile)) {
    throw new Error(
      `Missing ${path.relative(repoRoot, passwordFile)} or SECRET_PAGE_PASSWORD.`
    );
  }

  const html = fs.readFileSync(sourceFile, "utf8");
  const password = readPassword(passwordFile);

  if (!password) {
    throw new Error("Password is empty.");
  }

  const payload = encryptHtml({ html, password, iterations });
  ensureInsideRepo(outputFile);
  fs.writeFileSync(outputFile, formatPayload(payload));

  console.log(`Encrypted ${path.relative(repoRoot, sourceFile)}`);
  console.log(`Wrote ${path.relative(repoRoot, outputFile)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
