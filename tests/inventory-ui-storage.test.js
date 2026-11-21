const assert = require("node:assert/strict");
require("fake-indexeddb/auto");
const Storage = require("../assets/js/inventory-storage.js");
const Validator = require("../assets/js/inventory-validator.js");
const { DB_NAME, createStorage } = Storage;
const now = "2026-11-18T12:00:00.000Z";

async function deleteDb() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}
async function main() {
  await deleteDb();
  const storage = createStorage({ validator: Validator });
  await storage.add("materials", {
    id:"MAT-UI-1",name:"Triplek Uji",category:"triplek",thicknessMm:12,
    surface:null,grainRequired:false,motif:"plain",rotationPolicy:"free",active:true
  });
  await storage.add("jobs", {
    id:"JOB-UI-1",name:"Pekerjaan UI",status:"open",createdAt:now,closedAt:null
  });

  const created = await storage.createRemainder({
    id:"REM-UI-1",materialId:"MAT-UI-1",originJobId:"JOB-UI-1",
    sourceSheetId:"JOB-UI-1-SHEET-01",widthCm:80,heightCm:45,
    thicknessMm:12,grainDirection:"none",motif:"plain",rotationAllowed:true,
    condition:"good",createdAt:now
  });
  assert.equal(created.status,"available");
  assert.equal((await storage.get("remainders","REM-UI-1")).widthCm,80);
  let movements = await storage.getByIndex("movements","remainderId","REM-UI-1");
  assert.equal(movements.length,1);
  assert.equal(movements[0].type,"created");
  console.log("LULUS: pencatatan sisa membuat stok dan riwayat dalam satu transaksi.");

  await assert.rejects(storage.createRemainder({
    materialId:"MAT-UI-1",originJobId:"JOB-TIDAK-ADA",sourceSheetId:"SHEET-X",
    widthCm:20,heightCm:10,thicknessMm:12,grainDirection:"none",
    motif:"plain",rotationAllowed:true
  }));
  assert.equal(await storage.get("remainders", "REM-" + "unused"), null);
  assert.equal((await storage.getAll("remainders")).length,1);
  assert.equal((await storage.getAll("movements")).length,1);
  console.log("LULUS: referensi pekerjaan tidak valid membatalkan seluruh pencatatan.");

  await assert.rejects(storage.createRemainder({
    materialId:"MAT-UI-1",originJobId:"JOB-UI-1",sourceSheetId:"SHEET-MISMATCH",
    widthCm:20,heightCm:10,thicknessMm:8,grainDirection:"none",
    motif:"plain",rotationAllowed:true
  }));
  assert.equal((await storage.getAll("remainders")).length,1);
  assert.equal((await storage.getAll("movements")).length,1);
  console.log("LULUS: ketebalan sisa yang berbeda dari katalog material ditolak secara atomik.");

  await storage.updateRemainderState({id:"REM-UI-1",changes:{condition:"damaged"},timestamp:now});
  let remainder = await storage.get("remainders","REM-UI-1");
  assert.equal(remainder.condition,"damaged");
  assert.equal(remainder.status,"available");
  movements = await storage.getByIndex("movements","remainderId","REM-UI-1");
  assert.ok(movements.some(item => item.type === "condition_changed"));
  console.log("LULUS: perubahan kondisi tercatat bersama perubahan stok.");

  await storage.updateRemainderState({
    id:"REM-UI-1",changes:{condition:"good"},timestamp:"2026-11-18T12:00:00.001Z"
  });
  await storage.updateRemainderState({
    id:"REM-UI-1",changes:{status:"discarded"},timestamp:"2026-11-18T12:00:00.002Z"
  });
  remainder = await storage.get("remainders","REM-UI-1");
  assert.equal(remainder.status,"discarded");
  movements = await storage.getByIndex("movements","remainderId","REM-UI-1");
  assert.ok(movements.some(item => item.type === "discarded"));
  await assert.rejects(storage.updateRemainderState({id:"REM-UI-1",changes:{condition:"damaged"}}));
  console.log("LULUS: stok dapat dibuang dan stok non-tersedia terlindungi dari perubahan manual.");

  const exported = await storage.exportJSON();
  const validation = Validator.validateInventoryBundle(exported);
  assert.equal(validation.valid,true,JSON.stringify(validation.errors));
  console.log("LULUS: hasil pengelolaan UI memenuhi validator paket inventaris.");

  await storage.close();
  await deleteDb();
  console.log("Semua pengujian pencatatan UI inventaris selesai.");
}
main().catch(error => { console.error("GAGAL:",error); process.exitCode=1; });
