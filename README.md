# DSH Bun Compatibility Patch

`dsh-bun-compat-patch` 是一个用于在 **Bun 1.3.14** 上运行 DeepSeek Harness（DSH）的兼容层。

它不会修改 Bun，也不会直接修改项目中已经安装的 DSH。启动时，兼容层会在 DSH 项目根目录创建一个临时的依赖影子副本，只对需要兼容的 DSH 模块进行转换，然后从影子副本启动 DSH。

## 解决的问题

DSH 的部分功能依赖 Node.js API，而 Bun 1.3.14 尚未完整实现这些行为。本项目主要提供以下兼容处理：

- 使用系统 Node.js 实现 `node:module` 的 `stripTypeScriptTypes`。
- 使用 Node.js 原生 `worker_threads.Worker` 执行代码运行时任务。
- 在 Bun 与 Node Worker 之间桥接 `workerData`、`parentPort` 和消息事件。
- 转发 Worker 的 `stdout` 与 `stderr`。
- 保留 Node Worker 的 `resourceLimits` 内存限制能力。
- 提供 `eventLoopUtilization` 的缓存采样结果。
- 在兼容模式下禁用 Bun 1.3.14 无法支持的服务端 profile/config HMR。

## 环境要求

使用前需要准备：

- Bun 1.3.14。
- Node.js 22.6.0 或更高版本。
- `node` 命令必须可以从 `PATH` 中直接执行。
- DeepSeek Harness 0.1.0-rc.7。

检查本机版本：

```sh
bun --version
node --version
```

当前补丁针对 Bun 1.3.14 和 DSH 0.1.0-rc.7 的构建产物编写。升级 Bun 或 DSH 后，应重新确认兼容层中的转换规则仍然适用。

## 安装依赖与构建

进入补丁项目目录：

```sh
cd dsh-bun-compat-patch
bun install
bun run build
```

构建成功后会生成 `lib/` 目录。所有运行入口都位于该目录中，并附带 sourcemap。

每次修改 `src/` 下的 TypeScript 文件后，都需要重新执行：

```sh
bun run build
```

## 目录位置要求

兼容层会从自身所在目录开始向上查找：

```text
node_modules/@deepseek-ai/dsh/package.json
```

因此需要满足以下任意一种目录关系：

1. 补丁就是当前项目，并且 DSH 安装在它自己的 `node_modules` 中。
2. 补丁目录位于 DSH 项目根目录内部。
3. 补丁已经作为依赖安装到 DSH 项目的 `node_modules` 中。

例如，使用源码目录时可以采用下面的结构：

```text
my-dsh-project/
├── node_modules/
│   └── @deepseek-ai/
│       └── dsh/
└── dsh-bun-compat-patch/
    └── lib/
        └── preload.js
```

如果补丁目录与 DSH 项目是互不包含的两个平级目录，预加载器将无法找到 DSH。此时应将补丁安装为项目依赖，或者把补丁目录放入 DSH 项目中。

## 使用源码启动 DSH

如果当前补丁项目自身已经通过 `bun install` 安装了 DSH，可以直接在补丁根目录运行：

```sh
bun --preload ./lib/preload.js \
  ./node_modules/@deepseek-ai/dsh/lib/bin.js web
```

如果补丁位于另一个 DSH 项目内，应先进入 DSH 项目根目录：

```sh
cd my-dsh-project

bun --preload ./dsh-bun-compat-patch/lib/preload.js \
  ./node_modules/@deepseek-ai/dsh/lib/bin.js web
```

启动成功后，终端会显示 DSH Web 服务的访问地址。

### 指定端口

DSH 的命令行参数应放在入口文件和 `web` 命令之后。例如使用端口 `39876`：

```sh
bun --preload ./dsh-bun-compat-patch/lib/preload.js \
  ./node_modules/@deepseek-ai/dsh/lib/bin.js web --port 39876
```

如果直接在补丁根目录启动，则对应命令为：

```sh
bun --preload ./lib/preload.js \
  ./node_modules/@deepseek-ai/dsh/lib/bin.js web --port 39876
```

其他 DSH 命令行参数也会原样传递给真正的 DSH 进程。

## 作为本地包使用

先在补丁目录制作 npm tarball：

```sh
cd dsh-bun-compat-patch
bun run pack
```

`pack` 会先通过 `prepack` 自动重新构建，然后生成类似下面的文件：

```text
dsh-bun-compat-patch-0.1.0.tgz
```

在 DSH 项目中安装该 tarball：

```sh
cd my-dsh-project
bun add --dev /absolute/path/to/dsh-bun-compat-patch-0.1.0.tgz
```

安装后可以使用包导出的 preload 入口：

