import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Pinia stores used by utils_export
vi.mock('@/stores/config', () => ({
  useConfigStore: () => ({
    returnUrls: { dev: true },
    defaultAssignerLabel: 'University of Pennsylvania, Van Pelt-Dietrich Library',
    checkForEDTFDatatype: []
  })
}))

vi.mock('@/stores/preference', () => ({
  usePreferenceStore: () => ({
    catInitals: 'XX',
    catCode: '999'
  })
}))

vi.mock('@/stores/profile', () => ({
  useProfileStore: () => ({
    setMostCommonNonLatinScript: () => 'Latn',
    triggerBadXMLBuildRecovery: vi.fn(),
    profiles: {}
  })
}))

// utils_network is referenced for error reporting; provide safe stub
vi.mock('@/lib/utils_network', () => ({
  default: {
    sendErrorReportLog: vi.fn(),
    lookupLibrary: []
  }
}))

import utilsExport from '@/lib/utils_export'

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#label'
const MADS_CODE = 'http://www.loc.gov/mads/rdf/v1#code'
const MARC_KEY = 'http://id.loc.gov/ontologies/bflc/marcKey'
const GEO_PROP = 'http://id.loc.gov/ontologies/bibframe/geographicCoverage'

function makeBaseProfile(geoUserValue) {
  const rt = 'lc:RT:bf2:Monograph:Work'
  const ptKey = 'pt:geo'

  return {
    rtOrder: [rt],
    rt: {
      [rt]: {
        URI: 'http://example.org/work/1',
        '@type': 'http://id.loc.gov/ontologies/bibframe/Work',
        ptOrder: [ptKey],
        pt: {
          [ptKey]: {
            propertyURI: GEO_PROP,
            userValue: {
              [GEO_PROP]: [geoUserValue]
            }
          }
        }
      }
    }
  }
}

describe('utils_export geographicCoverage export', () => {
  beforeEach(() => {
    // jsdom provides DOMParser globally; ensure it exists
    expect(global.DOMParser).toBeDefined()
  })

  it('emits nested bf:GeographicCoverage with rdf:about and label/code/marcKey for controlled value', async () => {
    const geoVal = {
      '@id': 'http://id.loc.gov/vocabulary/geographicAreas/n-us-ny',
      [RDFS]: [{ '@value': 'New York (State)' }],
      // Accept both flat and nested shapes for code
      [MADS_CODE]: [
        { '@value': 'n-us-ny' },
        { [MADS_CODE]: 'n-us-ny' }
      ],
      [MARC_KEY]: [{ '@value': '043 $a n-us-ny' }]
    }
    const profile = makeBaseProfile(geoVal)
    const result = await utilsExport.buildXML(profile)
    const xml = result.xlmString
    expect(xml).toContain('<bf:geographicCoverage>')
    expect(xml).toContain('<bf:GeographicCoverage rdf:about="http://id.loc.gov/vocabulary/geographicAreas/n-us-ny"')
    expect(xml).toContain('<rdfs:label')
    expect(xml).toContain('New York (State)')
    expect(xml).toContain('<madsrdf:code rdf:datatype="http://id.loc.gov/datatypes/codes/gac">n-us-ny</madsrdf:code>')
    expect(xml).toContain('<bflc:marcKey>043 $a n-us-ny</bflc:marcKey>')
  })

  it('emits nested bf:GeographicCoverage with rdfs:label for uncontrolled blank node', async () => {
    const geoVal = {
      '@id': '_:g1',
      [RDFS]: [{ '@value': 'Some Place' }]
    }
    const profile = makeBaseProfile(geoVal)
    const result = await utilsExport.buildXML(profile)
    const xml = result.xlmString
    expect(xml).toContain('<bf:geographicCoverage>')
    expect(xml).toMatch(/<bf:GeographicCoverage(\s|>)/)
    expect(xml).toContain('<rdfs:label')
    expect(xml).toContain('Some Place')
  })
})
