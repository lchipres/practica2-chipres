describe('Navegando por el sitio de catalogo de personas ',
	function() {  it('Visitar catalogo', function() {    cy.visit('http://localhost/practica2-chipres-master/')           })  
	it('Campo direccion en catalogo', 
		function() {   cy.get('thead > tr > :nth-child(3)').contains('Dirección') })})

Cypress.on('uncaught:exception', (err, runnable)=>{
	return false
})
