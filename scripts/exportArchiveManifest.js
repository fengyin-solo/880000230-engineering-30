import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  archiveManifestRecords,
  archiveManifestStatuses,
} from '../src/data/archiveManifestData.js'
import {
  ARCHIVE_EXPORT_ERROR_CODES,
  buildArchiveExport,
} from './lib/archiveManifestExport.js'

const OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../exports/archive',
)
const READ_ONLY_MODE = 0o444
const WRITABLE_MODE = 0o644

function printJson(stream, payload) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`)
}

// 内容一致则跳过写入，保持只读锁定；内容变化时先解锁再覆盖并重新锁定。
async function writeStableFile(file) {
  const target = path.join(OUTPUT_DIR, file.name)

  let existing = null
  try {
    existing = await readFile(target, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  if (existing === file.content) {
    await chmod(target, READ_ONLY_MODE)
    return 'unchanged'
  }

  if (existing !== null) {
    await chmod(target, WRITABLE_MODE)
  }
  await writeFile(target, file.content, 'utf8')
  await chmod(target, READ_ONLY_MODE)
  return existing === null ? 'created' : 'updated'
}

async function main() {
  const result = buildArchiveExport(archiveManifestRecords, {
    statuses: archiveManifestStatuses,
  })

  if (!result.ok) {
    printJson(process.stderr, { ok: false, stage: 'validation', errors: result.errors })
    process.exitCode = 1
    return
  }

  const written = []
  const writeErrors = []

  try {
    await mkdir(OUTPUT_DIR, { recursive: true })
  } catch (error) {
    writeErrors.push({
      code: ARCHIVE_EXPORT_ERROR_CODES.writeFailed,
      file: path.basename(OUTPUT_DIR),
      message: error.message,
    })
  }

  if (writeErrors.length === 0) {
    for (const file of result.files) {
      try {
        const action = await writeStableFile(file)
        written.push({
          name: file.name,
          action,
          records: file.records,
          sha256: file.sha256,
        })
      } catch (error) {
        writeErrors.push({
          code: ARCHIVE_EXPORT_ERROR_CODES.writeFailed,
          file: file.name,
          message: error.message,
        })
      }
    }
  }

  if (writeErrors.length > 0) {
    printJson(process.stderr, {
      ok: false,
      stage: 'write',
      errors: writeErrors,
      written,
    })
    process.exitCode = 1
    return
  }

  printJson(process.stdout, {
    ok: true,
    outputDir: path.relative(process.cwd(), OUTPUT_DIR) || '.',
    files: written,
  })
}

main().catch((error) => {
  printJson(process.stderr, {
    ok: false,
    stage: 'write',
    errors: [
      {
        code: ARCHIVE_EXPORT_ERROR_CODES.writeFailed,
        file: null,
        message: error.message,
      },
    ],
  })
  process.exitCode = 1
})
