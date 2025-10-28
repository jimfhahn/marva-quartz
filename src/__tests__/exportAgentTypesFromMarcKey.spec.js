import { describe, it, expect, vi } from 'vitest'

// Minimal mocks for stores used by utils_export
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

function serialize(el) {
  const container = document.createElement('div')
  container.appendChild(el)
  return container.innerHTML
}

describe('Agent subclass inference from marcKey', () => {
  it('infers bf:Person when marcKey starts with 100', () => {
    const el = utilsExport.createBnode({
      '@id': 'http://id.loc.gov/authorities/names/n1234',
      marcKey: '10010$aBleier, Ruth,$d1923-'
    }, 'http://id.loc.gov/ontologies/bibframe/agent')

    const xml = serialize(el)
    expect(xml).toContain('<bf:Agent')
    expect(xml).toContain('rdf:resource="http://id.loc.gov/ontologies/bibframe/Agent"')
    expect(xml).toContain('rdf:resource="http://id.loc.gov/ontologies/bibframe/Person"')
  })

  it('infers bf:Organization when marcKey starts with 110', () => {
    const el = utilsExport.createBnode({
      '@id': 'http://id.loc.gov/authorities/names/n5678',
      marcKey: '1102 $aACME Corp.'
    }, 'http://id.loc.gov/ontologies/bibframe/agent')

    const xml = serialize(el)
    expect(xml).toContain('rdf:resource="http://id.loc.gov/ontologies/bibframe/Organization"')
  })

  it('infers bf:Meeting when marcKey starts with 111', () => {
    const el = utilsExport.createBnode({
      '@id': 'http://id.loc.gov/authorities/names/n9012',
      marcKey: '1112 $aInternational Symposium on Widgets'
    }, 'http://id.loc.gov/ontologies/bibframe/agent')

    const xml = serialize(el)
    expect(xml).toContain('rdf:resource="http://id.loc.gov/ontologies/bibframe/Meeting"')
  })
})
