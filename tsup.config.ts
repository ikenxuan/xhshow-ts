import { defineConfig } from 'tsup'
import type { Options } from 'tsup'
import fs from 'node:fs'
import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { URL } from 'node:url'

/**
 * 递归删除指定目录下的所有.d.cts文件
 * @param dir - 要搜索的目录路径
 */
const removeDCtsFiles = (dir: string) => {
  if (!fs.existsSync(dir)) {
    return
  }

  const items = fs.readdirSync(dir)

  for (const item of items) {
    const itemPath = path.join(dir, item)
    const stat = fs.statSync(itemPath)

    if (stat.isDirectory()) {
      // 递归处理子目录
      removeDCtsFiles(itemPath)
    } else if (item.endsWith('.d.cts')) {
      // 删除.d.cts文件
      fs.rmSync(itemPath)
      console.log(`已删除: ${itemPath}`)
    }
  }
}

/**
 * 整理输出文件结构
 */
const organizeFiles = () => {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)

  const distDir = path.join(__dirname, 'dist')
  const esmDir = path.join(distDir, 'esm')
  const cjsDir = path.join(distDir, 'cjs')

  // 首先递归删除所有.d.cts文件
  removeDCtsFiles(distDir)

  // 创建 esm 和 cjs 目录
  fs.mkdirSync(esmDir, { recursive: true })
  fs.mkdirSync(cjsDir, { recursive: true })

  // 移动文件到对应目录
  fs.readdirSync(distDir).forEach((file) => {
    const filePath = path.join(distDir, file)

    // 跳过目录
    if (fs.statSync(filePath).isDirectory()) {
      return
    }

    if (file.endsWith('.mjs')) {
      fs.renameSync(filePath, path.join(esmDir, file))
    } else if (file.endsWith('.cjs')) {
      fs.renameSync(filePath, path.join(cjsDir, file))
    } else if (file.endsWith('.d.ts')) {
      // 复制类型定义文件到两个目录
      fs.copyFileSync(filePath, path.join(esmDir, file))
      fs.copyFileSync(filePath, path.join(cjsDir, file))
      fs.rmSync(filePath) // 删除原文件
    }
  })

  console.log('Build files organized successfully!')
}

// 读取 package.json 获取依赖信息
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', import.meta.url), 'utf-8'))

/**
 * 主要模块的构建配置
 */
const mainConfig: Options = {
  entry: {
    'index': 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  target: 'node16',
  splitting: false,
  sourcemap: false,
  clean: true,
  banner: {
    js: `/*! 
 * xhshow-ts
 * XHS API signature generator
 * MIT Licensed
 */`,
  },
  dts: {
    compilerOptions: {
      removeComments: false
    }
  },
  outDir: 'dist',
  treeshake: true,
  minify: false,
  shims: true,
  external: Object.keys(pkg.dependencies || {}),
  outExtension ({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.cjs',
    }
  },
  onSuccess: async () => {
    // 等待文件写入完成
    await new Promise((resolve) => setTimeout(resolve, 2000))
    organizeFiles()
  }
}

export default defineConfig(mainConfig)