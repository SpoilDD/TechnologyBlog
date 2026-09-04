# Phonetic audio

这里存放由 `npm run audio:phonetics` 预生成的独立音标 MP3 文件。

- `en-GB/*.mp3`：英音
- `en-US/*.mp3`：美音
- `manifest.json`：最近一次生成信息

音频由 Azure Speech SSML 的 IPA `<phoneme>` 标签生成。真实密钥只在本地生成阶段使用，不会进入网页或产物。
