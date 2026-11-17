const assert = require("node:assert/strict");
const { calculateGeometry } = require("../assets/js/engine.js");

function check(name, input, verify) {
  const result = calculateGeometry(input);
  verify(result);
  console.log("LULUS:", name);
}
const base = { wallW:600, wallH:600, matW:110, matH:220, gap:0, alignment:"BL" };

check("Stack Bond menghasilkan susunan dan luas bidang", {...base, pattern:"stack"}, r => {
  assert.equal(r.columns, 6);
  assert.equal(r.rows, 3);
  assert.ok(r.cells.length >= 18);
  assert.ok(Math.abs(r.areaInstalled-r.areaWall) < 0.01);
});
check("Running Bond horizontal menghasilkan offset antarbaris", {...base, pattern:"running", direction:"horizontal"}, r => {
  const first = r.cells.filter(c => c.yStart === 0).map(c=>c.sourceX);
  const secondY = Math.min(...r.cells.filter(c=>c.yStart>0).map(c=>c.yStart));
  const second = r.cells.filter(c => c.yStart === secondY).map(c=>c.sourceX);
  assert.notDeepEqual(first, second);
});
check("Third Bond vertikal menghasilkan offset antarkolom", {...base, pattern:"third", direction:"vertikal"}, r => {
  const cols = [...new Set(r.cells.map(c=>c.column))];
  assert.ok(cols.length > 1);
  const col0 = r.cells.filter(c=>c.column===cols[0]).map(c=>c.sourceY);
  const col1 = r.cells.filter(c=>c.column===cols[1]).map(c=>c.sourceY);
  assert.notDeepEqual(col0, col1);
});
check("Alignment tengah membatasi potongan tepi", {...base, pattern:"stack", alignment:"MC"}, r => {
  assert.ok(r.cells.every(c=>c.width>0 && c.height>0));
  assert.ok(r.cells.some(c=>c.cutLeft>0));
  assert.ok(r.cells.some(c=>c.cutRight>0));
});
assert.throws(() => calculateGeometry({...base, wallW:0}), /lebih dari 0/);
assert.throws(() => calculateGeometry({...base, gap:-1}), /tidak boleh negatif/);
console.log("Semua pengujian geometri selesai.");
