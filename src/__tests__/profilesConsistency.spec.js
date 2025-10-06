import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

function loadJSON(relPath) {
  const p = path.resolve(process.cwd(), relPath)
  const raw = fs.readFileSync(p, 'utf8')
  return JSON.parse(raw)
}

describe('Profiles and starting points consistency', () => {
  const starting = loadJSON('starting.json')
  const profilesArr = loadJSON('public/profiles.json')

  // Build a set of all resource template IDs across all profiles
  const allRTIds = new Set()
  const rtById = new Map()
  for (const prof of profilesArr) {
    const rts = prof?.json?.Profile?.resourceTemplates || []
    for (const rt of rts) {
      if (rt?.id) {
        allRTIds.add(rt.id)
        rtById.set(rt.id, rt)
      }
    }
  }

  it('All starting.json useResourceTemplates are defined in profiles.json', () => {
    const missing = []
    for (const cfg of starting) {
      if (cfg.configType !== 'startingPoints') continue
      const groups = cfg.json || []
      for (const group of groups) {
        for (const item of group.menuItems || []) {
          for (const rtId of item.useResourceTemplates || []) {
            if (!allRTIds.has(rtId)) {
              missing.push(rtId)
            }
          }
        }
      }
    }
    expect(missing, `Missing RTs: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('Geographic coverage template exists and is referenced from Monograph Work', () => {
    // 1) Ensure lc:RT:bf2:Form:Geog exists
    expect(allRTIds.has('lc:RT:bf2:Form:Geog')).toBe(true)

    // 2) Ensure Monograph Work references geographicCoverage with valueTemplateRefs to lc:RT:bf2:Form:Geog
    const monoWork = rtById.get('lc:RT:bf2:Monograph:Work')
    expect(monoWork, 'Monograph Work template not found').toBeTruthy()
    const pts = monoWork?.propertyTemplates || []
    const geoPt = pts.find(p => p.propertyURI === 'http://id.loc.gov/ontologies/bibframe/geographicCoverage')
    expect(geoPt, 'Monograph Work missing geographicCoverage property').toBeTruthy()
    const refs = geoPt?.valueConstraint?.valueTemplateRefs || []
    expect(refs.includes('lc:RT:bf2:Form:Geog'), 'Monograph Work geographicCoverage should reference lc:RT:bf2:Form:Geog').toBe(true)
  })
})
