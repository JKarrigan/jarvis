import type { DeviceMeasures, StatusColor } from './types'
import {
  co2Status, pm25Status, pm1Status, pm10Status,
  tempStatus, humidityStatus, tvocStatus, noxStatus,
} from './thresholds'

export interface RangeRow {
  color: StatusColor
  label: string
  range: string
}

export interface MetricDescription {
  what: string
  method: string
  significance: string
  ranges: RangeRow[]
}

export interface MetricConfig {
  slug: string
  label: string
  unit: string
  key: keyof DeviceMeasures
  altKey?: keyof DeviceMeasures
  statusFn: (v: number) => StatusColor
  decimals: number
  isTempLike?: boolean
  description: MetricDescription
}

export const METRICS: MetricConfig[] = [
  {
    slug: 'co2',
    label: 'CO₂',
    unit: 'ppm',
    key: 'rco2',
    statusFn: co2Status,
    decimals: 0,
    description: {
      what: 'Carbon dioxide (CO₂) concentration in indoor air.',
      method: 'Measured in parts per million (ppm) — the number of CO₂ molecules per million air molecules. Outdoor air is typically around 420 ppm.',
      significance: 'CO₂ is the primary indicator of ventilation quality. It accumulates from human breathing and rises quickly in closed spaces. Elevated levels reduce cognitive performance, cause drowsiness and headaches, and signal that fresh air is needed.',
      ranges: [
        { color: 'good',         label: 'Good',            range: '≤800 ppm' },
        { color: 'moderate',     label: 'Moderate',        range: '800–1000 ppm' },
        { color: 'sensitive',    label: 'Poor',            range: '1000–1500 ppm' },
        { color: 'unhealthy',    label: 'Unhealthy',       range: '1500–2000 ppm' },
        { color: 'very-unhealthy', label: 'Very Unhealthy', range: '>2000 ppm' },
      ],
    },
  },
  {
    slug: 'pm25',
    label: 'PM2.5',
    unit: 'μg/m³',
    key: 'pm02',
    statusFn: pm25Status,
    decimals: 1,
    description: {
      what: 'Fine airborne particles 2.5 micrometers or smaller in diameter.',
      method: 'Measured in micrograms per cubic meter (μg/m³). A micrometer is 1/1000 of a millimeter — PM2.5 particles are roughly 30× smaller than a human hair.',
      significance: 'These particles are small enough to bypass the nose and throat, lodge deep in the lungs, and even enter the bloodstream. They are the main driver of the US EPA Air Quality Index (AQI). Common sources include smoke, cooking, vehicle exhaust, and industrial emissions.',
      ranges: [
        { color: 'good',           label: 'Good',                          range: '0–9 μg/m³' },
        { color: 'moderate',       label: 'Moderate',                      range: '9–35.4 μg/m³' },
        { color: 'sensitive',      label: 'Unhealthy for Sensitive Groups', range: '35.4–55.4 μg/m³' },
        { color: 'unhealthy',      label: 'Unhealthy',                     range: '55.4–125.4 μg/m³' },
        { color: 'very-unhealthy', label: 'Very Unhealthy',                range: '125.4–225.4 μg/m³' },
        { color: 'hazardous',      label: 'Hazardous',                     range: '>225.4 μg/m³' },
      ],
    },
  },
  {
    slug: 'pm1',
    label: 'PM1',
    unit: 'μg/m³',
    key: 'pm01',
    statusFn: pm1Status,
    decimals: 1,
    description: {
      what: 'Ultra-fine airborne particles 1 micrometer or smaller in diameter.',
      method: 'Measured in micrograms per cubic meter (μg/m³). PM1 particles are 70× smaller than a human hair and invisible to the naked eye.',
      significance: 'Even smaller than PM2.5, these particles can penetrate more deeply into lung tissue and pass into the bloodstream more readily. Common sources include combustion (candles, gas stoves, tobacco), traffic, and ultrafine industrial dust.',
      ranges: [
        { color: 'good',           label: 'Good',                          range: '0–9 μg/m³' },
        { color: 'moderate',       label: 'Moderate',                      range: '9–35.4 μg/m³' },
        { color: 'sensitive',      label: 'Unhealthy for Sensitive Groups', range: '35.4–55.4 μg/m³' },
        { color: 'unhealthy',      label: 'Unhealthy',                     range: '55.4–125.4 μg/m³' },
        { color: 'very-unhealthy', label: 'Very Unhealthy',                range: '>125.4 μg/m³' },
      ],
    },
  },
  {
    slug: 'pm10',
    label: 'PM10',
    unit: 'μg/m³',
    key: 'pm10',
    statusFn: pm10Status,
    decimals: 1,
    description: {
      what: 'Coarse airborne particles 10 micrometers or smaller in diameter.',
      method: 'Measured in micrograms per cubic meter (μg/m³). PM10 particles are about 7× smaller than a human hair — inhalable but typically filtered by the nose and upper airways.',
      significance: 'PM10 particles irritate the nose, throat, and upper respiratory tract. They are less likely than PM2.5 to reach the deep lungs but still worsen asthma and allergy symptoms. Common sources include road dust, pollen, mold spores, and construction activity.',
      ranges: [
        { color: 'good',           label: 'Good',                          range: '0–53 μg/m³' },
        { color: 'moderate',       label: 'Moderate',                      range: '54–154 μg/m³' },
        { color: 'sensitive',      label: 'Unhealthy for Sensitive Groups', range: '155–254 μg/m³' },
        { color: 'unhealthy',      label: 'Unhealthy',                     range: '255–354 μg/m³' },
        { color: 'very-unhealthy', label: 'Very Unhealthy',                range: '>354 μg/m³' },
      ],
    },
  },
  {
    slug: 'temperature',
    label: 'Temperature',
    unit: '°C',
    key: 'atmp',
    altKey: 'atmpCompensated',
    statusFn: tempStatus,
    decimals: 1,
    isTempLike: true,
    description: {
      what: 'Ambient air temperature at the sensor location.',
      method: 'Measured in degrees Celsius (°C) or Fahrenheit (°F) by the device\'s onboard thermistor. When available, a compensated value is used to correct for the sensor\'s own heat output.',
      significance: 'Indoor temperature affects comfort, sleep quality, and productivity. Extremes stress the body\'s thermoregulatory system and can worsen respiratory conditions. Temperature also influences relative humidity and the volatility of indoor pollutants.',
      ranges: [
        { color: 'good',      label: 'Comfortable', range: '15–25°C (59–77°F)' },
        { color: 'moderate',  label: 'Acceptable',  range: '10–30°C (50–86°F)' },
        { color: 'unhealthy', label: 'Stressful',   range: '<10°C or >30°C (<50°F or >86°F)' },
      ],
    },
  },
  {
    slug: 'humidity',
    label: 'Humidity',
    unit: '%',
    key: 'rhum',
    altKey: 'rhumCompensated',
    statusFn: humidityStatus,
    decimals: 0,
    description: {
      what: 'Relative humidity — the amount of water vapor in the air as a percentage of the maximum the air can hold at that temperature.',
      method: 'Measured as a percentage (%). 100% means the air is fully saturated. When available, a compensated reading corrects for the sensor\'s own temperature effect.',
      significance: 'Humidity strongly affects both comfort and health. Too low dries out skin, eyes, and airways, increasing susceptibility to respiratory infections. Too high promotes mold growth, dust mites, and bacterial proliferation — and makes heat feel more intense.',
      ranges: [
        { color: 'good',      label: 'Ideal',      range: '40–60%' },
        { color: 'moderate',  label: 'Acceptable', range: '30–70%' },
        { color: 'unhealthy', label: 'Poor',       range: '<30% (dry) or >70% (damp)' },
      ],
    },
  },
  {
    slug: 'tvoc',
    label: 'TVOC',
    unit: 'idx',
    key: 'tvocIndex',
    statusFn: tvocStatus,
    decimals: 0,
    description: {
      what: 'Total Volatile Organic Compounds (TVOC) — a combined measure of gas-phase chemicals present in indoor air.',
      method: 'Reported as a relative index (0–500) calibrated against the sensor\'s own baseline. An index of 100 represents typical clean air; higher values indicate elevated VOC concentrations relative to that baseline.',
      significance: 'VOCs are emitted by hundreds of everyday products: paints, adhesives, cleaning agents, furniture, carpets, and personal care products. Short-term exposure at high levels causes eye and throat irritation, headaches, and nausea. Chronic exposure to certain VOCs is linked to more serious health effects.',
      ranges: [
        { color: 'good',           label: 'Good',          range: '0–100 idx' },
        { color: 'moderate',       label: 'Moderate',      range: '100–150 idx' },
        { color: 'sensitive',      label: 'Elevated',      range: '150–200 idx' },
        { color: 'unhealthy',      label: 'Unhealthy',     range: '200–250 idx' },
        { color: 'very-unhealthy', label: 'Very Unhealthy', range: '>250 idx' },
      ],
    },
  },
  {
    slug: 'nox',
    label: 'NOx',
    unit: 'idx',
    key: 'noxIndex',
    statusFn: noxStatus,
    decimals: 0,
    description: {
      what: 'Nitrogen oxides (NOx) — primarily nitric oxide (NO) and nitrogen dioxide (NO₂) in indoor air.',
      method: 'Reported as a relative index (0–500) calibrated against the sensor\'s own baseline. An index of 1 represents the lowest level the sensor has recorded; values above 20 indicate measurable NOx above baseline.',
      significance: 'NOx gases are produced by any combustion process: gas stoves, ovens, heaters, fireplaces, and vehicles outside. NO₂ is a respiratory irritant that inflames airways, worsens asthma and bronchitis, and increases susceptibility to lung infection. Spikes during cooking on gas are common.',
      ranges: [
        { color: 'good',           label: 'Good',           range: '0–20 idx' },
        { color: 'moderate',       label: 'Moderate',       range: '20–50 idx' },
        { color: 'sensitive',      label: 'Elevated',       range: '50–100 idx' },
        { color: 'unhealthy',      label: 'Unhealthy',      range: '100–150 idx' },
        { color: 'very-unhealthy', label: 'Very Unhealthy', range: '>150 idx' },
      ],
    },
  },
]
