import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function copyFFmpegCore() {
  return {
    name: 'copy-ffmpeg-core',
    buildStart() {
      const src = resolve(__dirname, 'node_modules/@ffmpeg/core/dist/umd')
      const dest = resolve(__dirname, 'public/ffmpeg')
      mkdirSync(dest, { recursive: true })
      copyFileSync(`${src}/ffmpeg-core.js`, `${dest}/ffmpeg-core.js`)
      copyFileSync(`${src}/ffmpeg-core.wasm`, `${dest}/ffmpeg-core.wasm`)
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    copyFFmpegCore(),
  ],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