```sh
bun --preload dsh-bun-compat-patch/preload \
  ./node_modules/@deepseek-ai/dsh/lib/bin.js web
```

指定端口：

```sh
bun --preload dsh-bun-compat-patch/preload \
  ./node_modules/@deepseek-ai/dsh/lib/bin.js web --port 39876
```

发布包只包含运行所需的 `lib/`、README 和包清单，不包含 TypeScript 源码。

## 调试模式

需要查看未捕获异常的嵌套错误信息时，可以设置 `DSH_BUN_COMPAT_DEBUG=1`：

```sh
DSH_BUN_COMPAT_DEBUG=1 \
bun --preload ./lib/preload.js \
  ./node_modules/@deepseek-ai/dsh/lib/bin.js web
```

使用已安装的包时：

```sh
DSH_BUN_COMPAT_DEBUG=1 \
bun --preload dsh-bun-compat-patch/preload \
  ./node_modules/@deepseek-ai/dsh/lib/bin.js web
```

兼容层使用的其他 `DSH_BUN_COMPAT_*` 环境变量由预加载器自动设置，通常不需要手动配置。

## 影子依赖缓存

每次启动时，兼容层会在 DSH 项目根目录创建：

```text
.dsh-bun-compat-patch-cache/
```

这个目录包含经过转换的 DSH 影子副本。原始 `node_modules` 不会被修改。

缓存会在下次启动时自动删除并重新创建，不需要手动维护。不要把该目录提交到版本控制系统。同一个 DSH 项目不建议同时启动多个兼容层实例，因为它们会共用并重建同一个缓存目录。

## HMR 限制

Bun 1.3.14 缺少 Cordis 所需的 Node 私有 ESM loader，因此兼容模式会禁用服务端 profile/config HMR。

修改 DSH profile 或服务端配置后，需要停止并重新启动 DSH。前端自身支持的刷新行为不受此说明保证。

## 打包脚本

项目只保留构建和打包相关脚本：

```sh
# 编译 TypeScript 到 lib/
bun run build

# 重新构建并生成 npm tarball
bun run pack
```

直接执行 `bun pm pack` 时也会触发 `prepack`，确保 tarball 中包含最新构建结果。

## 常见问题

### 找不到包含 @deepseek-ai/dsh 的项目根目录

说明兼容层从自身目录向上没有找到 DSH。确认：

- 已经执行 `bun install`。
- `node_modules/@deepseek-ai/dsh/package.json` 确实存在。
- 补丁目录位于 DSH 项目内部，或者补丁已安装到该项目的 `node_modules`。

### stripTypeScriptTypes 执行失败

先确认实际执行的 Node.js：

```sh
which node
node --version
```

Node.js 版本需要不低于 22.6.0，并且必须提供 `node:module` 的 `stripTypeScriptTypes`。

### 端口已被占用

更换 Web 服务端口：

```sh
bun --preload ./lib/preload.js \
  ./node_modules/@deepseek-ai/dsh/lib/bin.js web --port 39876
```

### 修改源码后行为没有变化

源码不会在启动时自动编译。重新执行：

```sh
bun run build
```

然后停止并重新启动 DSH。

### 升级 DSH 后启动失败

该兼容层会转换 DSH 的特定构建产物。DSH 升级可能改变文件名或代码结构，导致转换规则无法匹配。遇到这种情况时，应先恢复到已验证的 `@deepseek-ai/dsh@0.1.0-rc.7`。

## 工作原理

启动流程如下：

1. Bun 加载 `lib/preload.js`。
2. 预加载器查找包含 DSH 的项目根目录。
3. 在 `.dsh-bun-compat-patch-cache/` 中创建依赖影子副本。
4. 将 DSH code runtime 对 `node:module` 和 `node:worker_threads` 的导入替换为兼容实现。
5. 调整 DSH profile 启动代码并禁用不兼容的服务端 HMR。
6. Bun 从影子副本重新启动 DSH。
7. 需要 Worker 时，兼容层启动系统 Node.js，并由 Node 原生 Worker 执行目标代码。

这种方式将改动限制在临时缓存目录中，删除缓存即可移除所有运行期转换结果。

## 项目信息

- 作者：[MonshinYu](https://github.com/MonshinYu)
- 邮箱：[MonshinYu@Gmail.com](mailto:MonshinYu@Gmail.com)
- 代码仓库：[github.com/MonshinYu/dsh-bun-compat-patch](https://github.com/MonshinYu/dsh-bun-compat-patch)
- 问题反馈：[GitHub Issues](https://github.com/MonshinYu/dsh-bun-compat-patch/issues)

## 许可证

本项目采用 [MIT License](./LICENSE)。
