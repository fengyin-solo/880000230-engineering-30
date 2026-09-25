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

示例数据在 `src/data/archiveBoxes.js`，沿用批次档案字段（`code/title/pages/risk/status/note`）并新增盒号 `boxNo`，状态覆盖待入盒、暂存、已完成。

```bash
npm run export:archive                          # 导出到 exports/
npm run export:archive -- --out-dir path/to/dir # 自定义输出目录
npm test                                        # 运行导出链路测试
```

- 输出 `exports/archive-manifest.json`（清单）与 `exports/archive-manifest.report.json`（含 sha256 校验和的可追踪报告）。
- 清单键序固定、记录按状态再按盒号排序，重复执行内容一致；导出后清单对象被深冻结，不可再改动。
- 盒号重复、字段缺失：退出码 1，报告逐条列出记录下标与字段；写入失败：退出码 2，报告包含失败路径与系统错误信息。清单采用临时文件 + 重命名的原子写入，失败时不会留下半截文件。
