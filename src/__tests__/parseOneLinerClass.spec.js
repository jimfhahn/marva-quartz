import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock stores
vi.mock('@/stores/profile', () => ({
  useProfileStore: () => ({ emptyComponents: {} })
}))
vi.mock('@/stores/config', () => ({ useConfigStore: () => ({ exludeDeepHierarchy: [] }) }))
vi.mock('@/stores/preference', () => ({ usePreferenceStore: () => ({ catInitals: 'XX' }) }))

import utilsParse from '@/lib/utils_parse'

function makeProfileWithContent() {
  const rt = 'lc:RT:bf2:Monograph:Work'
  const ptKey = 'pt:content'
  const prop = 'http://id.loc.gov/ontologies/bibframe/content'
  return {
    rtOrder: [rt],
    rt: {
      [rt]: {
        URI: 'http://example.org/work/one-liner',
        '@type': 'http://id.loc.gov/ontologies/bibframe/Work',
        ptOrder: [ptKey],
        pt: {
          [ptKey]: {
            propertyURI: prop,
            propertyLabel: 'Content',
            userValue: {},
            valueConstraint: { valueTemplateRefs: [] },
            mandatory: 'false'
          }
        }
      }
    },
    eId: 'test-2',
    log: []
  }
}

describe('utils_parse handles one-liner Class (no children)', () => {
  beforeEach(() => {})
  it('does not throw and initializes arrays before pushing', async () => {
    const profile = makeProfileWithContent()
    const xml = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:bf="http://id.loc.gov/ontologies/bibframe/"><bf:Work rdf:about="http://example.org/work/one-liner"><bf:content><bf:Content rdf:about="http://id.loc.gov/vocabulary/contentTypes/prm"/></bf:content></bf:Work></rdf:RDF>`
    utilsParse.parseXml(xml)
    const out = await utilsParse.transformRts(profile)
    expect(out).toBeTruthy()
    const work = out.rt['lc:RT:bf2:Monograph:Work']
    expect(work).toBeTruthy()
    const pt = work.pt['pt:content']
    expect(pt).toBeTruthy()
    const uv = pt.userValue['http://id.loc.gov/ontologies/bibframe/content']
    expect(Array.isArray(uv)).toBe(true)
    expect(uv.length).toBeGreaterThan(0)
  })
})
