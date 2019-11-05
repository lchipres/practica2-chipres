describe ('Issue #2: Agrega campo telefono y directorio', function () {
    it('Prueba de cantalogo funcional "Catalog de personas"', function () {
        cy.visit('http://educ.ddns.net:88/pruebas-cypress/')
    })

    it('¿Esta el campo telefono?', function () {
        cy.get('thead > tr > :nth-child(3)').next().contains('Teléfono')
    })

    it('Probar campo telefono', function () {
        cy.get('thead > tr > :nth-child(5) > .btn').click();
        cy.get(':nth-child(1) > .col-md-7 > .form-control')
            .type('Leonardo').should('have.value','Leonardo')
        cy.get(':nth-child(2) > .col-md-11 > .form-control')
            .type('Alecast').should('have.value','Alecast')
        cy.get(':nth-child(3) > .col-md-11 > .form-control')
            .type('911').should('have.value','911')
        cy.get('.modal-footer > .btn-primary').click({force:true})
    })

    it('Editar el atributo telefono', function () {
        cy.get(':nth-child(34) > :nth-child(5) > .btn-primary').click()
        cy.get(':nth-child(2) > .col-md-11 > .form-control')
            .type('Leonardo -Editado-').should('have.value','LeonardoA-Editado-')
        cy.get(':nth-child(3) > .col-md-11 > .form-control')
            .type('911').should('have.value','12123')
        cy.get('.modal-footer > .btn-primary').click({force:true})
    })
})


Cypress.on('uncaught:exception', (err, runnable) => {
    // returning false here prevents Cypress from
    // failing the test
    return false
  })