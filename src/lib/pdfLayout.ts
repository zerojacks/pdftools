
export type Orientation = 'portrait' | 'landscape'
export type Grid = { rows: number, cols: number }

export interface LayoutParams {
  nup: number
  orientation: Orientation
  scalePct: number
  crop: { l: number, r: number, t: number, b: number } // percentage 0-1
  offset: { x: number, y: number } // mm
  margin: number // mm
  border: boolean
  borderColor: string
  borderWidth: number
  paperSize: { w: number, h: number } // mm
}

export interface CellLayout {
  row: number
  col: number
  x: number      // point, from left
  y: number      // point, from bottom (PDF style)
  width: number  // point
  height: number // point
  cellW: number
  cellH: number
}

export const mm2pt = (mm: number) => mm * 72 / 25.4

export const getGrid = (n: number, orientation: Orientation): Grid => {
  if (n === 2) return orientation === 'portrait' ? { rows: 2, cols: 1 } : { rows: 1, cols: 2 }
  if (n === 6) return orientation === 'portrait' ? { rows: 3, cols: 2 } : { rows: 2, cols: 3 }
  if (n === 8) return orientation === 'portrait' ? { rows: 4, cols: 2 } : { rows: 2, cols: 4 }
  // Default to 4
  return { rows: 2, cols: 2 }
}

export const calculateLayout = (
  params: LayoutParams,
  srcAspect: number // width / height
): { cells: CellLayout[], pageSize: { w: number, h: number }, grid: Grid } => {
  const pageW = mm2pt(params.paperSize.w)
  const pageH = mm2pt(params.paperSize.h)
  const margin = mm2pt(params.margin)
  const usableW = pageW - margin * 2
  const usableH = pageH - margin * 2
  
  const grid = getGrid(params.nup, params.orientation)
  const cellW = usableW / grid.cols
  const cellH = usableH / grid.rows
  
  const cells: CellLayout[] = []
  
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cellX = margin + c * cellW
      // y is from bottom
      const cellY = margin + (grid.rows - 1 - r) * cellH
      
      const cellAspect = cellW / cellH
      let drawW = cellW
      let drawH = cellH
      
      if (srcAspect > cellAspect) {
        // Source is wider than cell
        drawH = drawW / srcAspect
      } else {
        // Source is taller than cell
        drawW = drawH * srcAspect
      }
      
      drawW *= params.scalePct / 100
      drawH *= params.scalePct / 100
      
      const dx = cellX + (cellW - drawW) / 2 + mm2pt(params.offset.x)
      const dy = cellY + (cellH - drawH) / 2 + mm2pt(params.offset.y)
      
      cells.push({
        row: r,
        col: c,
        x: dx,
        y: dy,
        width: drawW,
        height: drawH,
        cellW,
        cellH
      })
    }
  }
  
  return { cells, pageSize: { w: pageW, h: pageH }, grid }
}
