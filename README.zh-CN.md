# DSH Bun 兼容补丁

让 **DeepSeek Harness (DSH)** 能在 **Bun 1.3.14+** 上运行的兼容层，无需任何 Node 进程桥接。

启动时，本补丁会原地修改用户已安装的 DSH 包内的两个文件：

- `node_modules/@deepseek-ai/dsh-code-runtime-worker-thread/lib/index.js`：把 `node:module` 的 import 改指向本兼容层。
- `node_modules/@deepseek-ai/dsh/lib/profile-boot-*.js`：给 Cordis 服务端 HMR 循环加上守卫（该循环依赖 Node 内部 ESM loader hook，Bun 未提供）。

退出时所有修改会被还原，因此正常退出后用户的 `node_modules` 保持原样。

## 解决的问题

DSH 依赖若干 Node API。Bun 1.3.14 已经原生覆盖了绝大多数，但与 DSH code runtime 直接相关的缺失接口只剩一项：

- **`node:module.stripTypeScriptTypes`**：Bun 的 `node:module` shim 没有导出该函数。本兼容层基于 `Bun.Transpiler({ loader: "ts" }).transformSync` 重新实现，语义等价且同步，符合 DSH 通过 `workerData` 传入 TS 源码时对同步性的要求。

DSH 用到的其他 API 都由 Bun 原生覆盖：

- **`node:worker_threads`**：完全支持（`Worker`、`workerData`、`parentPort`、`resourceLimits`、`stdout` / `stderr`、`eventLoopUtilization`）。
- **Cordis 服务端 HMR**：通过环境变量守卫整体禁用，因为 Bun 缺少 Cordis 依赖的 Node 内部 ESM loader hook。

不 fork Node 进程，不要求 `PATH` 上有 `node`，不创建影子目录。

## 环境要求

- Bun `>= 1.3.14`（推荐 `>= 1.4.0`）。
- `@deepseek-ai/dsh ^0.1.1-rc.2`。

检查你的运行时：

```sh
bun --version
```

本补丁是针对 DSH `0.1.1-rc.2` 的构建产物编写的。升级 Bun 或 DSH 后，请重新验证补丁逻辑是否仍然适用。

## 安装

在同一个项目里与 DSH 一起安装：

```sh
bun add -d dsh-bun-compat-patch
bun add @deepseek-ai/dsh
bun run build
```

`bun run build` 会在 `./lib/` 下产出 `{preload,node-module}.js`（以及对应的 `.map` source map）。

## 使用方式

通过 Bun 加载兼容层启动 DSH：

```sh
bun --preload ./lib/preload.js ./node_modules/@deepseek-ai/dsh/lib/bin.js web --port 39881
```

preload 会识别 DSH 入口文件、原地打补丁、把 DSH 作为 Bun 子进程拉起、转发 `SIGINT` / `SIGTERM`，最后在退出前还原所有改动。

### 环境变量

| 变量 | 设置方 | 作用 |
| --- | --- | --- |
| `DSH_BUN_COMPAT_CHILD` | preload | 标记被 spawn 出的子进程，使 preload 在子进程中变为 no-op，避免递归打补丁。 |
| `DSH_BUN_COMPAT_DISABLE_HMR` | preload | 让被 patch 的 `profile-boot-*.js` 跳过 Cordis HMR 循环。 |
| `DSH_BUN_COMPAT_LIB` | preload（可选） | 覆盖 `lib/node-module.js` 所在目录的路径。preload 默认从 `import.meta.dir` 向上搜索。 |
| `DSH_BUN_COMPAT_DEBUG` | 用户 | 设置后会把任何未捕获错误（包括 `cause` 和聚合的 `errors[]`）以缩进树形结构打到 stderr。 |

## 原地补丁的工作机制

1. `prepareInPlacePatch` 读取 `dsh-code-runtime-worker-thread/lib/index.js`，把原始字节备份到 `$TMPDIR/dsh-bun-compat-patch-backup-*/index.js.bak`，然后把 `from "node:module"` 重写为 `from "<compatLib>/node-module.js"`（通过 `file://` URL）。文件首部加上一行标记注释，第二次启动可以识别出该文件已被打过补丁，跳过重复打补丁。
2. `patchHmrGuards` 遍历所有 `dsh/lib/profile-boot-*.js`，把现成的 `if (!signalShutdown.signal.aborted && ctx.fiber.state === 2 && ctx.get("loader") !== void 0) try {` 守卫前面加上 `!process.env.DSH_BUN_COMPAT_DISABLE_HMR &&`，使 HMR 循环在 Bun 下短路。
3. 无论正常退出、信号触发还是 `process.exit`，`restorePatch` 都会遍历所有备份，把原字节写回，然后删除备份目录。

如果父进程在清理前被杀掉（`kill -9`、断电等），下一次启动会看到 DSH 文件上的标记注释，但本次没有对应备份 → 跳过重打补丁，文件保持已 patch 状态。这种情况下用户需要重装 DSH（或手动还原文件）。把任何对父进程的 `kill -9` 都视为让 DSH 处于脏状态。

## 项目结构

```
src/
  preload.ts      # Bun --preload 入口；负责协调打补丁 + spawn 子进程
  node-module.ts  # 基于 Bun.Transpiler 的 stripTypeScriptTypes 实现
  shadow.ts       # 原地 patch / 还原 / HMR 守卫辅助函数
  diagnostic.ts   # 可选的未捕获错误树打印（受环境变量开关）
build.ts          # 打包 preload 并把 node-module.js 输出到 ./lib
tsconfig.json     # 严格模式 TS，noEmit，noUnusedLocals / noUnusedParameters
```

构建仅向 `./lib/` 输出两个文件：

- `preload.js`：与 `shadow.ts`、`diagnostic.ts` 一起内联打包。
- `node-module.js`：独立文件，被 patch 后的 DSH 入口通过 `file://` URL 引用。

## 脚本

| 脚本 | 作用 |
| --- | --- |
| `bun run build` | 从 `./src` 构建 `./lib`。 |
| `bun run typecheck` | `tsc --noEmit`，按严格 tsconfig 检查类型。 |
| `bun run pack` | `bun pm pack`，生成 npm tarball。 |

## 许可证

MIT。