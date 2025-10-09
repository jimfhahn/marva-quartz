/// <reference types="cypress" />

describe('XML preview stability', () => {
  it('renders RDF/XML without flashing error HTML', () => {
    // Load a known-good public test file and profile via query params (auto-loads in Load.vue)
    cy.visit('/?url=/test_files/2001059208.xml&profile=lc:RT:bf2:Monograph:Instance');

    // Expect navigation to the editor once loaded
    cy.url({ timeout: 30000 }).should('match', /\/edit\//);

    // Open the XML preview panel/tab if it requires a click (best-effort)
    cy.contains(/xml/i, { timeout: 10000 }).click({ force: true });

    // The viewer should render a structured tree with element-name nodes
    cy.get('.element-name', { timeout: 20000 }).should('exist');

    // Should include key RDF element names
    cy.contains('.element-name', 'rdf:RDF').should('exist');
    cy.contains('.element-name', 'bf:Work').should('exist');

    // Should not show a parser error or raw HTML document markers
    cy.contains(/parsererror/i).should('not.exist');
    cy.contains(/<!doctype|<html|<body/i).should('not.exist');
  });
});

