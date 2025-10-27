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

/**
 * Helper to serialize an Element for assertions
 */
function serialize(el) {
  const container = document.createElement('div')
  container.appendChild(el)
  return container.innerHTML
}

describe('Agent type stamping in exporter', () => {
  it('emits bf:Agent with both bf:Agent and specific subclass rdf:type when @type=bf:Person provided', () => {
    const property = 'http://id.loc.gov/ontologies/bibframe/agent'
    const userValue = {
      '@id': 'http://id.loc.gov/authorities/names/n12345',
      '@type': 'http://id.loc.gov/ontologies/bibframe/Person',
      // exporter collects rdfs:label from either label or rdfs:label
      label: 'Doe, John'
    }

    const el = utilsExport.createBnode(userValue, property)
    const xml = serialize(el)

    // Outer element is bf:Agent
    expect(xml).toContain('<bf:Agent')
    // Includes rdf:type for bf:Person and bf:Agent
    expect(xml).toContain('rdf:resource="http://id.loc.gov/ontologies/bibframe/Person"')
    expect(xml).toContain('rdf:resource="http://id.loc.gov/ontologies/bibframe/Agent"')
    // Has a label
    expect(xml).toContain('Doe, John')
  })

  it('emits only bf:Agent type when no specific subclass is provided', () => {
    const property = 'http://id.loc.gov/ontologies/bibframe/agent'
    const userValue = {
      '@id': 'http://id.loc.gov/authorities/names/n99999',
      label: 'ACME Corp.'
    }

    const el = utilsExport.createBnode(userValue, property)
    const xml = serialize(el)

    // Outer element is bf:Agent
    expect(xml).toContain('<bf:Agent')
    // Should include bf:Agent rdf:type
    expect(xml).toContain('rdf:resource="http://id.loc.gov/ontologies/bibframe/Agent"')
  })
})
