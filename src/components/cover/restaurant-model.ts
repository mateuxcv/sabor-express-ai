import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RestaurantState, Spot } from "./restaurant-state";

// All geometry, textures and materials are local. This factory runs only in the client renderer.
export function createRestaurant() {
  const root = new THREE.Group();
  const salon = new THREE.Group();
  root.add(salon);
  const geometries = new Map<string, THREE.BufferGeometry>();
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];

  function texture(draw: (ctx: CanvasRenderingContext2D) => void, width = 256, height = 256) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    draw(ctx);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    textures.push(result);
    return result;
  }

  let seed = 37;
  function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  const plaster = texture(ctx => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 10000; i++) {
      ctx.fillStyle = `rgba(100,80,50,${random() * .065})`;
      ctx.fillRect(random() * 256, random() * 256, 1.5, 1.5);
    }
  });
  plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
  const woodTexture = texture(ctx => {
    ctx.fillStyle = "#f1dec0";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 130; i++) {
      ctx.strokeStyle = `rgba(110,66,31,${.03 + random() * .08})`;
      ctx.lineWidth = .4 + random() * 1.5;
      ctx.beginPath();
      const y = random() * 256;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y + random() * 12, 150, y - random() * 12, 256, y);
      ctx.stroke();
    }
  });

  function material(color: string, extras: THREE.MeshStandardMaterialParameters = {}) {
    const result = new THREE.MeshStandardMaterial({ color, roughness: .8, ...extras });
    materials.push(result);
    return result;
  }
  const ivory = material("#efe4cd", { map: plaster });
  const terra = material("#a84730", { map: plaster });
  const goldWall = material("#d2b677", { map: plaster });
  const olive = material("#69714a", { map: plaster });
  const oliveDark = material("#343f32");
  const oak = material("#d2b17a", { map: woodTexture });
  const brass = material("#ae8d4a", { metalness: .65, roughness: .35 });
  const ink = material("#26362e");
  const plate = material("#fffaf0", { roughness: .28 });
  const paper = material("#fcf5e7");
  const accent = material("#e16a41", { emissive: "#bd4724", emissiveIntensity: .18 });

  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, pos: number[] = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(pos[0], pos[1], pos[2]);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(parent: THREE.Object3D, dimensions: [number, number, number], pos: number[], mat: THREE.Material, radius = .04) {
    const key = `b${dimensions.join(",")},${radius}`;
    if (!geometries.has(key)) geometries.set(key, new RoundedBoxGeometry(...dimensions, 2, Math.min(radius, Math.min(...dimensions) / 2)));
    return mesh(parent, geometries.get(key)!, mat, pos);
  }
  function cylinder(parent: THREE.Object3D, top: number, bottom: number, height: number, pos: number[], mat: THREE.Material) {
    const key = `c${top},${bottom},${height}`;
    if (!geometries.has(key)) geometries.set(key, new THREE.CylinderGeometry(top, bottom, height, 28));
    return mesh(parent, geometries.get(key)!, mat, pos);
  }
  function sphere(parent: THREE.Object3D, pos: number[], scale: number[], mat: THREE.Material) {
    if (!geometries.has("sphere")) geometries.set("sphere", new THREE.SphereGeometry(1, 12, 8));
    const object = mesh(parent, geometries.get("sphere")!, mat, pos);
    object.scale.set(scale[0], scale[1], scale[2]);
    return object;
  }
  function tube(parent: THREE.Object3D, points: THREE.Vector3[], radius: number, mat: THREE.Material) {
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, radius, 6, false);
    geometries.set(`tube${geometries.size}`, geometry);
    return mesh(parent, geometry, mat);
  }
  function tag(object: THREE.Object3D, spot: Spot) { object.userData.spot = spot; }

  // A solid ceramic plinth and a two-tone tiled floor.
  box(salon, [6.6, .3, 4.9], [0, -.15, 0], ivory, .14);
  const tileGeo = new THREE.BoxGeometry(.62, .025, .58);
  geometries.set("tiles", tileGeo);
  const tileMats = [material("#eadecb", { map: plaster }), material("#cbbd9f", { map: plaster })];
  for (let variant = 0; variant < 2; variant++) {
    const tiles = new THREE.InstancedMesh(tileGeo, tileMats[variant], 40);
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (let x = 0; x < 10; x++) for (let z = 0; z < 8; z++) {
      if ((x + z) % 2 === variant) tiles.setMatrixAt(index++, matrix.makeTranslation((x - 4.5) * .63, .018, (z - 3.5) * .59));
    }
    tiles.receiveShadow = true;
    salon.add(tiles);
  }

  // Rear wall with a real arched opening, rather than a painted doorway.
  const wall = new THREE.Shape();
  wall.moveTo(-3.3, 0); wall.lineTo(-.7, 0); wall.lineTo(-.7, 1.62);
  wall.absarc(0, 1.62, .7, Math.PI, 0, true);
  wall.lineTo(.7, 0); wall.lineTo(3.3, 0); wall.lineTo(3.3, 2.75); wall.lineTo(-3.3, 2.75); wall.closePath();
  const archGeometry = new THREE.ExtrudeGeometry(wall, { depth: .16, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2, steps: 1, curveSegments: 28 });
  geometries.set("arch", archGeometry);
  mesh(salon, archGeometry, terra, [0, .025, -2.4]);
  box(salon, [.17, 2.75, 4.85], [-3.22, 1.375, 0], goldWall);
  box(salon, [.22, .1, 4.6], [-3.08, .1, 0], oak);

  // Upholstered banquette, stitched into sections.
  box(salon, [.76, .44, 3.95], [-2.72, .25, -.12], oak);
  box(salon, [.84, .18, 4.04], [-2.68, .55, -.12], olive, .09);
  for (let i = 0; i < 9; i++) box(salon, [.18, .74, .435], [-3, .98, -1.9 + i * .445], olive, .075);

  function chair(parent: THREE.Object3D, x: number, z: number, rotation: number, color: THREE.Material) {
    const group = new THREE.Group();
    group.position.set(x, 0, z); group.rotation.y = rotation; parent.add(group);
    cylinder(group, .29, .29, .12, [0, .54, 0], color);
    const backGeo = new THREE.CylinderGeometry(.31, .31, .48, 20, 1, true, 0, Math.PI);
    geometries.set(`chair${geometries.size}`, backGeo);
    const backMat = color.clone(); backMat.side = THREE.DoubleSide; materials.push(backMat);
    mesh(group, backGeo, backMat, [0, .83, 0]);
    for (const px of [-.19, .19]) for (const pz of [-.18, .18]) cylinder(group, .024, .035, .49, [px, .25, pz], oak);
    return group;
  }

  const selectedPlates: THREE.Object3D[] = [];
  const selectedChairs: THREE.Object3D[] = [];
  const haloGeometry = new THREE.TorusGeometry(.78, .015, 8, 64);
  geometries.set("table-halo", haloGeometry);
  const tableHalo = mesh(salon, haloGeometry, accent, [1.05, .05, .75]);
  tableHalo.rotation.x = Math.PI / 2;
  function table(x: number, z: number, selected = false) {
    const group = new THREE.Group(); salon.add(group); group.position.set(x, 0, z);
    tag(group, "table");
    cylinder(group, .61, .61, .1, [0, .87, 0], oak);
    cylinder(group, .075, .12, .74, [0, .44, 0], brass);
    cylinder(group, .27, .3, .045, [0, .055, 0], brass);
    for (let i = 0; i < (selected ? 4 : 2); i++) {
      const a = i / (selected ? 4 : 2) * Math.PI * 2;
      const setting = new THREE.Group(); group.add(setting);
      cylinder(setting, .15, .135, .025, [Math.cos(a) * .37, .94, Math.sin(a) * .37], plate);
      cylinder(setting, .12, .12, .006, [Math.cos(a) * .37, .956, Math.sin(a) * .37], ivory);
      box(setting, [.018, .013, .19], [Math.cos(a) * .37 + .19, .94, Math.sin(a) * .37], brass, .005);
      if (selected) selectedPlates.push(setting);
    }
    cylinder(group, .035, .055, .1, [0, .98, 0], ivory);
    tube(group, [new THREE.Vector3(0, 1, 0), new THREE.Vector3(.01, 1.2, 0), new THREE.Vector3(.07, 1.3, 0)], .009, olive);
    sphere(group, [.06, 1.22, 0], [.09, .025, .03], olive).rotation.z = .6;
    if (selected) {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        selectedChairs.push(chair(salon, x + Math.cos(a) * .89, z + Math.sin(a) * .89, -a + Math.PI / 2, i % 2 ? terra : olive));
      }
    } else chair(salon, x + .83, z, Math.PI / 2, terra);
  }
  table(-1.85, -1.17);
  table(-1.85, 1.1);
  table(1.05, .75, true);

  // Fluted reception counter and a tiny espresso cup.
  const counter = new THREE.Group(); salon.add(counter); counter.position.set(2.12, 0, -1.43); tag(counter, "counter");
  box(counter, [1.5, .88, .7], [0, .45, 0], oak, .12);
  for (let i = 0; i < 19; i++) cylinder(counter, .025, .025, .84, [-.66 + i * .073, .47, .35], oak);
  box(counter, [1.65, .12, .83], [0, .95, 0], ivory, .12);
  cylinder(counter, .095, .07, .14, [.42, 1.08, 0], plate);
  cylinder(counter, .077, .077, .007, [.42, 1.155, 0], material("#4e2f21"));
  box(counter, [.31, .37, .02], [-.25, 1.19, -.07], olive).rotation.x = -.12;

  // A welcome podium gives Lia a physical place in the restaurant.
  const podium = new THREE.Group(); salon.add(podium); tag(podium, "lia");
  box(podium, [.63, .97, .5], [-2.55, .49, 2.04], oak, .06);
  box(podium, [.72, .075, .6], [-2.55, 1.02, 2.04], oliveDark, .04);
  const phone = new THREE.Group(); podium.add(phone); phone.position.set(-2.55, 1.08, 2.04); phone.rotation.y = -.18;
  box(phone, [.42, .065, .75], [0, 0, 0], ink, .065);
  box(phone, [.35, .008, .63], [0, .037, 0], material("#ced4a7"), .025);
  for (let i = 0; i < 3; i++) box(phone, [.22, .007, .08], [i % 2 ? .035 : -.025, .044, -.15 + i * .14], paper, .015);

  function pendant(x: number, z: number) {
    tube(salon, [new THREE.Vector3(-3.08, 2.27, z), new THREE.Vector3(-2.7, 2.74, z), new THREE.Vector3(x, 2.87, z), new THREE.Vector3(x, 2.43, z)], .018, brass);
    cylinder(salon, .065, .27, .23, [x, 2.32, z], brass);
    cylinder(salon, .235, .235, .02, [x, 2.195, z], material("#fff1bd", { emissive: "#ffdc7e", emissiveIntensity: .5 }));
  }
  pendant(-1.82, -1.17); pendant(-1.82, 1.1);

  // Botanical artwork on the left wall.
  for (const z of [-.8, .6]) {
    box(salon, [.07, .62, .47], [-3.08, 1.65, z], oak);
    box(salon, [.012, .52, .37], [-3.035, 1.65, z], paper, .008);
    for (let i = 0; i < 4; i++) sphere(salon, [-3.02, 1.5 + i * .09, z + (i % 2 ? .07 : -.04)], [.008, .065, .035], olive).rotation.x = i % 2 ? -.5 : .5;
  }

  // Olive tree made from deterministic branches and matte leaves.
  cylinder(salon, .24, .18, .45, [2.65, .24, -.45], terra);
  cylinder(salon, .2, .2, .02, [2.65, .475, -.45], material("#68543a"));
  tube(salon, [new THREE.Vector3(2.65, .45, -.45), new THREE.Vector3(2.62, 1.35, -.45), new THREE.Vector3(2.73, 2.15, -.48)], .029, oak);
  for (let i = 0; i < 32; i++) {
    const a = random() * Math.PI * 2;
    const h = .95 + random() * 1.3;
    const r = .15 + random() * .32;
    const x = 2.65 + Math.cos(a) * r;
    const z = -.45 + Math.sin(a) * r;
    tube(salon, [new THREE.Vector3(2.66, h - .15, -.45), new THREE.Vector3(x, h, z)], .008, oak);
    sphere(salon, [x, h, z], [.13, .032, .05], i % 3 ? olive : oliveDark).rotation.set(a, a, .5);
  }

  // Restaurant wordmark on the rear wall; navigation and essential text remain HTML.
  const signTexture = texture(ctx => {
    ctx.fillStyle = "#f7e9cd";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#424531";
    ctx.font = "bold 72px Georgia";
    ctx.textAlign = "center";
    ctx.fillText("sabor", 256, 108);
    ctx.font = "32px sans-serif";
    ctx.fillText("E X P R E S S", 256, 173);
  }, 512, 256);
  const signMat = material("#ffffff", { map: signTexture });
  box(salon, [1.23, .63, .05], [1.82, 2.02, -2.19], signMat, .025);

  const parcel = new THREE.Group(); counter.add(parcel); parcel.position.set(-.02, 1.02, .05);
  box(parcel, [.48, .35, .35], [0, .17, 0], goldWall);
  const parcelBand = box(parcel, [.12, .355, .355], [0, .17, 0], terra, .012);
  tube(parcel, [new THREE.Vector3(-.1, .35, 0), new THREE.Vector3(-.09, .52, 0), new THREE.Vector3(.09, .52, 0), new THREE.Vector3(.1, .35, 0)], .018, oak);

  // A real receipt on the counter is the entry into this session's local history.
  const receipt = new THREE.Group(); salon.add(receipt); receipt.position.set(2.58, 1.1, -1.3); tag(receipt, "record");
  box(receipt, [.34, .53, .025], [0, .24, 0], paper, .01);
  for (let i = 0; i < 5; i++) box(receipt, [.24 - (i % 2) * .05, .015, .008], [0, .4 - i * .075, .02], i === 0 ? terra : oliveDark, .003);

  const reservedSign = new THREE.Group(); salon.add(reservedSign); reservedSign.position.set(1.05, .94, .75); tag(reservedSign, "table");
  const reservedTexture = texture(ctx => {
    ctx.fillStyle = "#e6eace"; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#41543a"; ctx.textAlign = "center"; ctx.font = "bold 37px sans-serif"; ctx.fillText("RESERVADA", 256, 80);
  }, 512, 128);
  box(reservedSign, [.43, .17, .028], [0, .1, 0], material("#ffffff", { map: reservedTexture }), .01);

  // A freshly prepared burger, small enough to be discovered by zooming in.
  const food = new THREE.Group(); counter.add(food); food.position.set(-.35, 1.06, .06);
  cylinder(food, .22, .22, .025, [0, 0, 0], plate);
  const bun = material("#d6a25c");
  cylinder(food, .145, .15, .075, [0, .065, 0], bun);
  const patty = cylinder(food, .14, .14, .065, [0, .13, 0], material("#603f28"));
  cylinder(food, .17, .16, .02, [0, .174, 0], olive);
  sphere(food, [0, .195, 0], [.16, .09, .16], bun);
  const veggiePatty = material("#789146");
  const meatPatty = patty.material;

  // Stylized clay people: articulated limbs, a moving waiter, and seated guests.
  const skin = material("#bd8963");
  const hair = material("#3c3026");
  function person(x: number, z: number, shirt: THREE.Material, seated = false) {
    const actor = new THREE.Group(); salon.add(actor); actor.position.set(x, 0, z);
    const torso = new THREE.Group(); actor.add(torso); torso.position.y = seated ? .85 : .82;
    box(torso, [.28, .39, .2], [0, .08, 0], shirt, .09);
    sphere(torso, [0, .44, 0], [.125, .15, .12], skin);
    sphere(torso, [0, .51, -.014], [.13, .1, .115], hair);
    sphere(torso, [0, .44, .115], [.029, .033, .03], skin);
    const arms: THREE.Group[] = []; const legs: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group(); torso.add(arm); arm.position.set(side * .19, .2, 0);
      box(arm, [.09, .31, .1], [0, -.12, 0], shirt, .035); sphere(arm, [0, -.31, 0], [.048, .065, .045], skin); arms.push(arm);
      const leg = new THREE.Group(); actor.add(leg); leg.position.set(side * .085, seated ? .61 : .65, 0);
      box(leg, [.11, seated ? .3 : .52, .12], [0, seated ? -.13 : -.23, 0], ink, .035);
      box(leg, [.12, .085, .2], [0, seated ? -.32 : -.52, .04], ink, .025); legs.push(leg);
    }
    return { actor, torso, arms, legs };
  }
  const waiter = person(-.65, .15, paper); tag(waiter.actor, "lia");
  box(waiter.torso, [.22, .28, .015], [0, -.06, .108], oliveDark, .015);
  waiter.arms[1].rotation.x = -1;
  const tray = cylinder(waiter.arms[1], .2, .2, .025, [0, -.32, .02], brass);
  cylinder(tray, .055, .045, .1, [0, .07, 0], plate);
  const guestA = person(-2.6, -1.15, terra, true); guestA.actor.rotation.y = Math.PI / 2;
  const guestB = person(-.98, -1.15, olive, true); guestB.actor.rotation.y = -Math.PI / 2;
  const cook = person(2.12, -2.02, paper); tag(cook.actor, "counter");
  cylinder(cook.torso, .14, .13, .12, [0, .64, 0], paper);

  const steamMaterial = material("#fff9e9", { transparent: true, opacity: .22, depthWrite: false });
  const steam = Array.from({ length: 6 }, (_, i) => sphere(salon, [2.54, 1.35 + i * .06, -1.43], [.023, .075, .023], steamMaterial));
  const anchors: Record<Spot, THREE.Vector3> = {
    table: new THREE.Vector3(1.05, 1.2, .75),
    counter: new THREE.Vector3(1.88, 1.65, -1.38),
    lia: new THREE.Vector3(-2.55, 1.3, 2.04),
    record: new THREE.Vector3(2.6, 1.65, -1.3),
  };
  let state: RestaurantState;
  const animation = { chairs: 0, parcel: 0, reserve: 0, handoff: 0 };
  function update(next: RestaurantState, selected: Spot | null) {
    state = next;
    tableHalo.visible = selected === "table" || next.reserved;
    tableHalo.material = next.reserved ? olive : accent;
    parcelBand.material = next.dish === "veggie" ? olive : terra;
    patty.material = next.dish === "veggie" ? veggiePatty : meatPatty;
    food.visible = next.order === "preparing";
    parcel.visible = next.order === "ready";
  }
  function tick(time: number, delta: number, animate: boolean) {
    if (!state) return;
    const blend = animate ? 1 - Math.exp(-delta * 6) : 1;
    animation.chairs += ((state.people === 4 ? 1 : 0) - animation.chairs) * blend;
    animation.parcel += ((state.order === "ready" ? 1 : 0) - animation.parcel) * blend;
    animation.reserve += ((state.reserved ? 1 : 0) - animation.reserve) * blend;
    animation.handoff += ((state.human ? 1 : 0) - animation.handoff) * blend;
    selectedPlates.forEach((p, i) => { if (i > 1) { p.scale.setScalar(Math.max(.001, animation.chairs)); p.visible = animation.chairs > .01; } });
    selectedChairs.forEach((c, i) => { if (i > 1) { c.scale.setScalar(Math.max(.001, animation.chairs)); c.visible = animation.chairs > .01; } });
    reservedSign.scale.setScalar(Math.max(.001, animation.reserve)); reservedSign.visible = animation.reserve > .01;
    parcel.scale.setScalar(Math.max(.001, animation.parcel));
    const z = .1 + Math.sin(time * .25) * 1.55;
    waiter.actor.position.set(-.43 + animation.handoff * .48, 0, z * (1 - animation.handoff) + 1.72 * animation.handoff);
    const targetYaw = (Math.cos(time * .25) > 0 ? 0 : Math.PI) * (1 - animation.handoff) + .6 * animation.handoff;
    const yawDifference = Math.atan2(Math.sin(targetYaw - waiter.actor.rotation.y), Math.cos(targetYaw - waiter.actor.rotation.y));
    waiter.actor.rotation.y += yawDifference * (animate ? Math.min(1, delta * 4) : 1);
    const walk = animate ? Math.sin(time * 4) * .32 * (1 - animation.handoff) : 0;
    waiter.legs[0].rotation.x = walk; waiter.legs[1].rotation.x = -walk; waiter.arms[0].rotation.x = -walk * .6;
    waiter.torso.position.y = .82 + (animate ? Math.sin(time * 8) * .008 : 0);
    guestA.torso.rotation.z = animate ? Math.sin(time * .8) * .025 : 0;
    guestB.arms[0].rotation.x = -.3 + (animate ? Math.sin(time * 1.2) * .15 : 0);
    cook.arms[0].rotation.x = state.order === "preparing" && animate ? -.6 + Math.sin(time * 5) * .3 : -.2;
    steam.forEach((v, i) => { const phase = ((time * .28 + i / 6) % 1); v.position.y = 1.24 + phase * .5; v.position.x = 2.54 + Math.sin(time + i) * .025; v.scale.set(.023 * (.5 + phase), .075 * (.5 + phase), .023 * (.5 + phase)); v.visible = animate; v.castShadow = false; });
  }

  // Batch the architectural meshes by material and interaction target. Articulated
  // people and interactive props stay separate, so one continuous scene is affordable.
  const dynamicRoots = new Set<THREE.Object3D>([...selectedPlates, ...selectedChairs, tableHalo, parcel, reservedSign, food, waiter.actor, guestA.actor, guestB.actor, cook.actor, ...steam]);
  const batches = new Map<string, { material: THREE.Material; spot?: Spot; sources: THREE.Mesh[]; geometries: THREE.BufferGeometry[] }>();
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || Array.isArray(object.material)) return;
    let parent: THREE.Object3D | null = object;
    let spot: Spot | undefined;
    while (parent) { if (dynamicRoots.has(parent)) return; spot ??= parent.userData.spot; parent = parent.parent; }
    const key = `${object.material.uuid}:${spot ?? "decor"}`;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    if (!batches.has(key)) batches.set(key, { material: object.material, spot, sources: [], geometries: [] });
    const batch = batches.get(key)!; batch.sources.push(object); batch.geometries.push(geometry);
  });
  for (const batch of batches.values()) {
    const merged = mergeGeometries(batch.geometries);
    if (merged) {
      geometries.set(`batch${geometries.size}`, merged);
      const baked = mesh(root, merged, batch.material);
      if (batch.spot) tag(baked, batch.spot);
      batch.sources.forEach(source => source.removeFromParent());
    }
    batch.geometries.forEach(geometry => geometry.dispose());
  }

  function dispose() {
    for (const geometry of geometries.values()) geometry.dispose();
    for (const mat of materials) mat.dispose();
    for (const tex of textures) tex.dispose();
  }

  return { root, update, tick, anchors, dispose };
}
