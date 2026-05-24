import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const sizes = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 180, name: 'apple-touch-icon.png' },
]

// Icône ICORTEX : fond dark avec hexagone + "IX" stylisé
function svgIcon(size) {
  const r = Math.round(size * 0.18)
  const cx = size / 2
  const cy = size / 2
  const hr = Math.round(size * 0.32)
  // Hexagone
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6
    return `${cx + hr * Math.cos(a)},${cy + hr * Math.sin(a)}`
  }).join(' ')
  const fontSize = Math.round(size * 0.22)
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${r}" fill="#0d0d14"/>
  <polygon points="${pts}" fill="none" stroke="#6366f1" stroke-width="${Math.round(size * 0.04)}"/>
  <text x="${cx}" y="${cy + fontSize * 0.35}" text-anchor="middle" font-family="system-ui,sans-serif"
    font-size="${fontSize}" font-weight="700" fill="#e2e2f0" letter-spacing="${Math.round(size * 0.01)}">IX</text>
</svg>`
}

const outDir = path.join('public', 'icons')
fs.mkdirSync(outDir, { recursive: true })

for (const { size, name } of sizes) {
  await sharp(Buffer.from(svgIcon(size))).png().toFile(path.join(outDir, name))
  console.log(`✓ ${name} (${size}×${size})`)
}
console.log('Icons → public/icons/')
