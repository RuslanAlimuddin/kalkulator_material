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

check("Running Bond horizontal mengulang fase setiap 2 baris", {
  wallW:600, wallH:300, matW:60, matH:40, gap:0,
  pattern:"running", direction:"horizontal", alignment:"MC"
}, r => {
  const rows = [...new Set(r.cells.map(c=>c.row))].sort((a,b)=>a-b);
  const firstX = rows.map(row => Math.min(...r.cells.filter(c=>c.row===row).map(c=>c.sourceX)));
  assert.ok(rows.length >= 4);
  for (let i=0; i<firstX.length-2; i++) {
    assert.ok(Math.abs(firstX[i]-firstX[i+2]) < 0.0001,
      "Fase Running Bond harus sama lagi setelah 2 baris");
  }
  for (let i=0; i<firstX.length-1; i++) {
    assert.ok(Math.abs(firstX[i]-firstX[i+1]) > 0.0001,
      "Dua baris berurutan harus bergeser setengah panel");
  }
});
check("Alignment tengah membatasi potongan tepi", {...base, pattern:"stack", alignment:"MC"}, r => {
  assert.ok(r.cells.every(c=>c.width>0 && c.height>0));
  assert.ok(r.cells.some(c=>c.cutLeft>0));
  assert.ok(r.cells.some(c=>c.cutRight>0));
});
assert.throws(() => calculateGeometry({...base, wallW:0}), /lebih dari 0/);
assert.throws(() => calculateGeometry({...base, gap:-1}), /tidak boleh negatif/);

for (const direction of ["horizontal", "vertikal"]) {
  for (const pattern of ["stack", "running", "third"]) {
    const result = calculateGeometry({
      wallW: 617, wallH: 483, matW: 110, matH: 70,
      gap: 0, pattern, direction, alignment: "MC"
    });
    const rowGroups = new Map();
    const columnGroups = new Map();
    for (const cell of result.cells) {
      assert.ok(Number.isInteger(cell.row) && cell.row >= 0,
        "Indeks baris harus bilangan bulat nonnegatif");
      assert.ok(Number.isInteger(cell.column) && cell.column >= 0,
        "Indeks kolom harus bilangan bulat nonnegatif");
      if (!rowGroups.has(cell.row)) rowGroups.set(cell.row, []);
      if (!columnGroups.has(cell.column)) columnGroups.set(cell.column, []);
      rowGroups.get(cell.row).push(cell);
      columnGroups.get(cell.column).push(cell);
    }
    for (const cells of rowGroups.values()) {
      const ys = new Set(cells.map(cell => cell.sourceY));
      assert.equal(ys.size, 1, pattern + " " + direction + ": satu indeks baris harus satu posisi sumber Y");
    }
    for (const cells of columnGroups.values()) {
      const xs = new Set(cells.map(cell => cell.sourceX));
      assert.equal(xs.size, 1, pattern + " " + direction + ": satu indeks kolom harus satu posisi sumber X");
    }
  }
}
console.log("LULUS: metadata indeks baris dan kolom konsisten untuk semua pola dan arah.");

console.log("Semua pengujian geometri selesai.");

for (const pattern of ["stack","running","third"]) {
  for (const direction of ["horizontal","vertikal"]) {
    for (const alignment of ["TL","TC","TR","ML","MC","MR","BL","BC","BR"]) {
      const r=calculateGeometry({...base,wallW:617,wallH:483,pattern,direction,alignment});
      assert.ok(Math.abs(r.areaInstalled-r.areaWall)<0.01, pattern+" "+direction+" "+alignment+" harus menutup bidang tanpa nat");
      for(let i=0;i<r.cells.length;i++) for(let j=i+1;j<r.cells.length;j++) {
        const a=r.cells[i],b=r.cells[j];
        const ox=Math.min(a.xStart+a.width,b.xStart+b.width)-Math.max(a.xStart,b.xStart);
        const oy=Math.min(a.yStart+a.height,b.yStart+b.height)-Math.max(a.yStart,b.yStart);
        assert.ok(!(ox>0.0001&&oy>0.0001),"Potongan tidak boleh tumpang tindih");
      }
    }
  }
}
console.log("Matriks 54 kombinasi pola/arah/alignment lulus.");

check("Nat mengurangi luas cakupan sesuai jarak", {...base,wallW:600,wallH:600,matW:110,matH:220,gap:1,pattern:"stack"}, r => {
  assert.ok(r.coverageRatio < 1);
  assert.ok(r.coverageRatio > 0.95);
});
check("Kasus strip 600×100 cm menghasilkan 30 potongan", {
  wallW:600,wallH:100,matW:20,matH:600,gap:0,
  pattern:"stack",direction:"horizontal",alignment:"BL"
}, r => {
  assert.equal(r.cells.length,30);
  assert.ok(r.cells.every(c=>Math.abs(c.width-20)<0.001 && Math.abs(c.height-100)<0.001));
});
