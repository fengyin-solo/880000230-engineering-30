#!/usr/bin/env node
// 无酸盒归档清单导出链路：读取示例数据 -> 校验 -> 构建冻结清单 -> 稳定序列化 -> 原子写入。
// 错误结果可追踪：盒号重复/字段缺失以退出码 1 结束，写入失败以退出码 2 结束，
// 均会在 exports 目录留下 archive-manifest.report.json 说明明细。

import { createHash } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { archiveBoxes } from '../src/data/archiveBoxes.js'
import { buildArchiveManifest, serializeArchiveManifest } from '../src/utils/archiveManifest.js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const MANIFEST_FILENAME = 'archive-manifest.json'
const REPORT_FILENAME = 'archive-manifest.report.json'

function parseArgs(argv) {
  const args = { outDir: 'exports' }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out-dir' && argv[i + 1]) {
      args.outDir = argv[i + 1]
      i += 1
    }
  }
  return args
}

// 先写临时文件再重命名，避免半截文件；失败时清理临时文件并返回可追踪原因。
async function writeFileAtomic(filePath, content) {
  const tmpPath = `${filePath}.tmp`
  try {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(tmpPath, content, 'utf8')
    await rename(tmpPath, filePath)
    return { ok: true }
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => {})
    return { ok: false, code: error.code ?? null, message: error.message }
  }
}

function serializeReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`
}

// 执行一次导出，返回可追踪结果；报告中的路径相对项目根，保证重复执行内容一致。
export async function exportArchiveManifest(options = {}) {
  const { records = archiveBoxes, outDir = path.join(rootDir, 'exports') } = options
  const manifestPath = path.join(outDir, MANIFEST_FILENAME)
  const reportPath = path.join(outDir, REPORT_FILENAME)
  const relativeManifestPath = path.relative(rootDir, manifestPath)

  const base = {
    manifestPath: relativeManifestPath,
    recordCount: 0,
    checksum: null,
    errors: [],
  }

  const build = buildArchiveManifest(records)
  if (!build.ok) {
    const report = { ...base, ok: false, stage: 'validate', manifestPath: null, errors: build.errors }
    const written = await writeFileAtomic(reportPath, serializeReport(report))
    return { ...report, reportPath, reportWritten: written.ok }
  }

  const content = serializeArchiveManifest(build.manifest)
  const checksum = `sha256:${createHash('sha256').update(content).digest('hex')}`

  const written = await writeFileAtomic(manifestPath, content)
  if (!written.ok) {
    const report = {
      ...base,
      ok: false,
      stage: 'write',
      manifestPath: null,
      errors: [{ issue: 'write-failed', path: relativeManifestPath, code: written.code, message: written.message }],
    }
    const reportWritten = await writeFileAtomic(reportPath, serializeReport(report))
    return { ...report, reportPath, reportWritten: reportWritten.ok }
  }

  const report = {
    ...base,
    ok: true,
    stage: 'done',
    recordCount: build.manifest.recordCount,
    checksum,
  }
  const reportWritten = await writeFileAtomic(reportPath, serializeReport(report))
  return { ...report, reportPath, reportWritten: reportWritten.ok }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outDir = path.resolve(rootDir, args.outDir)
  const result = await exportArchiveManifest({ outDir })

  process.stdout.write(serializeReport(result))

  if (!result.ok) {
    process.exitCode = result.stage === 'validate' ? 1 : 2
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main()
}
