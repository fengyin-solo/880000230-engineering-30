# solo-8800002

一个基于 Vite + Vue 3 的纯前端小众业务示例项目，主题是古籍虫蛀修复批次管理。

## 开发

```bash
npm install
npm run dev
```

`vite.config.js` 已显式配置 `server.open = false`，启动开发服务时不会自动打开浏览器。

## 构建

```bash
npm run build
```

## 无酸盒归档清单导出

将待入盒、暂存、已完成三类归档记录导出为稳定文件，链路为
`src/data/archiveManifestData.js`（示例数据）→
`scripts/lib/archiveManifestExport.js`（纯函数核心）→
`scripts/exportArchiveManifest.js`（CLI 落盘）。

### 本地运行

```bash
npm run export:archive
```

输出目录为 `exports/archive/`（已加入 `.gitignore`）：

- `archive-manifest.pending.json` / `archive-manifest.staging.json` / `archive-manifest.completed.json`：按状态分组的清单，记录按盒号排序。
- `archive-manifest.report.json`：导出报告，含各文件记录数与 sha256，可用于核对文件是否被改动。

成功时退出码为 0 并向 stdout 输出每个文件的动作（`created` / `updated` / `unchanged`）；
失败时退出码为 1 并向 stderr 输出结构化错误。

### 稳定性与不可变约定

- 导出内容只由示例数据决定：固定字段顺序、两空格缩进、按盒号码元排序，不含时间戳，重复执行得到一致内容。
- 内容未变化的文件不会重复写入；已导出文件会被设为只读（`0444`），下次导出如需覆盖会先解锁再重新锁定。
- 导出前会对输入记录做深度冻结，清单状态在链路中不可被改动。

### 错误码

| code | 含义 | 可追踪信息 |
| --- | --- | --- |
| `MISSING_FIELD` | 必填字段缺失（boxNo / batchCode / title / status） | 记录序号、盒号、缺失字段名 |
| `DUPLICATE_BOX_NO` | 盒号重复 | 盒号、全部重复记录序号 |
| `UNKNOWN_STATUS` | 状态不在待入盒/暂存/已完成之内 | 记录序号、盒号 |
| `WRITE_FAILED` | 输出目录或文件写入失败 | 文件名、系统错误信息 |

校验失败时不会写入任何清单文件，保留上一次成功导出的快照。

### 测试

```bash
npm test
```

覆盖盒号重复、字段缺失、未知状态、重复执行结果一致、输入冻结与稳定排序等场景。
