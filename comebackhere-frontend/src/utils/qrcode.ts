function getVersion(data: string): number {
  const len = new TextEncoder().encode(data).length
  const capacities = [
    17, 32, 53, 78, 106, 134, 154, 192, 230, 271,
    321, 367, 425, 458, 520, 586, 644, 718, 792, 858,
  ]
  for (let i = 0; i < capacities.length; i++) {
    if (len <= capacities[i]) return i + 1
  }
  return 20
}

function createMatrix(size: number): (boolean | null)[][] {
  return Array.from({ length: size }, () => Array(size).fill(null))
}

function setModule(matrix: (boolean | null)[][], row: number, col: number, val: boolean) {
  if (row >= 0 && row < matrix.length && col >= 0 && col < matrix.length) {
    matrix[row][col] = val
  }
}

function addFinderPattern(matrix: (boolean | null)[][], row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r
      const cc = col + c
      if (rr < 0 || rr >= matrix.length || cc < 0 || cc >= matrix.length) continue
      const isBlack =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4)
      setModule(matrix, rr, cc, isBlack)
    }
  }
}

function addTimingPatterns(matrix: (boolean | null)[][]) {
  const size = matrix.length
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0
    if (matrix[6][i] === null) matrix[6][i] = val
    if (matrix[i][6] === null) matrix[i][6] = val
  }
}

function addAlignmentPattern(matrix: (boolean | null)[][], row: number, col: number) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const isBlack = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)
      setModule(matrix, row + r, col + c, isBlack)
    }
  }
}

function getAlignmentPositions(version: number): number[] {
  if (version === 1) return []
  const positions: number[][] = [
    [], [],
    [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
    [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
    [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
    [6, 34, 62, 90],
  ]
  return positions[version] || positions[2]
}

export function generateQRMatrix(data: string): boolean[][] {
  const version = Math.max(2, getVersion(data))
  const size = version * 4 + 17
  const matrix = createMatrix(size)

  addFinderPattern(matrix, 0, 0)
  addFinderPattern(matrix, 0, size - 7)
  addFinderPattern(matrix, size - 7, 0)

  addTimingPatterns(matrix)

  const alignPositions = getAlignmentPositions(version)
  for (const r of alignPositions) {
    for (const c of alignPositions) {
      if ((r < 9 && c < 9) || (r < 9 && c > size - 9) || (r > size - 9 && c < 9)) continue
      addAlignmentPattern(matrix, r, c)
    }
  }

  matrix[size - 8][8] = true

  for (let i = 0; i < 8; i++) {
    if (matrix[8][i] === null) matrix[8][i] = i === 0
    if (matrix[i][8] === null) matrix[i][8] = false
    if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false
    if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false
  }
  if (matrix[8][8] === null) matrix[8][8] = true

  const bytes = new TextEncoder().encode(data)
  const bits: number[] = []

  bits.push(0, 1, 0, 0)

  const lenBits = version <= 9 ? 8 : 16
  for (let i = lenBits - 1; i >= 0; i--) {
    bits.push((bytes.length >> i) & 1)
  }

  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((b >> i) & 1)
    }
  }

  bits.push(0, 0, 0, 0)
  while (bits.length % 8 !== 0) bits.push(0)

  const totalDataBits = size * size
  const padBytes = [0xEC, 0x11]
  let padIdx = 0
  while (bits.length < totalDataBits) {
    const pb = padBytes[padIdx % 2]
    for (let i = 7; i >= 0; i--) {
      bits.push((pb >> i) & 1)
    }
    padIdx++
  }

  let bitIdx = 0
  let goingUp = true
  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5
    const rows = goingUp
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i)

    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c
        if (cc < 0) continue
        if (matrix[row][cc] !== null) continue
        matrix[row][cc] = bits[bitIdx] === 1
        bitIdx++
      }
    }
    goingUp = !goingUp
  }

  const result: boolean[][] = matrix.map(row => row.map(cell => cell === true))

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if ((row + col) % 2 === 0 && result[row][col]) {
        result[row][col] = false
      } else if ((row + col) % 2 === 0 && !result[row][col]) {
        result[row][col] = true
      }
    }
  }

  return result
}

export function renderQRToCanvas(
  canvas: HTMLCanvasElement,
  data: string,
  moduleSize = 8,
  quietZone = 4
): void {
  const matrix = generateQRMatrix(data)
  const size = matrix.length
  const canvasSize = (size + quietZone * 2) * moduleSize

  canvas.width = canvasSize
  canvas.height = canvasSize

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvasSize, canvasSize)

  ctx.fillStyle = '#000000'
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row][col]) {
        ctx.fillRect(
          (col + quietZone) * moduleSize,
          (row + quietZone) * moduleSize,
          moduleSize,
          moduleSize
        )
      }
    }
  }
}

export function getQRDataURL(data: string, moduleSize = 8, quietZone = 4): string {
  const canvas = document.createElement('canvas')
  renderQRToCanvas(canvas, data, moduleSize, quietZone)
  return canvas.toDataURL('image/png')
}

export function downloadQRAsPNG(data: string, filename = 'invoice-qr.png'): void {
  const dataURL = getQRDataURL(data, 10, 4)
  const link = document.createElement('a')
  link.download = filename
  link.href = dataURL
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
