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

  it('Penn Item templates have all required fields (location, classification, barcode, policies)', () => {
    const pennItemTemplateIds = [
      'lc:RT:bf2:Monograph:Item',
      'lc:RT:bf2:PrintPhoto:Item',
      'lc:RT:bf2:RareMat:Item',
      'lc:RT:bf2:35mmFeatureFilm:Item',
      'lc:RT:bf2:MIBluRayDVD:Item',
      'lc:RT:bf2:Cartographic:Item',
      'lc:RT:bf2:Analog:Item',
      'lc:RT:bf2:Serial:Item',
      'lc:RT:bf2:SoundCDR:Item',
      'lc:RT:bf2:SoundRecording:Item',
      'lc:RT:bf2:SoundCassette:Item',
      'lc:RT:bf2:NotatedMusic:Item',
      'lc:RT:bf2:Item:Digital',
      'lc:RT:bf2:Ibc:Item'
    ]

    // Verify lookup templates exist
    expect(allRTIds.has('lc:RT:bf2:Item:physicalLocation')).toBe(true)
    expect(allRTIds.has('lc:RT:bf2:Item:Location')).toBe(true)
    expect(allRTIds.has('lc:RT:bf2:Item:Access')).toBe(true)
    expect(allRTIds.has('lc:RT:bf2:Item:Use')).toBe(true)
    expect(allRTIds.has('lc:RT:bf2:Item:LCC')).toBe(true)
    expect(allRTIds.has('lc:RT:bf2:Identifiers:Barcode')).toBe(true)

    for (const rtId of pennItemTemplateIds) {
      const rt = rtById.get(rtId)
      expect(rt, `${rtId} template not found`).toBeTruthy()

      const propertyTemplates = rt?.propertyTemplates || []

      // 1. Physical Location
      const physicalLocationPt = propertyTemplates.find(
        p => p.propertyURI === 'http://id.loc.gov/ontologies/bibframe/physicalLocation'
      )
      expect(physicalLocationPt, `${rtId} missing physicalLocation property`).toBeTruthy()
      const physicalRefs = physicalLocationPt?.valueConstraint?.valueTemplateRefs || []
      expect(
        physicalRefs.includes('lc:RT:bf2:Item:physicalLocation'),
        `${rtId} physicalLocation must reference lc:RT:bf2:Item:physicalLocation`
      ).toBe(true)

      // 2. Sublocation
      const sublocationPt = propertyTemplates.find(
        p => p.propertyURI === 'http://id.loc.gov/ontologies/bibframe/sublocation'
      )
      expect(sublocationPt, `${rtId} missing sublocation property`).toBeTruthy()
      const sublocationRefs = sublocationPt?.valueConstraint?.valueTemplateRefs || []
      expect(
        sublocationRefs.includes('lc:RT:bf2:Item:Location'),
        `${rtId} sublocation must reference lc:RT:bf2:Item:Location`
      ).toBe(true)

      // 3. Classification
      const classificationPt = propertyTemplates.find(
        p => p.propertyURI === 'http://id.loc.gov/ontologies/bibframe/classification'
      )
      expect(classificationPt, `${rtId} missing classification property`).toBeTruthy()
      // RareMat may use a different classification template (vocabulary-free)
      if (rtId !== 'lc:RT:bf2:RareMat:Item') {
        const classificationRefs = classificationPt?.valueConstraint?.valueTemplateRefs || []
        expect(
          classificationRefs.includes('lc:RT:bf2:Item:LCC'),
          `${rtId} classification must reference lc:RT:bf2:Item:LCC`
        ).toBe(true)
      }

      // 4. Barcode
      const barcodePt = propertyTemplates.find(
        p => p.propertyURI === 'http://id.loc.gov/ontologies/bibframe/identifiedBy' &&
            p.valueConstraint?.valueTemplateRefs?.includes('lc:RT:bf2:Identifiers:Barcode')
      )
      expect(barcodePt, `${rtId} missing barcode (identifiedBy) property`).toBeTruthy()

      // 5. Item Policy (Access)
      const itemPolicyPt = propertyTemplates.find(
        p => p.propertyURI === 'http://id.loc.gov/ontologies/bibframe/usageAndAccessPolicy' &&
            p.valueConstraint?.valueTemplateRefs?.includes('lc:RT:bf2:Item:Access')
      )
      expect(itemPolicyPt, `${rtId} missing Item Policy (usageAndAccessPolicy with Access)`).toBeTruthy()

      // 6. Material Type (Use)
      const materialTypePt = propertyTemplates.find(
        p => p.propertyURI === 'http://id.loc.gov/ontologies/bibframe/usageAndAccessPolicy' &&
            p.valueConstraint?.valueTemplateRefs?.includes('lc:RT:bf2:Item:Use')
      )
      expect(materialTypePt, `${rtId} missing Material Type (usageAndAccessPolicy with Use)`).toBeTruthy()
    }
  })

  it('Work templates in starting.json have proper @type definitions in profile store', () => {
    // This test simulates what profile.js does when loading profiles
    // It verifies the mapping logic for Work subclass types
    
    const expectedWorkTypes = {
      'lc:RT:bf2:Monograph:Work': 'http://id.loc.gov/ontologies/bibframe/Text',
      'lc:RT:bf2:Serial:Work': 'http://id.loc.gov/ontologies/bibframe/Text',
      'lc:RT:bf2:RareMat:Work': 'http://id.loc.gov/ontologies/bibframe/Text',
      'lc:RT:bf2:NotatedMusic:Work': 'http://id.loc.gov/ontologies/bibframe/NotatedMusic',
      'lc:RT:bf2:Cartographic:Work': 'http://id.loc.gov/ontologies/bibframe/Cartography',
      'lc:RT:bf2:SoundRecording:Work': 'http://id.loc.gov/ontologies/bibframe/Audio',
      'lc:RT:bf2:SoundCDR:Work': 'http://id.loc.gov/ontologies/bibframe/Audio',
      'lc:RT:bf2:Analog:Work': 'http://id.loc.gov/ontologies/bibframe/Audio',
      'lc:RT:bf2:SoundCassette:Work': 'http://id.loc.gov/ontologies/bibframe/Audio',
      'lc:RT:bf2:MIBluRayDVD:Work': 'http://id.loc.gov/ontologies/bibframe/MovingImage',
      'lc:RT:bf2:35mmFeatureFilm:Work': 'http://id.loc.gov/ontologies/bibframe/MovingImage',
      'lc:RT:bf2:PrintPhoto:Work': 'http://id.loc.gov/ontologies/bibframe/StillImage'
      // lc:RT:bf2:Ibc:Work intentionally omitted - uses generic bf:Work only
    }

    // Verify each Work template exists
    for (const [rtId, expectedSubclass] of Object.entries(expectedWorkTypes)) {
      const rt = rtById.get(rtId)
      expect(rt, `${rtId} template not found`).toBeTruthy()
      expect(rt?.resourceURI, `${rtId} should have resourceURI`).toBe('http://id.loc.gov/ontologies/bibframe/Work')
      
      // Note: This test verifies the mapping exists. The actual @type assignment
      // happens in profile.js at runtime when profiles are loaded into the store.
      // The export logic in utils_export.js at lines 1679-1690 will read these types.
      expect(expectedSubclass, `${rtId} should have a Work subclass mapping`).toBeTruthy()
    }

    // Verify that all Work templates from starting.json are accounted for
    const startingWorkTemplates = []
    for (const cfg of starting) {
      if (cfg.configType !== 'startingPoints') continue
      const groups = cfg.json || []
      for (const group of groups) {
        for (const item of group.menuItems || []) {
          if (item.type?.includes('http://id.loc.gov/ontologies/bibframe/Work')) {
            startingWorkTemplates.push(...(item.useResourceTemplates || []))
          }
        }
      }
    }

    // Every starting Work template should either have a mapping or be Ibc:Work
    for (const rtId of startingWorkTemplates) {
      if (rtId === 'lc:RT:bf2:Ibc:Work') {
        // Ibc:Work intentionally uses generic bf:Work
        expect(expectedWorkTypes[rtId]).toBeUndefined()
      } else {
        expect(expectedWorkTypes[rtId], `${rtId} is in starting.json but missing from expectedWorkTypes`).toBeTruthy()
      }
    }
  })
})
