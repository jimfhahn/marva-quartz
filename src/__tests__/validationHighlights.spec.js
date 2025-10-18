import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useProfileStore } from '@/stores/profile'

function setupProfileStore() {
  const store = useProfileStore()
  store.activeProfile = {
    rt: {
      'lc:RT:bf2:Monograph:Work': {
        pt: {
          'pt:title': {
            '@guid': 'guid-title',
            propertyLabel: 'Title'
          },
          'pt:creator': {
            '@guid': 'guid-creator',
            propertyLabel: 'Creator'
          }
        }
      }
    }
  }
  return store
}

describe('profile validation highlights', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('maps validation results to component guids by label', () => {
    const store = setupProfileStore()

    const result = {
      conforms: false,
      validation: {
        results: [
          {
            severity: 'ERROR',
            message: 'The field **Title** @Work@ is required.'
          }
        ]
      }
    }

    store.computeValidationHighlights(result)

    const highlight = store.validationHighlights['guid-title']
    expect(highlight).toBeTruthy()
    expect(highlight.severity).toBe('ERROR')
    expect(highlight.issues[0].message).toContain('Title')
  })

  it('keeps the highest severity for a component', () => {
    const store = setupProfileStore()

    store.computeValidationHighlights({
      conforms: false,
      validation: {
        results: [
          { severity: 'WARNING', message: 'Check **Title** @Work@' },
          { severity: 'ERROR', message: 'Fix **Title** @Work@' }
        ]
      }
    })

    const highlight = store.validationHighlights['guid-title']
    expect(highlight.severity).toBe('ERROR')
    expect(highlight.issues.length).toBe(2)
    expect(store.validationHighlightCounts.ERROR).toBe(1)
    expect(store.validationHighlightCounts.WARNING).toBe(1)
  })

  it('honors explicit component references when labels are missing', () => {
    const store = setupProfileStore()

    store.computeValidationHighlights({
      conforms: false,
      validation: {
        results: [
          {
            severity: 'ERROR',
            message: 'Creator needs an authorized agent',
            componentGuid: 'guid-creator'
          }
        ]
      }
    })

    const highlight = store.validationHighlights['guid-creator']
    expect(highlight).toBeTruthy()
    expect(highlight.severity).toBe('ERROR')
  })
})
