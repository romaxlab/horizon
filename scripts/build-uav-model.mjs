/** Procedural Horizon fixed-wing UAV. Node >=20. No browser or Blender. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { DOMParser } from '@xmldom/xmldom'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three'
import { Document, NodeIO } from '@gltf-transform/core'
import validator from 'gltf-validator'

globalThis.DOMParser = DOMParser
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(
  root,
  process.argv[2] ?? 'apps/control-center/public/assets/uav/uav-standby.svg',
)
const output = resolve(root, process.argv[3] ?? 'apps/control-center/public/assets/uav/uav.glb')
const svg = await readFile(source, 'utf8')
const xml = new DOMParser().parseFromString(svg, 'image/svg+xml')
const paths = Array.from(xml.getElementsByTagName('path'))
const wingPaths = paths.filter((p) => p.parentNode.getAttribute?.('fill') === 'url(#wing)')
const bodyPath = paths.find((p) => p.getAttribute('fill') === 'url(#body)')
const spinePath = paths.filter((p) => p.getAttribute('fill') === 'url(#body)')[1]
if (wingPaths.length !== 2 || !bodyPath || !spinePath)
  throw new Error('Expected approved Horizon SVG: wings, tail, fuselage and dorsal spine.')
function sample(path) {
  const d = path.getAttribute('d')
  const parsed = new SVGLoader().parse(
    `<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`,
  )
  const shapes = SVGLoader.createShapes(parsed.paths[0])
  if (shapes.length !== 1) throw new Error('Expected one closed contour per component.')
  let p = shapes[0].getPoints(8).map((v) => [v.x, v.y])
  p = p.filter((v, i) => !i || Math.hypot(v[0] - p[i - 1][0], v[1] - p[i - 1][1]) > 1e-7)
  if (Math.hypot(p[0][0] - p.at(-1)[0], p[0][1] - p.at(-1)[1]) < 1e-7) p.pop()
  return p
}
const outlines = {
  wings: sample(wingPaths[1]),
  tail: sample(wingPaths[0]),
  fuselage: sample(bodyPath),
  dorsalFin: sample(spinePath),
}
const span =
  Math.max(...outlines.wings.map((p) => p[0])) - Math.min(...outlines.wings.map((p) => p[0]))
const scale = 3 / span // Exact three-metre wingspan, no SVG outline/shadow included.
// SVG nose is -v. glTF uses nose +X, up +Y, starboard +Z.
const xyz = (u, v, y) => [(176 - v) * scale, y, (u - 214) * scale]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
function moments(pos, idx) {
  let volume = 0,
    centroid = [0, 0, 0]
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = idx.slice(i, i + 3).map((n) => pos.slice(n * 3, n * 3 + 3))
    const v = dot(a, cross(b, c)) / 6
    volume += v
    for (let j = 0; j < 3; j++) centroid[j] += (v * (a[j] + b[j] + c[j])) / 4
  }
  return { volume, centroid: centroid.map((v) => v / volume) }
}
function finish(name, pos, idx) {
  if (moments(pos, idx).volume < 0)
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geometry.setIndex(idx)
  geometry.computeVertexNormals()
  return { name, geometry, ...moments(pos, idx) }
}
function beveled(name, poly, height, base) {
  const center = poly.reduce(
    (s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length],
    [0, 0],
  )
  const rings = [
    [0.985, -0.5],
    [0.998, -0.32],
    [1, 0],
    [0.998, 0.32],
    [0.985, 0.5],
  ]
  const pos = [],
    idx = [],
    n = poly.length
  for (const [f, h] of rings)
    for (const [u, v] of poly)
      pos.push(
        ...xyz(center[0] + (u - center[0]) * f, center[1] + (v - center[1]) * f, base + height * h),
      )
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n),
        c = b + n,
        d = a + n
      idx.push(a, b, c, a, c, d)
    }
  const faces = ShapeUtils.triangulateShape(
    poly.map((p) => new Vector2(...p)),
    [],
  )
  // Fix cap winding against the adjacent side triangles using signed polygon area.
  const area = poly.reduce(
    (s, p, i) => s + p[0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * p[1],
    0,
  )
  for (const f of faces) {
    const a = poly[f[0]],
      b = poly[f[1]],
      c = poly[f[2]]
    const signed = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    const face = signed * area > 0 ? f : [f[0], f[2], f[1]]
    idx.push(face[2], face[1], face[0])
    idx.push(...face.map((i) => i + (rings.length - 1) * n))
  }
  return finish(name, pos, idx)
}
function fuselage(poly) {
  const levels = [...new Set(poly.map((p) => p[1]))].sort((a, b) => a - b)
  const pos = [],
    idx = [],
    rings = []
  const sides = 16
  for (const v of levels) {
    const hits = []
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length]
      if (
        v >= Math.min(a[1], b[1]) - 1e-8 &&
        v <= Math.max(a[1], b[1]) + 1e-8 &&
        Math.abs(b[1] - a[1]) > 1e-8
      )
        hits.push(a[0] + ((v - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
    }
    const left = Math.min(...hits),
      right = Math.max(...hits),
      mid = (left + right) / 2,
      radius = (right - left) / 2
    const count = radius < 1e-6 ? 1 : sides,
      start = pos.length / 3
    for (let j = 0; j < count; j++) {
      const a = (j / sides) * Math.PI * 2
      pos.push(...xyz(mid + radius * Math.cos(a), v, 0.025 + radius * scale * 0.82 * Math.sin(a)))
    }
    rings.push({ start, count })
  }
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r],
      b = rings[r + 1]
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides
      if (a.count === 1) idx.push(a.start, b.start + j, b.start + k)
      else if (b.count === 1) idx.push(a.start + j, b.start, a.start + k)
      else idx.push(a.start + j, b.start + j, b.start + k, a.start + j, b.start + k, a.start + k)
    }
  }
  return finish('Fuselage', pos, idx)
}
const parts = [
  fuselage(outlines.fuselage),
  beveled('Main wings', outlines.wings, 0.072, -0.018),
  beveled('Tailplane', outlines.tail, 0.045, 0.002),
  beveled('Dorsal tail fin', outlines.dorsalFin, 0.19, 0.078),
]
// Equal-density assembly volume centroid. Components overlap at their structural joints.
const volume = parts.reduce((s, p) => s + p.volume, 0)
const center = [0, 1, 2].map(
  (j) => parts.reduce((s, p) => s + p.centroid[j] * p.volume, 0) / volume,
)
const document = new Document()
const buffer = document.createBuffer()
const srgb = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const material = document
  .createMaterial('Neutral light grey')
  .setBaseColorFactor([srgb(232 / 255), srgb(232 / 255), srgb(234 / 255), 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.6)
  .setDoubleSided(false)
const scene = document.createScene('Horizon UAV')
document.getRoot().setDefaultScene(scene)
let triangles = 0
const meshesForPreview = []
for (const part of parts) {
  const g = part.geometry
  g.translate(...center.map((v) => -v))
  const positions = g.getAttribute('position').array,
    normals = g.getAttribute('normal').array,
    indices = new Uint16Array(g.index.array)
  triangles += indices.length / 3
  const primitive = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      document.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer),
    )
    .setIndices(document.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
    .setMaterial(material)
  const mesh = document.createMesh(part.name).addPrimitive(primitive)
  scene.addChild(document.createNode(part.name).setMesh(mesh))
  meshesForPreview.push({
    name: part.name,
    positions: Array.from(positions),
    normals: Array.from(normals),
    indices: Array.from(indices),
  })
}
if (triangles > 5000) throw new Error(`Triangle budget exceeded: ${triangles}`)
document.getRoot().setExtras({
  noseAxis: '+X',
  upAxis: '+Y',
  units: 'metres',
  wingspan: 3,
  sourceSha256: createHash('sha256').update(svg).digest('hex'),
  centering:
    'equal-density closed component volume centroid; intersecting joints counted per component',
})
const io = new NodeIO()
const bytes = await io.writeBinary(document)
if (bytes.length > 150000) throw new Error(`Byte budget exceeded: ${bytes.length}`)
const report = await validator.validateBytes(bytes, { uri: 'uav.glb', maxIssues: 100 })
if (report.issues.numErrors || report.issues.numWarnings)
  throw new Error(JSON.stringify(report.issues, null, 2))
await mkdir(dirname(output), { recursive: true })
await writeFile(output, bytes)
const stats = {
  triangles,
  bytes: bytes.length,
  wingspanMetres: 3,
  noseAxis: '+X',
  upAxis: '+Y',
  material: 'sRGB #e8e8ea / roughness 0.6 / metallic 0',
  sourceSha256: createHash('sha256').update(svg).digest('hex'),
  assemblyCentroidBeforeShift: center,
  parts: parts.map((p) => ({
    name: p.name,
    triangles: p.geometry.index.count / 3,
    volume: p.volume,
  })),
  validation: { errors: report.issues.numErrors, warnings: report.issues.numWarnings },
}
// Stats go to stdout only; the repository keeps just the model.
console.log(JSON.stringify(stats, null, 2))
