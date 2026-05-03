export interface PmBatch {
  id: string
  factor: number
  offset: number
}

export const PM_BATCHES: PmBatch[] = [
  { id: 'PMS5003_20231030',  factor: 0.02838, offset: 0 },
  { id: 'PMS5003_20231218',  factor: 0.03525, offset: 0 },
  { id: 'PMS5003_20240104',  factor: 0.02896, offset: 0 },
  { id: 'PMS5003T_20240921', factor: 0.03343, offset: 0 },
  { id: 'PMS5003T_20240417', factor: 0.02799, offset: 0 },
  { id: 'PMS5003T_20240518', factor: 0.03394, offset: 0 },
  { id: 'PMS5003_20240826',  factor: 0.03863, offset: 0 },
  { id: 'PMS5003_20250116',  factor: 0.02983, offset: 0 },
  { id: 'PMS5003_20250530',  factor: 0.02411, offset: 0 },
  { id: 'PMS5003T_20250208', factor: 0.02719, offset: 0 },
  { id: 'PMS5003T_20241222', factor: 0.02080, offset: 0 },
]

// Derives calibrated PM2.5 (μg/m³) from the raw particle count using the
// batch-specific linear correction: pm003Count × factor + offset
export function calibratePm25(pm003Count: number, batch: PmBatch): number {
  return pm003Count * batch.factor + batch.offset
}

