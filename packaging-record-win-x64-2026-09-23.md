# Windows 桌面打包记录 — 0.1.7-alpha.2.20260923.1

- 日期：2026-09-23（Asia/Shanghai）
- 目标：Windows x64、未签名、个人使用的安装包
- 结果：安装包已生成并通过独立验证；打包脚本最后一步的整体 smoke 因**构建目录路径过长**失败，已在短路径副本上复跑通过

## 一、产物

| 项目 | 值 |
|---|---|
| 安装包 | `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/deepseek-harness-0.1.7-alpha.2.20260923.1-win-x64-unsigned.exe` |
| 大小 | 312,808,949 字节（约 298 MiB） |
| SHA-256 | `CD74ABBD717CC7C3C67EE9F3C0081C315EA07F3E50B63AC28D3BD93B6F4E4BD7` |
| 附带文件 | 同名 `.exe.blockmap`（未签名构建无自动更新配置，blockmap 仅作记录） |
| 打包记录 | `apps/desktop/.desktop-build/packaging-runs/2026-09-23T02-26-58.141Z-bN8GLc/`（`run.json`、`events.jsonl`、`stdout.log`、`stderr.log`、`result.json`） |

版本号按仓库规则确认：dsh 基础版本为 `0.1.7-alpha.2`，测试构建保留完整预发布段并追加 `.YYYYMMDD.index`，故本次为 `0.1.7-alpha.2.20260923.1`（当天序号 1）。

> `pnpm run clean` 会删除整个 `apps/desktop/.desktop-build/`，**包括这个安装包**。长期保存请先把 exe 复制到构建目录之外。

## 二、环境与前置条件

| 项目 | 值 |
|---|---|
| 主机 | Windows x64 |
| Node / pnpm | v24.14.1 / 11.7.0（仓库 `packageManager` 声明 pnpm 11.7.0） |
| Python | 3.14.6（在 PATH 上，`PYTHON` 未另行设置） |
| C++ 工具链 | Visual Studio 18 Community，含 `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`（`vswhere` 探测通过） |
| 归档工具 | `C:\WINDOWS\system32\tar.exe`（探针的打包/列举往返通过）、7z（scoop） |
| Electron | 44.0.0（由 `apps/desktop/package.json` 决定，打包时下载 win32-x64 归档） |
| 网络 | `github.com` 直连超时，需本地代理 `http://127.0.0.1:7890`；npm registry 可直连 |
| 配置文件 | `apps/desktop/.env.windows`（Git 忽略） |

`.env.windows` 现状：`DSH_DESKTOP_APP_ID=com.deepseek.harness`、`DSH_DESKTOP_AUTO_UPDATE_ENV=production`、两个 `DSH_DESKTOP_MANDATORY_UPDATE_*_ORIGIN` 已填写；四个 Windows 签名字段（`CER_FILE`、`SIGNTOOL`、`KEY_CONTAINER`、`TOKEN_PIN`）均为空，因此本次只能走未签名通道。

**关键环境变量**：Node 自带的 `fetch`（undici）默认不读 `HTTP_PROXY`。第一次运行就是在 `download:electron` 阶段因直连 GitHub 超时而失败（证据：`packaging-runs/2026-09-23T02-18-10.193Z-7CqMl5/`，报错 `ConnectTimeoutError … 185.199.108.133:443`）；补上 `NODE_USE_ENV_PROXY=1` 后下载恢复正常。打包脚本会把父进程环境（除 `DSH_DESKTOP_*` / `CSC_*` / `APPLE_*` / `DOWNLOAD_*` 这类发布设置外）原样传给子进程，所以代理变量能生效。

## 三、打包前的代码状态

| 提交（按先后） | 说明 |
|---|---|
| `revert(desktop): drop the fork-only api-gateway runtime peers` | 去掉此前合并时保留的 apps/desktop 额外生产依赖；上游同一处修复已用 `@deepseek-ai/cordis` 解决同一个 `ERR_MODULE_NOT_FOUND` |
| `Merge upstream master` | 本地 `master` 先快进到 `origin/master`（1302 个提交），再合并 upstream 的 162 个新提交 |

工作区干净（`git status` 无输出）；本地 `master` 领先 `origin/master` 164 个提交，**尚未推送**。

## 四、打包命令

```powershell
$env:HTTP_PROXY='http://127.0.0.1:7890'
$env:HTTPS_PROXY='http://127.0.0.1:7890'
$env:ALL_PROXY='http://127.0.0.1:7890'
$env:NODE_USE_ENV_PROXY='1'

pnpm --dir apps/desktop run package:win:x64:unsigned --build-version 0.1.7-alpha.2.20260923.1
```

对应脚本：`tsx scripts/package-target.ts win-x64 --unsigned`。未签名通道不要求 EV 证书，产物名带 `-unsigned` 后缀，且不写发布完成记录。

## 五、阶段耗时（第二次运行）

单次运行总计 **939.8 秒（约 15.7 分钟）** 走到失败点（第一阶段为并行子阶段，嵌套耗时不可相加）。

| 阶段 | 耗时 |
|---|---|
| `configuration` / `toolchain` | 0.1 s |
| `run build:official` | 48 s |
| `run release:pack --family dsh` | 175 s |
| `run release:pack --family vendor` | 5.6 s |
| `native/system` 构建与 landlock 打包 | 2.1 s |
| `download:electron` | 55.5 s |
| `extract:electron` | 3.3 s |
| `prepare:primary-runtime` | 115 s |
| `run prepare:packages` | 6 s |
| `run prepare:dsh`（含 runtime 安装/物化/smoke） | 272 s |
| `exec electron-builder --win --x64` | 230 s |
| `exec tsx scripts/smoke-packaged-runtime.ts --unsigned` | 23 s，**exit 1** |

