import { describe, it, expect, vi } from 'vitest'

// Mocks for Pinia stores used by utils_export
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

vi.mock('@/lib/utils_network', () => ({
  default: {
    sendErrorReportLog: vi.fn(),
    lookupLibrary: []
  }
}))

import utilsExport from '@/lib/utils_export'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

function makeProfileWithAccompaniedByTypes() {
  const rt = 'lc:RT:bf2:Monograph:Work'
  const ptKey = 'pt:accomp'
  const ACCOMP = 'http://id.loc.gov/ontologies/bibframe/accompaniedBy'

  return {
    rtOrder: [rt],
    rt: {
      [rt]: {
        URI: 'http://example.org/work/2',
        '@type': 'http://id.loc.gov/ontologies/bibframe/Work',
        ptOrder: [ptKey],
        pt: {
          [ptKey]: {
            propertyURI: ACCOMP,
            userValue: {
              [ACCOMP]: [{
                '@id': 'http://example.org/work/2/child',
                '@type': [
                  'http://id.loc.gov/ontologies/bibframe/Work',
                  'http://id.loc.gov/vocabulary/resourceComponents/sum'
                ]
              }]
            }
          }
        }
      }
    }
  }
}

describe('RDF type preservation', () => {
  it('emits multiple rdf:type when @type is an array on bnodes/resources', async () => {
    const profile = makeProfileWithAccompaniedByTypes()
    const result = await utilsExport.buildXML(profile)
    const xml = result.xlmString

    // Ensure both types are present on the embedded accompaniedBy resource
    expect(xml).toContain('<bf:accompaniedBy>')
    expect(xml).toContain('rdf:about="http://example.org/work/2/child"')
    expect(xml).toContain(`<rdf:type rdf:resource="http://id.loc.gov/ontologies/bibframe/Work"`) // primary
    expect(xml).toContain(`<rdf:type rdf:resource="http://id.loc.gov/vocabulary/resourceComponents/sum"`) // secondary
  })

  it('emits multiple rdf:type for root resources when profile.rt[rt]["@type"] is an array', async () => {
    const rt = 'lc:RT:bf2:Monograph:Work'
    const profile = {
      rtOrder: [rt],
      rt: {
        [rt]: {
          URI: 'http://example.org/work/3',
          '@type': [
            'http://id.loc.gov/ontologies/bibframe/Work',
            'http://id.loc.gov/vocabulary/resourceComponents/sum'
          ],
          ptOrder: [],
          pt: {}
        }
      }
    }

    const result = await utilsExport.buildXML(profile)
    const xml = result.xlmString
    expect(xml).toContain(`<rdf:type rdf:resource="http://id.loc.gov/ontologies/bibframe/Work"`)
    expect(xml).toContain(`<rdf:type rdf:resource="http://id.loc.gov/vocabulary/resourceComponents/sum"`)
  })
})
