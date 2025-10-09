import { describe, it, expect, vi, beforeEach } from 'vitest'

// Minimal mocks for stores used by utils_parse
const profileStoreState = { emptyComponents: {} }

vi.mock('@/stores/profile', () => ({
  useProfileStore: () => profileStoreState
}))

vi.mock('@/stores/config', () => ({
  useConfigStore: () => ({ exludeDeepHierarchy: [] })
}))

vi.mock('@/stores/preference', () => ({
  usePreferenceStore: () => ({ catInitals: 'XX' })
}))

import utilsParse from '@/lib/utils_parse'

function makeMinimalProfile() {
  const rt = 'lc:RT:bf2:Monograph:Work'
  const ptKey = 'pt:title'
  const prop = 'http://id.loc.gov/ontologies/bibframe/title'
  return {
    rtOrder: [rt],
    rt: {
      [rt]: {
        URI: 'http://example.org/work/empty',
        '@type': 'http://id.loc.gov/ontologies/bibframe/Work',
        ptOrder: [ptKey],
        pt: {
          [ptKey]: {
            propertyURI: prop,
            propertyLabel: 'Title',
            userValue: {}, // ensures dataLoaded becomes false
            valueConstraint: { valueTemplateRefs: [] },
            mandatory: 'false'
          }
        }
      }
    },
    // needed fields referenced by parser
    eId: 'test',
    log: [],
  }
}

describe('utils_parse.transformRts emptyComponents tracking', () => {
  beforeEach(() => {
    // reset store container between tests
    profileStoreState.emptyComponents = {}
  })

  it('initializes emptyComponents[rt] and pushes pt safely when no data is loaded', async () => {
    const profile = makeMinimalProfile()
    // Prepare DOM with a minimal RDF/RDF and Work/Instance structure referencing a Work node
    const xml = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:bf="http://id.loc.gov/ontologies/bibframe/"><bf:Work rdf:about="http://example.org/work/empty"></bf:Work></rdf:RDF>`

    // parse and set active DOM
    utilsParse.parseXml(xml)

    const result = await utilsParse.transformRts(profile)
    expect(result).toBeTruthy()
    const rt = 'lc:RT:bf2:Monograph:Work'
    expect(Array.isArray(profileStoreState.emptyComponents[rt])).toBe(true)
    expect(profileStoreState.emptyComponents[rt]).toContain('pt:title')
  })
})
