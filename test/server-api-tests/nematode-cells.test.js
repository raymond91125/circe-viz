/* global beforeAll, afterAll, test, expect */
require('regenerator-runtime');

const db = require('../../src/server/db');

const queryNematodeCells = require('../../src/server/db/nematode-cells');
const expectedCells = require('./nematode-cells.json');

let connection;

beforeAll(() => {
  return db.connect({ useTestDatabase: true }).then( c => {
    connection = c;
    return connection;
  });
});

afterAll(() => {
   return connection.end();
});


test('get cells from the db', function(){
  // queryNematodeCells orders by `name`, whose sort order is collation-dependent -- the deployment
  // MySQL and CI's MariaDB order mixed-case names (e.g. "excgl") differently, so a positional
  // deep-equal is environment-fragile. The query returns a set of cells; compare it as one by
  // sorting both sides by name in JS (a stable, collation-independent order) before the deep-equal.
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return queryNematodeCells( connection ).then( res => {
    expect( [...res].sort(byName) ).toEqual( [...expectedCells].sort(byName) );
  });
});
