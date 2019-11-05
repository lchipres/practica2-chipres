describe ('Issue #3: eliminar registros de personas.', function () {
    it('Prueba funcional "Catalogo de personas"', function () {
        cy.visit('http://educ.ddns.net:88/pruebas-cypress/')
    })

    it('Eliminar registro', function () {
        cy.get(':nth-child(34) > :nth-child(5) > .btn-danger').click()
    })
})

Cypress.on('uncaught:exception', (err, runnable) => {
    // returning false here prevents Cypress from
    // failing the test
    return false
  })