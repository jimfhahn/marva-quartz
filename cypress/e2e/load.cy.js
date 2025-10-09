// Simple smoke test for the Load view at root

describe("Load page smoke test", () => {
  it("visits the app root url and shows Load UI", () => {
    cy.visit("/");
    // The Load view renders a section with header "Load"
    cy.contains("h1", /Load/i).should("be.visible");
    // And a URL input exists
    cy.get('input[placeholder="URL to resource or identifier to search"]').should("exist");
  });
});
