# DSH Bun Compatibility Patch（TypeScript 版）

这是一个可构建、可打包的 TypeScript 版本，用于在 Bun 1.3.14 上运行 DeepSeek Harness。它不会修改 Bun，也不会修改已安装的 DSH 包；启动时会创建依赖影子副本并仅转换需要兼容的导入。

## 构建

```sh
cd dsh-bun-compat-patch
bun run build
```

构建结果位于 `dist/`。Bun 入口与 Node helper 都会编译成 ESM JavaScript，并生成 sourcemap。

## 测试与检查

```sh
bun run test
bun run check
```

测试包括 TypeScript 位置保持剥离、workerData、parentPort、stdout、stderr、ELU、Node 原生 worker 内存限制，以及真实 DSH code-runtime 执行。

## 启动 DSH

在项目根目录执行：

```sh
bun --preload ./dsh-bun-compat-patch/dist/preload.js \
  node_modules/@deepseek-ai/dsh/lib/bin.js web
```

如果默认端口被占用，可以指定端口：

```sh
bun --preload ./dsh-bun-compat-patch/dist/preload.js \
  node_modules/@deepseek-ai/dsh/lib/bin.js web --port 39876
```

## 制作 npm 包

```sh
cd dsh-bun-compat-patch
bun run pack
```

`prepack` 会自动重新构建，生成的 tarball 只包含 `dist/`、`README.md` 和包清单。

## 兼容性说明

- `stripTypeScriptTypes`：同步调用系统 Node 的真实实现，保持源码位置。
- Worker：由 Bun facade 和 Node `worker_threads.Worker` 子进程桥接组成。
- `resourceLimits`：由 Node worker 原生执行。
- stdout/stderr：通过控制协议转发为 EventEmitter 形状。
- ELU：采集目标 worker 的数据并向 Bun 主进程提供缓存采样。
- 服务端 profile/config HMR：Bun 1.3.14 缺少 Cordis 所需的 Node 私有 ESM loader，因此兼容模式下禁用；修改配置后需重启 DSH。
