import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];

function report(level, name, detail) {
  results.push({ level, name, detail });
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function executableVersion(candidates, args = ['--version']) {
  for (const candidate of candidates.filter(Boolean)) {
    const result = spawnSync(candidate, args, { encoding: 'utf8', windowsHide: true });
    if (!result.error && result.status === 0) {
      return String(result.stdout || result.stderr).trim().split(/\r?\n/)[0];
    }
  }
  return null;
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
report(nodeMajor >= 22 ? 'PASS' : 'FAIL', 'Node.js', `major version ${nodeMajor}; project requires 22 or newer`);

const packageConfig = readJson('package.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');
const androidConfig = readJson('src-tauri/tauri.android.conf.json');
const cargoManifest = fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
const cargoVersion = /^version = "([^"]+)"/m.exec(cargoManifest)?.[1] ?? null;
const expectedAndroidCode = packageConfig.version.split('.').reduce(
  (value, part, index) => value + Number(part) * [1_000_000, 1_000, 1][index],
  0,
);
const versionsMatch = packageConfig.version === tauriConfig.version
  && packageConfig.version === cargoVersion
  && androidConfig.bundle.android.versionCode === expectedAndroidCode;
report(versionsMatch ? 'PASS' : 'FAIL', 'Release version', versionsMatch ? packageConfig.version : 'package, Tauri, Cargo, or Android version differs');

const requiredFiles = [
  'package-lock.json', 'firestore.rules', 'cms/.env.example',
  'src-tauri/capabilities/cms-local.json', 'src-tauri/capabilities/cms-android.json',
  'docs/threat-model.md', 'docs/user-guide.md', 'docs/final-setup-checklist.md',
];
const missingFiles = requiredFiles.filter((file) => !exists(file));
report(missingFiles.length ? 'FAIL' : 'PASS', 'Required project files', missingFiles.length ? `missing ${missingFiles.join(', ')}` : 'present');

const envPath = path.join(root, 'cms/.env.local');
const envKeys = [
  'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_EDITOR_UIDS',
];
if (!fs.existsSync(envPath)) {
  report('WARN', 'Firebase local configuration', 'cms/.env.local is not present');
} else {
  const names = new Map(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    return match ? [[match[1], match[2]]] : [];
  }));
  const invalid = envKeys.filter((key) => !names.get(key) || /replace-with|example/i.test(names.get(key)));
  report(invalid.length ? 'WARN' : 'PASS', 'Firebase local configuration', invalid.length ? `missing or placeholder keys: ${invalid.join(', ')}` : 'all required key names are configured');
}

const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
report(rules.includes('APPROVED_FIREBASE_UID') ? 'WARN' : 'PASS', 'Firestore editor allowlist', rules.includes('APPROVED_FIREBASE_UID') ? 'placeholder must be replaced before deployment' : 'configured');
report(process.env.ARTA_GITHUB_APP_CLIENT_ID ? 'PASS' : 'WARN', 'GitHub App Client ID', process.env.ARTA_GITHUB_APP_CLIENT_ID ? 'environment variable is present' : 'ARTA_GITHUB_APP_CLIENT_ID is not set in this shell');

const home = os.homedir();
const cargo = executableVersion([
  process.platform === 'win32' ? path.join(home, '.cargo/bin/cargo.exe') : path.join(home, '.cargo/bin/cargo'),
  'cargo',
]);
report(cargo ? 'PASS' : 'WARN', 'Rust/Cargo', cargo ?? 'not found; required for native builds');

const javaHomes = [
  process.env.JAVA_HOME,
  process.platform === 'win32' ? 'C:/Program Files/Android/Android Studio/jbr' : null,
].filter(Boolean);
const java = executableVersion([
  ...javaHomes.map((homePath) => path.join(homePath, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')),
  'java',
], ['-version']);
report(java ? 'PASS' : 'WARN', 'Java', java ? 'available for Android/Firestore tooling' : 'not found in JAVA_HOME, Android Studio, or PATH');

const androidHomes = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk') : path.join(home, 'Android/Sdk'),
].filter(Boolean);
report(androidHomes.some((value) => fs.existsSync(value)) ? 'PASS' : 'WARN', 'Android SDK', androidHomes.some((value) => fs.existsSync(value)) ? 'found' : 'not found; optional unless building Android');

for (const result of results) {
  console.log(`[${result.level}] ${result.name}: ${result.detail}`);
}
const failures = results.filter((result) => result.level === 'FAIL').length;
const warnings = results.filter((result) => result.level === 'WARN').length;
console.log(`Doctor completed with ${failures} failure(s) and ${warnings} warning(s).`);
if (failures) process.exitCode = 1;