产物在 electron-builder 阶段就已写出，最后的 smoke 失败不影响 exe 本身。

## 六、失败诊断：末尾 smoke

报错（`packaging-runs/…-bN8GLc/stderr.log`）：

```
Error: desktop runtime: docx conversion failed: OfficeToPdfError: LibreOffice conversion failed.
  [cause]: ConversionError: LibreOffice native conversion failed: Unknown LibreOfficeKit exception
```

直接运行打包出来的原生引擎可见根因：

```
Bootstrapping exception 'stat'ed file does not exist:
file:///C:/Users/Sycamore/Workspace/Self/deepseek-harness/apps/desktop/.desktop-build/targets/win-x64/
unsigned-artifacts/win-unpacked/resources/app.asar.unpacked/dsh/node_modules/
@deepseek-ai/libreoffice-kit-win32-x64/program/program/../share/registry/base.xcd
{"ok":false,"code":"failed","error":"Unknown LibreOfficeKit exception"}
```

结论：**这是构建路径过长导致的，不是产物缺陷。**

1. 该绝对路径 252 个字符，LibreOffice 内部再拼上 `file:///` 前缀后越过 260 字符（MAX_PATH）上限，bootstrap 的 `stat` 因此失败。
2. 被报"不存在"的文件确实存在：打包副本与 pnpm store 中的引擎完全一致（2050 个文件、325.1 MB；`program/share/registry/base.xcd` 10414 字节）。
3. 把同一个引擎副本放到短路径（`C:\lo-short`、以及 pnpm store 内的副本）用相同参数转换同一个 DOCX，均返回 `{"ok":true,"missingFonts":[]}` 并生成 PDF。
4. 安装后不会再触发：安装目录之后的固定部分 `resources\app.asar.unpacked\dsh\node_modules\@deepseek-ai\libreoffice-kit-win32-x64\program\share\registry\base.xcd` 只有 115 个字符。也就是说**安装目录短于约 145 个字符就安全**（`C:\Program Files\DeepSeek Harness` 为 149 字符，`C:\DeepSeekHarness` 为 134 字符），而本次构建目录一律在 250 字符以上。

## 七、独立验证（短路径复跑）

把打包好的 `win-unpacked` 整体复制到 `C:\dsh-run`（短路径），用导出函数直接复跑同一条 packaged-runtime smoke：

```
await smokePreparedRuntime(<app>\resources\app.asar\dsh, <app>\DeepSeek Harness.exe, <app>\resources\runtime, descriptor)
```

结果：

```
{"node":"24.18.1","platform":"win32","arch":"x64","koffi":true,"sharp":true,"html":true,"pty":true,"pnpm":true,"grep":true,"glob":true}
dsh web: http://127.0.0.1:59282/?token=…
desktop runtime: DOCX, XLSX, PPTX to PDF passed
verify-short-app: packaged runtime smoke passed
```

即：归档完整性、载荷检查（koffi / sharp / html / pty / pnpm / ripgrep 检索 / 文件枚举）、Host 启动、Office（DOCX、XLSX、PPTX）转 PDF 全部通过。验证用的临时副本与脚本均已删除。

## 八、安装与使用

- 双击 `deepseek-harness-0.1.7-alpha.2.20260923.1-win-x64-unsigned.exe`；按当前用户安装，安装目录可在安装界面修改。
- **建议选一个短路径**（例如 `C:\DeepSeekHarness`，安装后引擎文件路径约 134 字符）：路径越短，越不会触碰上面那条 260 字符上限。
- 未签名：Windows SmartScreen 会提示未知发布者，需要手动放行。
- 未配置自动更新：这个包是独立安装，不会连更新源。
- 卸载：设置 → 应用 → DeepSeek Harness，或安装目录内的卸载程序。

## 九、复现与后续

- **想让打包全程绿灯**：把仓库放到短路径（例如 `C:\src\dsh`）后重跑第四节的命令，末尾 smoke 就不会再因路径长度失败。
- **重跑**：直接再执行打包命令即可，脚本会覆盖 `apps/desktop/.desktop-build/targets/win-x64/` 下的产物；不需要手工清理。
- **代理**：任何需要访问 GitHub 的步骤（Electron 归档、electron-builder 的辅助二进制）都要带 `NODE_USE_ENV_PROXY=1` 和 `HTTP(S)_PROXY`。
- **改做签名生产包**：先在 `apps/desktop/.env.windows` 填好 `DSH_DESKTOP_WINDOWS_CER_FILE`、`DSH_DESKTOP_WINDOWS_SIGNTOOL`、`DSH_DESKTOP_WINDOWS_KEY_CONTAINER`、`DSH_DESKTOP_WINDOWS_TOKEN_PIN`，再用 `pnpm run package:desktop:win:x64`（产物名不带 `-unsigned`，并会写发布完成记录）。
- **版本号**：生产包用 dsh 基础版本 `0.1.7-alpha.2`；测试包沿用 `.YYYYMMDD.index` 规则，同一批次号复查已发布对象后再递增。
- 权威说明见 [apps/desktop/README.md](apps/desktop/README.md) 的 Package 章节。
