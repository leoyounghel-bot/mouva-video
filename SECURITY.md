# Private configuration / 私人配置

This open-source repository contains the Studio application code and synthetic teaching assets. API credentials, session secrets, private projects and deployment environment files must stay outside Git. The `.env*.example` files contain empty placeholders only. Never store provider credentials in `VITE_*` variables; frontend variables are included in browser bundles.

本仓库开源 Studio 应用代码和合成教学素材。API 密钥、会话密钥、私人项目及部署环境文件不进入 Git。`.env*.example` 仅提供空值示例。不要把模型密钥放进 `VITE_*` 变量，这些变量会打包到浏览器中。

Run `npm run check:public` before a push. CI runs the same check. It detects common credential formats, private file paths and values matching locally configured secrets, without printing matched values. This is a guardrail rather than a guarantee against every secret format.

推送前运行 `npm run check:public`，CI 也会执行。检查会识别常见密钥格式、私人文件路径，以及与本地已配置密钥相同的内容；不会输出密钥原文。它不能覆盖所有密钥格式。

If a credential was published, revoke or rotate it with its provider. Deleting it from the current branch does not remove it from Git history or existing clones. Do not include credentials in public issues, screenshots or logs.

若密钥曾经公开，请在提供商处撤销或更换。仅删除当前文件不会清除历史记录或已有副本。不要在公开 issue、截图或日志里粘贴密钥。
