import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phonemeDataPath = path.join(rootDir, 'src', 'data', 'phonemes.json');
const sourceDataPath = path.join(rootDir, 'src', 'data', 'phoneme-audio-sources.json');
const resolvedDataPath = path.join(rootDir, 'src', 'data', 'phoneme-audio-resolved.json');
const publicOutputRoot = path.join(rootDir, 'public', 'audio', 'phonetics');
const dryRun = process.argv.includes('--dry-run');
const apiEndpoint = 'https://commons.wikimedia.org/w/api.php';
const userAgent = 'TechnologyBlogAudioBuilder/1.0 (Wikimedia Commons attribution sync)';

const sections = JSON.parse(await readFile(phonemeDataPath, 'utf8'));
const sourceMap = JSON.parse(await readFile(sourceDataPath, 'utf8'));
const phonemes = sections.flatMap((section) => section.phonemes);
const phonemeById = new Map(phonemes.map((phoneme) => [phoneme.id, phoneme]));
const sourceEntries = Object.entries(sourceMap);

const missingSources = phonemes.filter((phoneme) => !sourceMap[phoneme.id]).map((phoneme) => phoneme.id);
const unknownSources = sourceEntries.filter(([id]) => !phonemeById.has(id)).map(([id]) => id);

if (missingSources.length) throw new Error(`这些音标缺少 Wikimedia 音频映射：${missingSources.join(', ')}`);
if (unknownSources.length) throw new Error(`音频映射包含未知 ID：${unknownSources.join(', ')}`);

const stripFilePrefix = (title) => title.replace(/^File:/i, '');
const cleanMetadata = (value = '') => String(value)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#039;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const remoteByFilename = new Map();
for (let index = 0; index < sourceEntries.length; index += 20) {
  const batch = sourceEntries.slice(index, index + 20);
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    prop: 'videoinfo',
    viprop: 'url|mime|size|extmetadata|derivatives',
    titles: batch.map(([, source]) => `File:${source.file}`).join('|'),
  });
  const response = await fetch(`${apiEndpoint}?${params}`, { headers: { 'User-Agent': userAgent } });
  if (!response.ok) throw new Error(`Wikimedia Commons API 请求失败：HTTP ${response.status}`);
  const payload = await response.json();
  for (const page of payload.query?.pages ?? []) {
    if (page.missing || !page.videoinfo?.[0]) continue;
    remoteByFilename.set(stripFilePrefix(page.title), page.videoinfo[0]);
  }
}

const missingRemoteFiles = sourceEntries
  .filter(([, source]) => !remoteByFilename.has(source.file))
  .map(([, source]) => source.file);
if (missingRemoteFiles.length) {
  throw new Error(`Wikimedia Commons 上找不到这些文件：\n- ${missingRemoteFiles.join('\n- ')}`);
}

const missingTranscodes = sourceEntries
  .filter(([, source]) => !remoteByFilename.get(source.file)?.derivatives?.some((item) => item.type === 'audio/mpeg'))
  .map(([, source]) => source.file);
if (missingTranscodes.length) {
  throw new Error(`这些 Wikimedia 音频暂时没有 MP3 转码：\n- ${missingTranscodes.join('\n- ')}`);
}

if (dryRun) {
  const wordSamples = sourceEntries.filter(([, source]) => source.sample === 'word').length;
  console.log(`配置校验通过：${sourceEntries.length} 个 Wikimedia Commons 真人音频，其中 ${wordSamples} 个双元音采用最短示例词。`);
  process.exit(0);
}

const files = sourceEntries.map(([id, source]) => {
  const remote = remoteByFilename.get(source.file);
  const mp3 = remote.derivatives.find((item) => item.type === 'audio/mpeg');
  const metadata = remote.extmetadata ?? {};
  return {
    id,
    ipa: phonemeById.get(id).ipa,
    url: mp3.src,
    sourceFile: source.file,
    sourcePage: remote.descriptionurl,
    sample: source.sample,
    sampleLabel: source.sampleLabel ?? null,
    author: cleanMetadata(metadata.Artist?.value) || '见文件说明页',
    license: cleanMetadata(metadata.LicenseShortName?.value) || cleanMetadata(metadata.UsageTerms?.value) || '见文件说明页',
    licenseUrl: metadata.LicenseUrl?.value || remote.descriptionurl,
  };
});

const resolvedData = Object.fromEntries(files.map((file) => [file.id, {
  file: file.sourceFile,
  url: file.url,
  sourcePage: file.sourcePage,
  sample: file.sample,
  sampleLabel: file.sampleLabel,
} ]));

const manifest = {
  provider: 'Wikimedia Commons',
  syncedAt: new Date().toISOString(),
  delivery: 'Wikimedia official MP3 transcodes for vowels; local short audio for consonants',
  count: files.length,
  isolatedOrIpaSamples: files.filter((file) => file.sample === 'ipa').length,
  shortWordSamples: files.filter((file) => file.sample === 'word').length,
  files,
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const attributionItems = files.map((file) => {
  const sampleNote = file.sample === 'word' ? `；短示例词：${escapeHtml(file.sampleLabel)}` : '';
  return `<li><strong>/${escapeHtml(file.ipa)}/</strong> — <a href="${escapeHtml(file.sourcePage)}">${escapeHtml(file.sourceFile)}</a>；作者：${escapeHtml(file.author)}；许可：<a href="${escapeHtml(file.licenseUrl)}">${escapeHtml(file.license)}</a>${sampleNote}</li>`;
}).join('\n');

const attributionHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>英语音标音频来源与许可</title>
  <style>body{max-width:960px;margin:0 auto;padding:40px 22px;background:#0b100f;color:#dce9e4;font:16px/1.75 system-ui,sans-serif}h1{color:#a7f3d0}a{color:#58d6a7}li{margin:.7rem 0}.note{color:#9aa9a4}</style>
</head>
<body>
  <h1>英语音标音频来源与许可</h1>
  <p class="note">元音音频由 Wikimedia Commons 官方 MP3 转码地址按需播放，每个文件遵循其说明页标注的独立许可证，本站未剪辑音频。辅音使用项目内原有的本地独立短音；下方仍保留全部 Wikimedia 映射供核对。少数没有独立录音的双元音使用极短真人示例词。</p>
  <ol>${attributionItems}</ol>
</body>
</html>\n`;

await mkdir(publicOutputRoot, { recursive: true });
await writeFile(resolvedDataPath, `${JSON.stringify(resolvedData, null, 2)}\n`, 'utf8');
await writeFile(path.join(publicOutputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(publicOutputRoot, 'attribution.html'), attributionHtml, 'utf8');

console.log(`完成：已同步 ${files.length} 个 Wikimedia 真人音频地址及其来源与许可证。无需账号、密钥或银行卡。`);
