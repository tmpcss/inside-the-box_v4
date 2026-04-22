import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
// MADE BYtomi

// ─── Types ────────────────────────────────────────────────────────────────────
type SceneType = 'camera' | 'trailer' | 'fileinput' | 'grid_img' | 'gradient' | 'win98' | 'white';
type LightType = 'point' | 'spot' | 'led';

interface FaceConfig {
  id: number;
  name: string;
  scene: SceneType;
  cameraSegment: number; // 0-3 default segment
  mapping: { x: number; y: number; w: number; h: number }; // Normalized UV rect
  params: Record<string, any>; // Per-scene custom settings
  resolution: { w: number; h: number }; // Per-face canvas resolution
}

interface LightPreset {
  name: string;
  lights: LightConfig[];
}

interface LightConfig {
  id: number;
  name: string;
  color: string;
  intensity: number;
  strobe: boolean;
  strobeHz: number;
  type: LightType;
  x: number;
  y: number;
  z: number;
  rotX: number; // degrees
  rotY: number; // degrees
  rotZ?: number; // degrees
  ledCount?: number;
}

interface LightObjects {
  threeLight: THREE.PointLight | THREE.SpotLight;
  helperMesh: THREE.Mesh;
  helperMat: THREE.MeshBasicMaterial;
  ledGroup?: THREE.Group;
  spotHelper?: THREE.SpotLightHelper;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE_CUBE_SIZE = 3.5;
const HALF = BASE_CUBE_SIZE / 2;

const SCENE_OPTIONS: { value: SceneType; label: string }[] = [
  { value: 'trailer', label: '🎬 Video Base' },
  { value: 'camera', label: '📹 Cámara Virtual' },
  { value: 'fileinput', label: '📁 Archivo Local' },
  { value: 'grid_img', label: '▦ Grid' },
  { value: 'gradient', label: '🌈 Gradient Wash' },
  { value: 'win98', label: '🖥️ Win98 Glitch' },
  { value: 'white', label: '⬜ Blanco' },
];

// ─── UI color theme ──────────────────────────────────────────────────────────
interface ColorTheme {
  bgMain: string;
  bgPanel: string;
  bgCard: string;
  bgInput: string;
  bgOverlay: string;
  border: string;
  borderStrong: string;
  dangerBorder: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textLabel: string;
  textSubtle: string;
  textMuted: string;
  textFaint: string;
  textGhost: string;
  accent: string;
  accentDim: string;
  accentText: string;
  white: string;
  variantAccent: string;
  danger: string;
}

const C: ColorTheme = {
  bgMain: '#0a0a0e',
  bgPanel: '#0e0e14',
  bgCard: '#131320',
  bgInput: '#0a0a0e',
  bgOverlay: '#0e0e14f2',

  border: '#1c1c2a',
  borderStrong: '#2a2a3c',
  dangerBorder: '#4a1515',

  textPrimary: '#f0f0f4',
  textSecondary: '#c0c0cc',
  textTertiary: '#8e8e9e',
  textLabel: '#72728a',
  textSubtle: '#585870',
  textMuted: '#444458',
  textFaint: '#343444',
  textGhost: '#282838',

  accent: '#4a8cff',
  accentDim: '#2a5ccc',
  accentText: '#ffffff',
  white: '#ffffff',
  variantAccent: '#4a8cff',
  danger: '#ff5555',
};

// ─── Standalone rig builder helpers ──────────────────────────────────────────
function buildPipeRig(group: THREE.Group, HW: number, HH: number, HD: number, FY: number) {
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.3 });
  const nodeMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.2 });

  const makeTube = (a: THREE.Vector3, b: THREE.Vector3, r = 0.04) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(r, r, len, 8);
    const m = new THREE.Mesh(geo, trussMat);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.add(m);
  };

  const makeNode = (p: THREE.Vector3, r = 0.08) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), nodeMat);
    m.position.copy(p);
    group.add(m);
  };

  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // Main 8 corners
  const C = [
    V(-HW, -HH, -HD), V(HW, -HH, -HD), V(HW, -HH, HD), V(-HW, -HH, HD),
    V(-HW, HH, -HD), V(HW, HH, -HD), V(HW, HH, HD), V(-HW, HH, HD),
  ];
  const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  EDGES.forEach(([a, b]) => makeTube(C[a], C[b]));
  C.forEach(c => makeNode(c));

  // Vertical cross-bracing
  [[0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => {
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      const p = C[a].clone().lerp(C[b], t);
      const bg = new THREE.CylinderGeometry(0.015, 0.015, 0.14, 4);
      const bm = new THREE.Mesh(bg, trussMat);
      bm.position.copy(p);
      bm.rotation.z = k % 2 === 0 ? Math.PI / 4 : -Math.PI / 4;
      group.add(bm);
    }
  });

  // Ceiling Rig
  const CY = HH + 0.12;
  const CC = [V(-HW, CY, -HD), V(HW, CY, -HD), V(HW, CY, HD), V(-HW, CY, HD)];
  [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]].forEach(([a, b]) => makeTube(CC[a], CC[b], 0.03));
  CC.forEach(c => { makeNode(c, 0.06); makeTube(c, V(c.x, HH, c.z), 0.025); });
  makeTube(V(0, CY, -HD), V(0, CY, HD), 0.025);
  makeTube(V(-HW, CY, 0), V(HW, CY, 0), 0.025);

  // Floor Rig
  const FC2 = [V(-HW, FY, -HD), V(HW, FY, -HD), V(HW, FY, HD), V(-HW, FY, HD)];
  [[0, 1], [1, 2], [2, 3], [3, 0]].forEach(([a, b]) => makeTube(FC2[a], FC2[b], 0.03));
  FC2.forEach(c => { makeNode(c, 0.06); makeTube(c, V(c.x, -HH, c.z), 0.025); });
}

function makeTrussSegment(
  group: THREE.Group,
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  trussHalfSize = 0.10,
  color = 0x111111
) {
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.2 });
  const chordR = 0.022;
  const webR = 0.014;

  const dir = pointB.clone().sub(pointA);
  const length = dir.length();
  const zAxis = dir.clone().normalize();
  const tempUp = Math.abs(zAxis.dot(new THREE.Vector3(0, 1, 0))) < 0.95
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const xAxis = new THREE.Vector3().crossVectors(tempUp, zAxis).normalize();
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

  const offsets = [
    xAxis.clone().multiplyScalar(trussHalfSize).add(yAxis.clone().multiplyScalar(trussHalfSize)),
    xAxis.clone().multiplyScalar(-trussHalfSize).add(yAxis.clone().multiplyScalar(trussHalfSize)),
    xAxis.clone().multiplyScalar(-trussHalfSize).add(yAxis.clone().multiplyScalar(-trussHalfSize)),
    xAxis.clone().multiplyScalar(trussHalfSize).add(yAxis.clone().multiplyScalar(-trussHalfSize)),
  ];

  const addTube = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 0.001) return;
    const geo = new THREE.CylinderGeometry(r, r, len, 6);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(a.clone().add(b).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    group.add(mesh);
  };

  offsets.forEach(off => {
    addTube(pointA.clone().add(off), pointB.clone().add(off), chordR);
  });

  const panelCount = Math.max(2, Math.min(8, Math.round(length / 0.5)));
  for (let k = 0; k < panelCount; k++) {
    const t0 = k / panelCount;
    const t1 = (k + 1) / panelCount;
    const p0 = pointA.clone().add(dir.clone().multiplyScalar(t0));
    const p1 = pointA.clone().add(dir.clone().multiplyScalar(t1));
    for (let f = 0; f < 4; f++) {
      const o0 = offsets[f];
      const o1 = offsets[(f + 1) % 4];
      addTube(p0.clone().add(o0), p1.clone().add(o1), webR);
      addTube(p0.clone().add(o1), p1.clone().add(o0), webR);
    }
    if (k === 0 || k === panelCount - 1 || k % 2 === 0) {
      const pp = k === 0 ? p0 : p1;
      for (let f = 0; f < 4; f++) {
        addTube(pp.clone().add(offsets[f]), pp.clone().add(offsets[(f + 1) % 4]), webR);
      }
    }
  }
}

function buildColumnsRig(group: THREE.Group, HW: number, HH: number, HD: number, _FY: number) {
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.3 });
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // Full half-height = screen edge (HH is inset by 0.15 for rig clearance, screens sit at HH+0.15)
  const FH = HH + 0.15;

  // 4 vertical truss towers — one at each corner
  const corners: [number, number][] = [[-HW, -HD], [HW, -HD], [HW, HD], [-HW, HD]];
  corners.forEach(([cx, cz]) => {
    makeTrussSegment(group, V(cx, -FH, cz), V(cx, FH, cz), 0.07, 0x111111);

    // Base plate
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.025, 0.30), plateMat);
    bp.position.set(cx, -FH - 0.013, cz);
    group.add(bp);

    // Top plate
    const tp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.020, 0.26), plateMat);
    tp.position.set(cx, FH + 0.010, cz);
    group.add(tp);
  });
}

// ─── Realistic human figure ───────────────────────────────────────────────────
function buildHumanFigure(parentGroup: THREE.Group, posX: number, posY: number, posZ: number, rotY: number) {
  const figGroup = new THREE.Group();
  figGroup.position.set(posX, posY, posZ);
  figGroup.rotation.y = rotY;
  parentGroup.add(figGroup);

  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.1, roughness: 0.9 });

  const addCyl = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) => {
    const a = new THREE.Vector3(ax, ay, az);
    const b = new THREE.Vector3(bx, by, bz);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 0.001) return;
    const geo = new THREE.CylinderGeometry(r, r, len, 7);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    figGroup.add(m);
  };

  // Proportions: 1.75m total, feet at y=0
  // Head (sphere Ø24cm)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), mat);
  head.position.set(0, 1.63, 0);
  figGroup.add(head);

  // Neck
  addCyl(0, 1.49, 0, 0, 1.51, 0, 0.045);

  // Torso: shoulders y=1.47 → hips y=0.94
  addCyl(0, 0.94, 0, 0, 1.47, 0, 0.10);

  // Arms (upper arm + forearm, slight natural splay)
  for (const s of [-1, 1] as const) {
    // Upper arm: shoulder → elbow
    addCyl(s * 0.19, 1.41, 0, s * 0.33, 1.13, 0, 0.040);
    // Forearm: elbow → wrist/hand
    addCyl(s * 0.33, 1.13, 0, s * 0.30, 0.87, 0, 0.032);
  }

  // Pelvis sphere
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat);
  pelvis.position.set(0, 0.94, 0);
  figGroup.add(pelvis);

  // Legs (upper leg + lower leg + foot)
  for (const s of [-1, 1] as const) {
    // Upper leg: hip → knee
    addCyl(s * 0.09, 0.92, 0, s * 0.10, 0.50, 0, 0.058);
    // Lower leg: knee → ankle
    addCyl(s * 0.10, 0.50, 0, s * 0.10, 0.07, 0, 0.048);
    // Foot
    addCyl(s * 0.10, 0.07, -0.02, s * 0.10, 0.04, 0.15, 0.035);
  }
}

function buildAllHumanFigures(group: THREE.Group, HW: number, HH: number, HD: number) {
  const floorY = -HH - 0.12; // standing on the floor frame

  // 2 inside (facing each other)
  buildHumanFigure(group, -0.35, floorY, 0, 0);
  buildHumanFigure(group, 0.35, floorY, 0, Math.PI);

  // 2 outside (facing the cube)
  buildHumanFigure(group, 0, floorY, HD + 2.0, Math.PI);
  buildHumanFigure(group, HW + 2.0, floorY, 0, -Math.PI / 2);
}

function buildTrussRig(group: THREE.Group, HW: number, HH: number, HD: number, FY: number) {
  const nodeMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.2 });
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const C = [
    V(-HW, -HH, -HD), V(HW, -HH, -HD), V(HW, -HH, HD), V(-HW, -HH, HD),
    V(-HW, HH, -HD), V(HW, HH, -HD), V(HW, HH, HD), V(-HW, HH, HD),
  ];

  const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  EDGES.forEach(([a, b]) => makeTrussSegment(group, C[a], C[b]));

  C.forEach(c => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), nodeMat);
    m.position.copy(c);
    group.add(m);
  });

  // Ceiling rig
  const CY = HH + 0.12;
  const CC = [V(-HW, CY, -HD), V(HW, CY, -HD), V(HW, CY, HD), V(-HW, CY, HD)];
  [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]].forEach(([a, b]) => makeTrussSegment(group, CC[a], CC[b], 0.07));
  CC.forEach(c => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), nodeMat);
    m.position.copy(c);
    group.add(m);
    makeTrussSegment(group, c, V(c.x, HH, c.z), 0.07);
  });
  makeTrussSegment(group, V(0, CY, -HD), V(0, CY, HD), 0.07);
  makeTrussSegment(group, V(-HW, CY, 0), V(HW, CY, 0), 0.07);

  // Floor rig
  const FC2 = [V(-HW, FY, -HD), V(HW, FY, -HD), V(HW, FY, HD), V(-HW, FY, HD)];
  [[0, 1], [1, 2], [2, 3], [3, 0]].forEach(([a, b]) => makeTrussSegment(group, FC2[a], FC2[b], 0.07));
  FC2.forEach(c => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), nodeMat);
    m.position.copy(c);
    group.add(m);
    makeTrussSegment(group, c, V(c.x, -HH, c.z), 0.07);
  });
}

// ─── LED strip factory (used at init and in switchLightType) ─────────────────
function createLedStripGroup(
  cfg: LightConfig,
  cd: { w: number; h: number; d: number },
  nLed = 12
): THREE.Group {
  const stripLen = cd.h * 0.92;
  const group = new THREE.Group();
  group.position.set(cfg.x, cfg.y, cfg.z);

  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.7, roughness: 0.3 });
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, stripLen, 8), tubeMat));

  const ledGeo = new THREE.SphereGeometry(0.028, 8, 8);
  const count = cfg.ledCount ?? nLed;
  for (let k = 0; k < count; k++) {
    const yOff = (k / Math.max(1, count - 1) - 0.5) * stripLen;
    const ledMesh = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: cfg.color, toneMapped: false }));
    ledMesh.position.set(0, yOff, 0);
    group.add(ledMesh);
    if (k % 3 === 0) {
      const lgt = new THREE.PointLight(cfg.color, cfg.intensity * 0.3, 4);
      lgt.position.set(0, yOff, 0);
      group.add(lgt);
    }
  }
  return group;
}

// ─── Texture draw helpers (module-level, pure — no React deps) ──────────────
function easeBackOut(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function drawGrid(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, opacity = 0.1) {
  ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
  ctx.lineWidth = 0.5;
  const step = Math.max(canvas.width / 24, 20);
  ctx.beginPath();
  for (let x = 0; x <= canvas.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
  for (let y = 0; y <= canvas.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
  ctx.stroke();
}

function drawGradient(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number, params: any) {
  const speed = params?.speed ?? 1;
  const angle = (t * 0.15 * speed) % (Math.PI * 2);
  const cx = canvas.width / 2 + Math.cos(angle) * canvas.width * 0.5;
  const cy = canvas.height / 2 + Math.sin(angle) * canvas.height * 0.5;
  const cx2 = canvas.width / 2 - Math.cos(angle) * canvas.width * 0.5;
  const cy2 = canvas.height / 2 - Math.sin(angle) * canvas.height * 0.5;
  const g = ctx.createLinearGradient(cx, cy, cx2, cy2);
  const h1 = (t * 30 * speed) % 360;
  const h2 = (h1 + 110) % 360;
  const h3 = (h1 + 220) % 360;
  g.addColorStop(0, `hsl(${h1},100%,55%)`);
  g.addColorStop(0.45, `hsl(${h2},100%,50%)`);
  g.addColorStop(1, `hsl(${h3},100%,55%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const r2 = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width * 0.8);
  r2.addColorStop(0, `hsla(${(h1 + 60) % 360},100%,70%,0.35)`);
  r2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r2;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawWin98(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number, params: any) {
  const chaos = params?.speed ?? 1;
  const S = canvas.width / 320;

  ctx.fillStyle = '#008080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let gy = 0; gy < canvas.height; gy += 4 * S) {
    for (let gx = 0; gx < canvas.width; gx += 4 * S) {
      if ((Math.floor(gx / (4 * S)) + Math.floor(gy / (4 * S))) % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(gx, gy, 4 * S, 4 * S);
      }
    }
  }

  const iconLabels = ['My Computer', 'Recycle Bin', 'Network', 'My Docs', 'Notepad', 'Paint'];
  const iconEmojis = ['💻', '🗑️', '🌐', '📄', '📝', '🎨'];
  const cols2 = Math.ceil(6 / 2);
  for (let i = 0; i < 6; i++) {
    const ix = (10 + (i % cols2) * 70) * S;
    const iy = (10 + Math.floor(i / cols2) * 70) * S;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(ix, iy, 32 * S, 32 * S);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = S;
    ctx.strokeRect(ix, iy, 32 * S, 32 * S);
    ctx.font = `${20 * S}px serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(iconEmojis[i], ix + 16 * S, iy + 26 * S);
    ctx.font = `${7 * S}px "Tahoma", sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3 * S;
    ctx.fillText(iconLabels[i], ix + 16 * S, iy + 44 * S);
    ctx.shadowBlur = 0;
  }

  const winDefs = [
    { title: 'SYSTEM ERROR', color: '#000080', content: ['Fatal exception 0E', 'at 0028:C000AF0F', 'Press any key...'], w: 200, h: 130 },
    { title: 'MEMORY LEAK', color: '#800000', content: ['Memory: 0%', 'Stack Overflow', 'Rebooting...'], w: 180, h: 110 },
    { title: 'SIGNAL LOST', color: '#004040', content: ['Connection timed out', 'Retry in 3s...', 'ERR_CONN_0xDEAD'], w: 210, h: 120 },
    { title: 'KERNEL PANIC', color: '#202020', content: ['0xC000021A', 'Win32k.sys', 'DUMP: 0x0000007B'], w: 195, h: 125 },
    { title: 'DLL MISSING', color: '#800080', content: ['msvcrt.dll not found', 'System32 corrupt', 'Call 1-800-HELP'], w: 185, h: 115 },
  ];
  const count = 3 + Math.floor(chaos * 2);
  for (let i = 0; i < Math.min(count, winDefs.length); i++) {
    const def = winDefs[i];
    const cycle = (t * 0.25 * chaos + i * 0.7) % 1;
    const bounce = easeBackOut(Math.min(cycle * 1.3, 1));
    const bx = (15 + i * 35 + Math.sin(t * 0.3 * chaos + i) * 15 * bounce) * S;
    const by = (80 + i * 28 + Math.cos(t * 0.5 * chaos + i) * 12 * bounce) * S;
    const bw = def.w * S, bh = def.h * S;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(bx + 5 * S, by + 5 * S, bw, bh);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.moveTo(bx, by + bh); ctx.lineTo(bx, by); ctx.lineTo(bx + bw, by); ctx.stroke();
    ctx.strokeStyle = '#555555';
    ctx.beginPath(); ctx.moveTo(bx + bw, by); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx, by + bh); ctx.stroke();

    const grad = ctx.createLinearGradient(bx + 3 * S, by + 3 * S, bx + bw - 3 * S, by + 3 * S);
    grad.addColorStop(0, def.color);
    grad.addColorStop(1, '#1a1a6e');
    ctx.fillStyle = grad;
    ctx.fillRect(bx + 3 * S, by + 3 * S, bw - 6 * S, 18 * S);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${9 * S}px "Tahoma", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(def.title, bx + 8 * S, by + 15 * S);

    const btnY = by + 4 * S, btnSz = 14 * S;
    ['✕', '□', '─'].forEach((lbl, bi) => {
      const btnX = bx + bw - (bi + 1) * (btnSz + 2 * S) - 3 * S;
      ctx.fillStyle = '#c0c0c0'; ctx.fillRect(btnX, btnY, btnSz, btnSz);
      ctx.strokeStyle = '#fff'; ctx.strokeRect(btnX, btnY, btnSz, btnSz);
      ctx.fillStyle = '#000'; ctx.font = `${7 * S}px "Tahoma", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(lbl, btnX + btnSz / 2, btnY + 10 * S);
    });

    ctx.fillStyle = '#fff';
    ctx.fillRect(bx + 3 * S, by + 24 * S, bw - 6 * S, bh - 48 * S);
    ctx.fillStyle = '#000'; ctx.font = `${8 * S}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    def.content.forEach((line, li) => {
      ctx.fillText(line, bx + 8 * S, by + 38 * S + li * 14 * S);
    });

    const progW = bw - 20 * S;
    const progFill = ((t * 1.5 * chaos + i) % 10) / 10;
    ctx.fillStyle = '#888'; ctx.fillRect(bx + 10 * S, by + bh - 22 * S, progW, 10 * S);
    ctx.fillStyle = def.color; ctx.fillRect(bx + 10 * S, by + bh - 22 * S, progW * progFill, 10 * S);
    ctx.fillStyle = '#fff'; ctx.font = `${6 * S}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(progFill * 100)}%`, bx + bw / 2, by + bh - 14 * S);
  }

  const glitchCount = Math.floor(chaos * 4);
  for (let g = 0; g < glitchCount; g++) {
    const snapT = Math.floor(t * 8 * chaos) / (8 * chaos);
    const gy2 = ((snapT * 997 * (g + 1)) % 1) * canvas.height;
    const gw = canvas.width * (0.3 + Math.random() * 0.7);
    const gx = (Math.random() * 0.3) * canvas.width;
    ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.1})`;
    ctx.fillRect(gx, gy2, gw, S * 2);
  }

  for (let k = 0; k < 10; k++) {
    const ct = t - k * 0.04;
    const cpx = canvas.width * 0.5 + Math.sin(ct * 1.8 * chaos) * canvas.width * 0.35;
    const cpy = canvas.height * 0.55 + Math.cos(ct * 1.3 * chaos) * canvas.height * 0.25;
    ctx.globalAlpha = (1 - k / 10) * 0.9;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cpx, cpy);
    ctx.lineTo(cpx, cpy + 14 * S);
    ctx.lineTo(cpx + 4 * S, cpy + 10 * S);
    ctx.lineTo(cpx + 6 * S, cpy + 14 * S);
    ctx.lineTo(cpx + 8 * S, cpy + 13 * S);
    ctx.lineTo(cpx + 6 * S, cpy + 9 * S);
    ctx.lineTo(cpx + 10 * S, cpy + 9 * S);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = S * 0.8;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tbH = 22 * S;
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(0, canvas.height - tbH, canvas.width, tbH);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.moveTo(0, canvas.height - tbH); ctx.lineTo(canvas.width, canvas.height - tbH); ctx.stroke();
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(2 * S, canvas.height - tbH + 2 * S, 40 * S, tbH - 4 * S);
  ctx.strokeStyle = '#fff'; ctx.strokeRect(2 * S, canvas.height - tbH + 2 * S, 40 * S, tbH - 4 * S);
  ctx.font = `bold ${9 * S}px "Tahoma", sans-serif`;
  ctx.fillStyle = '#000'; ctx.textAlign = 'left';
  ctx.fillText('Start', 6 * S, canvas.height - tbH + 15 * S);
  const now = new Date();
  const clockStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  ctx.font = `${8 * S}px "Tahoma", sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(clockStr, canvas.width - 6 * S, canvas.height - tbH + 14 * S);
}

function drawWhite(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  // Three.js refs
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const animIdRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());

  // Face data
  const faceMatsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const faceOrigTexRef = useRef<THREE.CanvasTexture[]>([]);
  const faceCanvasRef = useRef<Map<number, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>>(new Map());
  const matrixColsRef = useRef<Map<number, number[]>>(new Map());

  // Video / camera
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoTexRef = useRef<THREE.VideoTexture | null>(null);
  const faceVideoTexturesRef = useRef<THREE.VideoTexture[]>([]);

  // Trailer video
  const trailerVideoRef = useRef<HTMLVideoElement | null>(null);
  const trailerVideoTexturesRef = useRef<THREE.VideoTexture[]>([]);

  // File input (local video/image)
  const fileSourceRef = useRef<{ type: 'image'; el: HTMLImageElement } | { type: 'video'; el: HTMLVideoElement; tex: THREE.VideoTexture } | null>(null);
  const fileCanvasRef = useRef<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null>(null);

  // Grid image
  const gridImgRef = useRef<HTMLImageElement | null>(null);
  const gridImgReadyRef = useRef(false);
  const gridTexturesRef = useRef<THREE.Texture[]>([]);

  // Mapping preview composite canvas
  const mappingPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Cube dims
  const cubeDimsRef = useRef({ w: 3.6, h: 3.6, d: 3.6 });
  const faceMeshesRef = useRef<THREE.Mesh[]>([]);

  // Rig
  const rigGroupRef = useRef<THREE.Group | null>(null);
  const peopleGroupRef = useRef<THREE.Group | null>(null);

  // TransformControls + selection
  const transformControlsRef = useRef<TransformControls | null>(null);
  const tcDraggingRef = useRef(false);
  const activeLightTabRef = useRef(0);
  const selectionRingRef = useRef<THREE.Mesh | null>(null);
  const showLightHelpersRef = useRef(true);

  // Lights
  const lightObjsRef = useRef<LightObjects[]>([]);

  // Refs mirroring state (for animation loop)
  const autoOrbitRef = useRef(false);
  const lightsRef = useRef<LightConfig[]>([]);
  const facesRef = useRef<FaceConfig[]>([]);
  const ledCountRef = useRef(12);
  const cameraScaleRef = useRef(1.0);
  const offFaceOpacityRef = useRef(1.0);
  const previewCanvasesRef = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // ─── React State ───────────────────────────────────────────────────────────
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [autoOrbitSpeed, setAutoOrbitSpeed] = useState(2.0);
  const autoOrbitSpeedRef = useRef(2.0);
  const [cameraList, setCameraList] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamId, setSelectedCamId] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraResolution, setCameraResolution] = useState({ w: 0, h: 0 });
  const [cameraScale, setCameraScale] = useState(1.0);
  const [showMappingUI, setShowMappingUI] = useState(false);
  const [offFaceOpacity, setOffFaceOpacity] = useState(1.0);
  const [ledCountGlobal] = useState(12);
  const [showFacePanel, setShowFacePanel] = useState(false);
  const [showLightPanel, setShowLightPanel] = useState(false);
  const [showCameraSection, setShowCameraSection] = useState(false);
  const [showEstructuraPanel, setShowEstructuraPanel] = useState(false);
  const [showResolucionPanel, setShowResolucionPanel] = useState(false);
  const [cubeDims, setCubeDims] = useState({ w: 3.6, h: 3.6, d: 3.6 });
  const [rigStyle, setRigStyle] = useState<'pipe' | 'truss' | 'columns'>('columns');
  const [showPeople, setShowPeople] = useState(false);
  const [showLightHelpers, setShowLightHelpers] = useState(true);

  const [activeLightTab, setActiveLightTab] = useState(0);
  const [chaserActive, setChaserActive] = useState(false);
  const [chaserBpm, setChaserBpm] = useState(120);
  const [syncScene, setSyncScene] = useState<SceneType>('gradient');
  const [lightsAllOff, setLightsAllOff] = useState(false);
  const [showPreviews, setShowPreviews] = useState(true);
  const lightsAllOffRef = useRef(false);
  const [lightPresets, setLightPresets] = useState<LightPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem('stage_viz_light_presets') || '[]'); } catch { return []; }
  });
  const [presetName, setPresetName] = useState('');
  const chaserActiveRef = useRef(false);
  const chaserBpmRef = useRef(120);

  // Undo/Redo History
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const isUndoRedoing = useRef(false);

  // Floating UI state
  const [mappingPos, setMappingPos] = useState({ x: 200, y: 100 });
  const dragStartRef = useRef({ x: 0, y: 0, winX: 0, winY: 0 });
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const faceDragRef = useRef<{ faceId: number; startMouseX: number; startMouseY: number; startMX: number; startMY: number; mW: number; mH: number } | null>(null);
  const faceResizeRef = useRef<{ faceId: number; handle: string; startMouseX: number; startMouseY: number; startMX: number; startMY: number; startMW: number; startMH: number } | null>(null);

  const [faces, setFaces] = useState<FaceConfig[]>(() => {
    const initScene: SceneType = 'trailer';
    return [
      { id: 0, name: 'izq_frente', scene: initScene, cameraSegment: 0, mapping: { x: 0.25, y: 0, w: 0.25, h: 1 }, params: { text: '*404*', motion: 'elegant', colorMode: 'bw' }, resolution: { w: 1080, h: 1080 } },
      { id: 1, name: 'der_back', scene: initScene, cameraSegment: 1, mapping: { x: 0.75, y: 0, w: 0.25, h: 1 }, params: { density: 1 }, resolution: { w: 1080, h: 1080 } },
      { id: 2, name: 'der_frente', scene: initScene, cameraSegment: 2, mapping: { x: 0.50, y: 0, w: 0.25, h: 1 }, params: { scale: 1 }, resolution: { w: 1080, h: 1080 } },
      { id: 3, name: 'izq_back', scene: initScene, cameraSegment: 3, mapping: { x: 0.00, y: 0, w: 0.25, h: 1 }, params: {}, resolution: { w: 1080, h: 1080 } },
    ];
  });

  const [lights, setLights] = useState<LightConfig[]>([
    { id: 0, name: 'LED A', color: '#ffffff', intensity: 2, strobe: false, strobeHz: 3, type: 'led', x: -1.70, y: 0, z:  1.70, rotX: 0, rotY: 0, rotZ: 0, ledCount: 12 },
    { id: 1, name: 'LED B', color: '#ffffff', intensity: 2, strobe: false, strobeHz: 3, type: 'led', x:  1.70, y: 0, z:  1.70, rotX: 0, rotY: 0, rotZ: 0, ledCount: 12 },
    { id: 2, name: 'LED C', color: '#ffffff', intensity: 2, strobe: false, strobeHz: 3, type: 'led', x:  1.70, y: 0, z: -1.70, rotX: 0, rotY: 0, rotZ: 0, ledCount: 12 },
    { id: 3, name: 'LED D', color: '#ffffff', intensity: 2, strobe: false, strobeHz: 3, type: 'led', x: -1.70, y: 0, z: -1.70, rotX: 0, rotY: 0, rotZ: 0, ledCount: 12 },
  ]);

  // Keep refs in sync
  useEffect(() => { autoOrbitRef.current = autoOrbit; }, [autoOrbit]);
  useEffect(() => { autoOrbitSpeedRef.current = autoOrbitSpeed; }, [autoOrbitSpeed]);
  useEffect(() => { lightsRef.current = lights; }, [lights]);

  // ─── Trailer Video Init ──────────────────────────────────────────────────
  useEffect(() => {
    const v = document.createElement('video');
    v.src = '/Inside_the_box_v3.mp4';
    v.crossOrigin = 'anonymous';
    v.loop = true;
    v.muted = true;
    v.playsInline = true;

    const playTrailer = () => {
      v.play().catch(() => { });
    };
    playTrailer();
    window.addEventListener('pointerdown', playTrailer, { once: true });
    window.addEventListener('touchstart', playTrailer, { once: true });

    trailerVideoRef.current = v;

    // Create 4 video textures for the 4 faces so mapping offsets are independent
    trailerVideoTexturesRef.current = [0, 1, 2, 3].map(() => {
      const tex = new THREE.VideoTexture(v);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    });

    return () => {
      window.removeEventListener('pointerdown', playTrailer);
      window.removeEventListener('touchstart', playTrailer);
      v.pause();
      v.src = '';
      v.load();
      trailerVideoTexturesRef.current.forEach(t => t.dispose());
    };
  }, []);

  // Load GRID_V2 image
  useEffect(() => {
    const img = new Image();
    img.src = '/GRID_V2.jpg';
    img.onload = () => { gridImgReadyRef.current = true; };
    gridImgRef.current = img;

    new THREE.TextureLoader().load('/GRID_V2.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      gridTexturesRef.current = [0, 1, 2, 3].map(() => {
        const t = tex.clone();
        t.needsUpdate = true;
        return t;
      });
    });
  }, []);

  useEffect(() => { facesRef.current = faces; }, [faces]);
  useEffect(() => { ledCountRef.current = ledCountGlobal; }, [ledCountGlobal]);
  useEffect(() => { cameraScaleRef.current = cameraScale; }, [cameraScale]);
  useEffect(() => { chaserActiveRef.current = chaserActive; }, [chaserActive]);
  useEffect(() => { chaserBpmRef.current = chaserBpm; }, [chaserBpm]);
  useEffect(() => { cubeDimsRef.current = cubeDims; }, [cubeDims]);
  useEffect(() => { offFaceOpacityRef.current = offFaceOpacity; }, [offFaceOpacity]);
  useEffect(() => { lightsAllOffRef.current = lightsAllOff; }, [lightsAllOff]);
  useEffect(() => { activeLightTabRef.current = activeLightTab; }, [activeLightTab]);
  useEffect(() => { showLightHelpersRef.current = showLightHelpers; }, [showLightHelpers]);

  // ─── Preview thumbnails + mapping composite rAF loop ─────────────────────
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      // Face thumbnail previews
      previewCanvasesRef.current.forEach((previewCanvas, faceId) => {
        const src = faceCanvasRef.current.get(faceId);
        if (!src) return;
        const ctx = previewCanvas.getContext('2d');
        if (ctx) ctx.drawImage(src.canvas, 0, 0, previewCanvas.width, previewCanvas.height);
      });

      // Mapping preview — composite all face sources at their mapping positions
      const mp = mappingPreviewCanvasRef.current;
      if (mp) {
        const ctx = mp.getContext('2d');
        if (ctx) {
          const cw = mp.width, ch = mp.height;
          ctx.fillStyle = C.bgInput;
          ctx.fillRect(0, 0, cw, ch);
          facesRef.current.forEach((face, i) => {
            const { x, y, w, h } = face.mapping;
            const dx = x * cw, dy = y * ch, dw = w * cw, dh = h * ch;
            try {
              const drawSlice = (el: HTMLVideoElement | HTMLImageElement, isVid: boolean) => {
                const nw = isVid ? (el as HTMLVideoElement).videoWidth : (el as HTMLImageElement).naturalWidth || (el as HTMLImageElement).width;
                const nh = isVid ? (el as HTMLVideoElement).videoHeight : (el as HTMLImageElement).naturalHeight || (el as HTMLImageElement).height;
                if (!nw || !nh) return;
                ctx.drawImage(el, x * nw, y * nh, w * nw, h * nh, dx, dy, dw, dh);
              };

              if (face.scene === 'camera' && videoRef.current?.srcObject) {
                drawSlice(videoRef.current, true);
              } else if (face.scene === 'trailer' && trailerVideoRef.current && (trailerVideoRef.current.readyState ?? 0) >= 2) {
                drawSlice(trailerVideoRef.current, true);
              } else if (face.scene === 'fileinput' && fileSourceRef.current) {
                drawSlice(fileSourceRef.current.el, fileSourceRef.current.type === 'video');
              } else if (face.scene === 'grid_img' && gridImgReadyRef.current && gridImgRef.current) {
                drawSlice(gridImgRef.current, false);
              } else {
                const src = faceCanvasRef.current.get(i);
                if (src) ctx.drawImage(src.canvas, dx, dy, dw, dh);
              }
            } catch { /* source not ready yet */ }
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Record history (debounced for sliders)
  useEffect(() => {
    if (isUndoRedoing.current) return;
    const timer = setTimeout(() => {
      const snap = JSON.stringify({ faces, lights, offFaceOpacity });
      setHistory(prev => {
        const newHist = prev.slice(0, historyIdx + 1);
        if (newHist[newHist.length - 1] === snap) return prev;
        const result = [...newHist, snap];
        if (result.length > 50) result.shift();
        return result;
      });
      setHistoryIdx(prev => Math.min(prev + 1, 49));
    }, 400);
    return () => clearTimeout(timer);
  }, [faces, lights, offFaceOpacity]);

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    isUndoRedoing.current = true;
    const prev = JSON.parse(history[historyIdx - 1]);
    setFaces(prev.faces);
    setLights(prev.lights);
    setOffFaceOpacity(prev.offFaceOpacity);
    setHistoryIdx(h => h - 1);
    setTimeout(() => { isUndoRedoing.current = false; }, 50);
  }, [history, historyIdx]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    isUndoRedoing.current = true;
    const next = JSON.parse(history[historyIdx + 1]);
    setFaces(next.faces);
    setLights(next.lights);
    setOffFaceOpacity(next.offFaceOpacity);
    setHistoryIdx(h => h + 1);
    setTimeout(() => { isUndoRedoing.current = false; }, 50);
  }, [history, historyIdx]);

  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) redo(); else undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [undo, redo]);

  // ─── Three.js Initialization ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const W = container.clientWidth || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;

    // Scene / Camera / Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    sceneRef.current = scene;

    const cam = new THREE.PerspectiveCamera(60, W / H, 0.01, 5000);
    cam.position.set(5, 4, 5);
    cam.lookAt(0, 0, 0);
    cameraRef.current = cam;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const cvs = renderer.domElement;
    Object.assign(cvs.style, { display: 'block', position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', touchAction: 'none' });
    container.appendChild(cvs);
    rendererRef.current = renderer;

    const controls = new OrbitControls(cam, cvs);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.01;
    controls.maxDistance = 200;
    controls.autoRotateSpeed = 0.6;
    orbitRef.current = controls;

    // Grid floor (fixed size)
    const grid = new THREE.GridHelper(14, 28, 0x2a2a2a, 0x1a1a1a);
    grid.position.y = -HALF - 0.12 - 0.02;
    scene.add(grid);

    // ── 4 Lateral Faces ─────────────────────────────────────────────────────
    const faceDefs = [
      { pos: new THREE.Vector3(0, 0, HALF), rot: [0, 0, 0] as [number, number, number] },       // 2_izq (Front)
      { pos: new THREE.Vector3(0, 0, -HALF), rot: [0, Math.PI, 0] as [number, number, number] }, // 3_der (Back slot)
      { pos: new THREE.Vector3(HALF, 0, 0), rot: [0, Math.PI / 2, 0] as [number, number, number] }, // 4_der_back (Right slot)
      { pos: new THREE.Vector3(-HALF, 0, 0), rot: [0, -Math.PI / 2, 0] as [number, number, number] }, // 1_izq_back (Left slot)
    ];

    const faceGeo = new THREE.PlaneGeometry(BASE_CUBE_SIZE, BASE_CUBE_SIZE);
    faceMatsRef.current = [];
    faceOrigTexRef.current = [];
    faceCanvasRef.current.clear();
    faceMeshesRef.current = [];

    const initialFaces = facesRef.current;
    faceDefs.forEach((def, i) => {
      const initRes = initialFaces[i]?.resolution ?? { w: 1080, h: 1080 };
      const canvas = document.createElement('canvas');
      canvas.width = initRes.w; canvas.height = initRes.h;
      const ctx = canvas.getContext('2d')!;

      // Matrix columns init
      const cols: number[] = [];
      for (let c = 0; c < 24; c++) cols[c] = Math.random() * initRes.h;
      matrixColsRef.current.set(i, cols);

      faceCanvasRef.current.set(i, { canvas, ctx });

      const tex = new THREE.CanvasTexture(canvas);
      faceOrigTexRef.current.push(tex);

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: new THREE.Color(0.5, 0, 0),
        emissiveIntensity: 1.0,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0,
      });
      faceMatsRef.current.push(mat);

      const mesh = new THREE.Mesh(faceGeo, mat);
      mesh.position.copy(def.pos);
      mesh.rotation.set(...def.rot);
      mesh.userData.faceIndex = i;
      scene.add(mesh);
      faceMeshesRef.current.push(mesh);
    });

    // ── Interior Lights ──────────────────────────────────────────────────────
    const helperGeo = new THREE.SphereGeometry(0.09, 12, 12);
    lightObjsRef.current = [];

    lightsRef.current.forEach((cfg, idx) => {
      const hMat = new THREE.MeshBasicMaterial({ color: cfg.color, toneMapped: false });
      const hMesh = new THREE.Mesh(helperGeo, hMat);
      hMesh.position.set(cfg.x, cfg.y, cfg.z);
      scene.add(hMesh);

      if (cfg.type === 'spot') {
        const spot = new THREE.SpotLight(cfg.color, cfg.intensity);
        spot.position.set(cfg.x, cfg.y, cfg.z);
        spot.angle = Math.PI / 7;
        spot.penumbra = 0.25;
        spot.distance = 10;
        spot.castShadow = true;
        scene.add(spot);
        scene.add(spot.target);
        hMesh.visible = true;
        const spotHelper = new THREE.SpotLightHelper(spot);
        scene.add(spotHelper);
        lightObjsRef.current.push({ threeLight: spot, helperMesh: hMesh, helperMat: hMat, spotHelper });
      } else if (cfg.type === 'led') {
        hMesh.visible = false;
        const ledGroup = createLedStripGroup(cfg, cubeDimsRef.current);
        scene.add(ledGroup);
        const pt = new THREE.PointLight(cfg.color, cfg.intensity * 0.5, 10);
        pt.position.set(cfg.x, cfg.y, cfg.z);
        scene.add(pt);
        lightObjsRef.current.push({ threeLight: pt, helperMesh: hMesh, helperMat: hMat, ledGroup });
      } else {
        const light = new THREE.PointLight(new THREE.Color(cfg.color).getHex(), cfg.intensity, 8);
        light.position.set(cfg.x, cfg.y, cfg.z);
        light.castShadow = true;
        scene.add(light);
        hMesh.visible = true;
        lightObjsRef.current.push({ threeLight: light, helperMesh: hMesh, helperMat: hMat });
      }
      void idx;
    });

    // Ambient + hemisphere from above for better environment visibility
    scene.add(new THREE.AmbientLight(0x303040, 1.8));
    const hemi = new THREE.HemisphereLight(0x8899bb, 0x223344, 1.0);
    hemi.position.set(0, 20, 0);
    scene.add(hemi);

    // ── Animation Loop ───────────────────────────────────────────────────────
    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate);
      const time = clockRef.current.getElapsedTime();
      const ctrl = orbitRef.current!;
      ctrl.autoRotate = autoOrbitRef.current;
      ctrl.autoRotateSpeed = autoOrbitSpeedRef.current; // Direct usage or via ref
      ctrl.update();

      // Scale face meshes to cubeDims
      const cd = cubeDimsRef.current;
      faceMeshesRef.current.forEach((mesh, i) => {
        if (i === 0) { // 2_izq (Front, z=+D/2)
          mesh.scale.set(cd.w / BASE_CUBE_SIZE, cd.h / BASE_CUBE_SIZE, 1);
          mesh.position.set(0, 0, cd.d / 2);
        } else if (i === 1) { // 3_der (Back, z=-D/2)
          mesh.scale.set(cd.w / BASE_CUBE_SIZE, cd.h / BASE_CUBE_SIZE, 1);
          mesh.position.set(0, 0, -cd.d / 2);
        } else if (i === 2) { // 4_der_back (Right, x=+W/2)
          mesh.scale.set(cd.d / BASE_CUBE_SIZE, cd.h / BASE_CUBE_SIZE, 1);
          mesh.position.set(cd.w / 2, 0, 0);
        } else if (i === 3) { // 1_izq_back (Left, x=-W/2)
          mesh.scale.set(cd.d / BASE_CUBE_SIZE, cd.h / BASE_CUBE_SIZE, 1);
          mesh.position.set(-cd.w / 2, 0, 0);
        }
      });

      // Face centers in world space (matches cubeDims)
      const SPOT_ANGLE = Math.PI / 7;
      const COS_SPOT = Math.cos(SPOT_ANGLE);
      const FC: [number, number, number][] = [
        [0, 0, cd.d / 2], [0, 0, -cd.d / 2], [cd.w / 2, 0, 0], [-cd.w / 2, 0, 0],
      ];

      // Update fileinput image canvas if image source
      if (fileSourceRef.current?.type === 'image' && fileCanvasRef.current) {
        const { canvas: fc, ctx: fctx } = fileCanvasRef.current;
        fctx.drawImage(fileSourceRef.current.el, 0, 0, fc.width, fc.height);
      }

      // Update face textures
      facesRef.current.forEach((face, i) => {
        const fd = faceCanvasRef.current.get(i);
        const mat = faceMatsRef.current[i];
        if (!fd || !mat) return;

        // --- Software lighting: realistic interior-light-on-projection-screen ---
        const fc = FC[i] ?? [0, 0, 0];
        let lr = 0, lg = 0, lb = 0;

        if (!lightsAllOffRef.current) {
          lightsRef.current.forEach(lCfg => {
            const hz = lCfg.strobeHz ?? 3;
            const strobeOn = !lCfg.strobe || Math.sin(time * hz * Math.PI * 2) > 0;
            if (!strobeOn) return;

            const hex = parseInt(lCfg.color.replace('#', ''), 16);
            const cr = ((hex >> 16) & 0xff) / 255;
            const cg = ((hex >> 8) & 0xff) / 255;
            const cb = (hex & 0xff) / 255;

            const vx = fc[0] - lCfg.x, vy = fc[1] - lCfg.y, vz = fc[2] - lCfg.z;
            const dist = Math.sqrt(vx * vx + vy * vy + vz * vz) || 0.001;
            const vnx = vx / dist, vny = vy / dist, vnz = vz / dist;

            // Quadratic attenuation – lights inside a ≈3.6m cube
            let s = (lCfg.intensity * 0.55) / (0.3 + dist * dist * 0.7);

            if (lCfg.type === 'spot') {
              const rx = (lCfg.rotX * Math.PI) / 180;
              const rz = ((lCfg.rotZ ?? 0) * Math.PI) / 180;
              const dx = Math.sin(rz) * Math.cos(rx);
              const dy = -Math.cos(rx);
              const dz = Math.cos(rz) * Math.cos(rx);
              const dot = dx * vnx + dy * vny + dz * vnz;
              if (dot < COS_SPOT) return;
              s *= (dot - COS_SPOT) / (1 - COS_SPOT);
            }

            lr += cr * s; lg += cg * s; lb += cb * s;
          });
        }

        // Backlit-fabric effect: interior LEDs bleed through the projection screen.
        // Increase emissiveIntensity so the face is brighter from BOTH sides,
        // and tint emissive toward the light color.
        const lightPow = Math.sqrt(lr * lr + lg * lg + lb * lb);
        let er = 1, eg = 1, eb = 1;
        if (lightPow > 0.02) {
          const nr = lr / lightPow, ng = lg / lightPow, nb = lb / lightPow;
          // Tint the face toward the light hue
          const blend = Math.min(0.92, lightPow * 0.45);
          er = 1 - blend + nr * blend;
          eg = 1 - blend + ng * blend;
          eb = 1 - blend + nb * blend;
        }
        mat.emissive.setRGB(er, eg, eb);
        // Boost emissiveIntensity proportionally to light power — visible from exterior too
        const bleedBoost = Math.min(2.0, lightPow * 0.55);
        mat.emissiveIntensity = offFaceOpacityRef.current * (1 + bleedBoost);

        // Skip canvas redraw for active camera (uses VideoTexture directly)
        if (face.scene === 'camera' && cameraActive) return;
        // Skip canvas redraw for fileinput (uses VideoTexture or CanvasTexture directly handled in useEffect)
        if (face.scene === 'fileinput') return;
        if (face.scene === 'trailer') return;
        if (face.scene === 'grid_img') return;

        const { canvas, ctx } = fd;
        switch (face.scene) {
          case 'gradient': drawGradient(ctx, canvas, time, face.params); break;
          case 'win98': drawWin98(ctx, canvas, time, face.params); break;
          case 'white': drawWhite(ctx, canvas); break;
          case 'camera': {
            ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawGrid(ctx, canvas, 0.05);
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.font = '8px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText('SIGNAL_LOST // AWAITING STREAM', canvas.width / 2, canvas.height / 2);
            break;
          }
        }

        const tex = mat.map as THREE.CanvasTexture | null;
        if (tex) tex.needsUpdate = true;
      });

      // Update lights
      const tcActive = tcDraggingRef.current;
      const tcIdx = activeLightTabRef.current;
      lightsRef.current.forEach((cfg, i) => {
        const lo = lightObjsRef.current[i];
        if (!lo) return;
        const { threeLight, helperMesh, helperMat } = lo;

        const isDraggingThis = tcActive && i === tcIdx;
        if (!isDraggingThis) {
          threeLight.position.set(cfg.x, cfg.y, cfg.z);
          helperMesh.position.set(cfg.x, cfg.y, cfg.z);
        } else {
          // TC is controlling helperMesh — sync threeLight to follow
          threeLight.position.copy(helperMesh.position);
        }
        threeLight.color.set(cfg.color);

        // Visibility: helper sphere hidden for LED; toggled by showLightHelpers
        const isLed = cfg.type === 'led';
        helperMesh.visible = !isLed && showLightHelpersRef.current;

        // Global blackout override
        if (lightsAllOffRef.current) {
          threeLight.intensity = 0;
        } else if (chaserActiveRef.current) {
          const beatDuration = 60 / chaserBpmRef.current;
          const activeIdx = Math.floor(time / beatDuration) % lightsRef.current.length;
          threeLight.intensity = i === activeIdx ? cfg.intensity : 0;
        } else {
          const hz = cfg.strobeHz ?? 3;
          const activeIntensity = cfg.strobe
            ? (Math.sin(time * hz * Math.PI * 2) > 0 ? cfg.intensity * 2 : 0)
            : cfg.intensity;
          threeLight.intensity = activeIntensity;
        }
        const activeIntensity = threeLight.intensity;

        // Helper brightness scales with intensity (max intensity assumed ~4)
        const brightFactor = Math.min(1, activeIntensity / 4);
        const hc = new THREE.Color(cfg.color);
        helperMat.color.setRGB(hc.r * brightFactor, hc.g * brightFactor, hc.b * brightFactor);

        // Spotlight direction + cone helper
        if (threeLight instanceof THREE.SpotLight) {
          const rx = (cfg.rotX * Math.PI) / 180;
          const rz = ((cfg.rotZ ?? 0) * Math.PI) / 180;
          const dx = Math.sin(rz) * Math.cos(rx);
          const dy = Math.cos(rx) * -1;
          const dz = Math.cos(rz) * Math.cos(rx);
          threeLight.target.position.set(cfg.x + dx * 3, cfg.y + dy * 3, cfg.z + dz * 3);
          threeLight.target.updateMatrixWorld();

          // Ray-AABB: find distance to nearest cube wall
          const dir = [dx, dy, dz];
          const pos = [cfg.x, cfg.y, cfg.z];
          let wallDist = 20;
          for (let a = 0; a < 3; a++) {
            if (Math.abs(dir[a]) > 0.0001) {
              for (const sign of [-1, 1]) {
                const t = (sign * HALF - pos[a]) / dir[a];
                if (t > 0.01) wallDist = Math.min(wallDist, t);
              }
            }
          }
          threeLight.distance = wallDist + 0.1;

          if (lo.spotHelper) {
            lo.spotHelper.visible = showLightHelpersRef.current;
            lo.spotHelper.color = new THREE.Color(cfg.color);
            lo.spotHelper.update();
          }
        }

        // LED group transform + strobe
        if (lo.ledGroup) {
          const lp = isDraggingThis ? helperMesh.position : new THREE.Vector3(cfg.x, cfg.y, cfg.z);
          lo.ledGroup.position.copy(lp);
          lo.ledGroup.rotation.set((cfg.rotX * Math.PI) / 180, 0, ((cfg.rotZ ?? 0) * Math.PI) / 180);
          lo.ledGroup.visible = showLightHelpersRef.current;
          const lInt = cfg.strobe ? (Math.sin(time * 18) > 0 ? cfg.intensity * 0.4 : 0) : cfg.intensity * 0.25;
          lo.ledGroup.children.forEach(child => {
            if (child instanceof THREE.PointLight) child.intensity = lInt;
            if (child instanceof THREE.Mesh) {
              const m = child.material as THREE.MeshBasicMaterial;
              if (m.toneMapped === false) m.color.set(cfg.color);
            }
          });
        }
      });

      // Selection ring follows active light
      const selRing = selectionRingRef.current;
      if (selRing) {
        const activeLo = lightObjsRef.current[activeLightTabRef.current];
        if (activeLo) {
          selRing.position.copy(activeLo.helperMesh.position);
          selRing.scale.setScalar(1 + Math.sin(time * 5) * 0.07);
          selRing.visible = showLightHelpersRef.current;
        } else {
          selRing.visible = false;
        }
      }

      renderer.render(scene, cam);
    };
    animate();

    // ── TransformControls for light positioning ──────────────────────────────
    const tc = new TransformControls(cam, cvs);
    tc.setMode('translate');
    tc.setSize(0.75);
    scene.add(tc as unknown as THREE.Object3D);
    transformControlsRef.current = tc;

    tc.addEventListener('dragging-changed', (event: any) => {
      controls.enabled = !event.value;
      tcDraggingRef.current = event.value;
      if (!event.value) {
        // Drag ended — persist final position to React state
        const idx = activeLightTabRef.current;
        const lo = lightObjsRef.current[idx];
        if (lo) {
          const p = lo.helperMesh.position;
          setLights(prev => prev.map((l, i) => i === idx
            ? { ...l, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) }
            : l
          ));
        }
      }
    });

    // Attach TC to first light on init
    if (lightObjsRef.current[0]) tc.attach(lightObjsRef.current[0].helperMesh);

    // Selection ring (shows active light)
    const selRing = new THREE.Mesh(
      new THREE.SphereGeometry(0.20, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0x4a8cff, wireframe: true, transparent: true, opacity: 0.7 })
    );
    scene.add(selRing);
    selectionRingRef.current = selRing;

    // Click on helper sphere to select light
    const clickRaycaster = new THREE.Raycaster();
    const onCanvasPointerUp = (e: PointerEvent) => {
      if (tcDraggingRef.current) return;
      const rect = cvs.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      clickRaycaster.setFromCamera(ndc, cam);
      const helpers = lightObjsRef.current.map(lo => lo.helperMesh);
      const hits = clickRaycaster.intersectObjects(helpers);
      if (hits.length) {
        const hitIdx = lightObjsRef.current.findIndex(lo => lo.helperMesh === hits[0].object);
        if (hitIdx >= 0) setActiveLightTab(hitIdx);
      }
    };
    cvs.addEventListener('pointerup', onCanvasPointerUp);

    // Resize
    const onResize = () => {
      const cw = container.clientWidth || window.innerWidth;
      const ch = container.clientHeight || window.innerHeight;
      cam.aspect = cw / ch;
      cam.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cvs.removeEventListener('pointerup', onCanvasPointerUp);
      tc.dispose();
      cancelAnimationFrame(animIdRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(cvs)) container.removeChild(cvs);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Rig rebuild when cubeDims or rigStyle changes ────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (rigGroupRef.current) {
      scene.remove(rigGroupRef.current);
      rigGroupRef.current = null;
    }
    const group = new THREE.Group();
    const cd = cubeDims;
    const HW = (cd.w / 2) - 0.15, HH = (cd.h / 2) - 0.15, HD = (cd.d / 2) - 0.15;
    const FY = -HH - 0.12;

    if (rigStyle === 'pipe') {
      buildPipeRig(group, HW, HH, HD, FY);
    } else if (rigStyle === 'columns') {
      buildColumnsRig(group, HW, HH, HD, FY);
    } else {
      buildTrussRig(group, HW, HH, HD, FY);
    }
    scene.add(group);
    rigGroupRef.current = group;
  }, [cubeDims, rigStyle]); // eslint-disable-line

  // ─── People group rebuild ─────────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (peopleGroupRef.current) {
      scene.remove(peopleGroupRef.current);
      peopleGroupRef.current = null;
    }
    if (!showPeople) return;
    const group = new THREE.Group();
    const cd = cubeDims;
    const HW = (cd.w / 2) - 0.15, HH = (cd.h / 2) - 0.15, HD = (cd.d / 2) - 0.15;
    buildAllHumanFigures(group, HW, HH, HD);
    scene.add(group);
    peopleGroupRef.current = group;
  }, [cubeDims, showPeople]); // eslint-disable-line

  // ─── Attach TransformControls to selected light ───────────────────────────
  useEffect(() => {
    const tc = transformControlsRef.current;
    if (!tc) return;
    const lo = lightObjsRef.current[activeLightTab];
    if (lo) tc.attach(lo.helperMesh);
  }, [activeLightTab]);

  // ─── Update face materials when scene/camera changes ─────────────────────
  useEffect(() => {
    faces.forEach((face, i) => {
      const mat = faceMatsRef.current[i];
      if (!mat) return;

      if (face.scene === 'camera' && faceVideoTexturesRef.current[i]) {
        const tex = faceVideoTexturesRef.current[i];

        // --- 1:1 DIRECT MAPPING (Zoom is now UI-only for precision) ---
        const repX = face.mapping.w;
        const repY = face.mapping.h;
        const offX = face.mapping.x;
        const offY = 1 - repY - face.mapping.y;

        tex.repeat.set(repX, repY);
        tex.offset.set(offX, offY);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;

        if (mat.map !== tex) { mat.map = tex; mat.emissiveMap = tex; }
        mat.opacity = offFaceOpacity;
        mat.needsUpdate = true;
      } else if (face.scene === 'trailer' && trailerVideoTexturesRef.current[i]) {
        const tex = trailerVideoTexturesRef.current[i];

        const repX = face.mapping.w;
        const repY = face.mapping.h;
        const offX = face.mapping.x;
        const offY = 1 - repY - face.mapping.y;

        tex.repeat.set(repX, repY);
        tex.offset.set(offX, offY);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;

        if (mat.map !== tex) { mat.map = tex; mat.emissiveMap = tex; }
        mat.opacity = offFaceOpacity;
        mat.needsUpdate = true;
      } else if (face.scene === 'grid_img' && gridTexturesRef.current[i]) {
        const tex = gridTexturesRef.current[i];

        const repX = face.mapping.w;
        const repY = face.mapping.h;
        const offX = face.mapping.x;
        const offY = 1 - repY - face.mapping.y;

        tex.repeat.set(repX, repY);
        tex.offset.set(offX, offY);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;

        if (mat.map !== tex) { mat.map = tex; mat.emissiveMap = tex; }
        mat.opacity = offFaceOpacity;
        mat.needsUpdate = true;
      } else if (face.scene === 'fileinput' && fileSourceRef.current) {
        if (fileSourceRef.current.type === 'video') {
          const tex = fileSourceRef.current.tex;
          if (mat.map !== tex) { mat.map = tex; mat.emissiveMap = tex; }
        } else if (fileSourceRef.current.type === 'image' && fileCanvasRef.current) {
          const origTex = faceOrigTexRef.current[i] || null;
          mat.map = origTex;
          mat.emissiveMap = origTex;
        }
        mat.opacity = offFaceOpacity;
        mat.needsUpdate = true;
      } else {
        const origTex = faceOrigTexRef.current[i] || null;
        mat.map = origTex;
        mat.emissiveMap = origTex;
        mat.opacity = offFaceOpacity;
      }
      mat.needsUpdate = true;
    });
  }, [faces, cameraActive, offFaceOpacity]);

  // ─── Resize face canvas when resolution changes ────────────────────────────
  useEffect(() => {
    faces.forEach((face, i) => {
      const fd = faceCanvasRef.current.get(i);
      if (!fd) return;
      const { canvas } = fd;
      if (canvas.width !== face.resolution.w || canvas.height !== face.resolution.h) {
        canvas.width = face.resolution.w;
        canvas.height = face.resolution.h;
        // Re-init matrix columns for new size
        const cols: number[] = [];
        for (let c = 0; c < Math.ceil(face.resolution.w / 12); c++) cols[c] = Math.random() * face.resolution.h;
        matrixColsRef.current.set(i, cols);
        // Mark texture as needing update
        const tex = faceOrigTexRef.current[i];
        if (tex) tex.needsUpdate = true;
        const mat = faceMatsRef.current[i];
        if (mat) mat.needsUpdate = true;
      }
    });
  }, [faces]);

  // ─── Camera enumeration ───────────────────────────────────────────────────
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devs => {
      const vids = devs.filter(d => d.kind === 'videoinput');
      setCameraList(vids);
      if (vids.length > 0) setSelectedCamId(vids[0].deviceId);
    }).catch(() => { });
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 4320 }, height: { ideal: 1080 },
          ...(selectedCamId ? { deviceId: { exact: selectedCamId } } : {})
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;

      video.onloadedmetadata = () => {
        video.play();
        setCameraResolution({ w: video.videoWidth, h: video.videoHeight });

        // Create 4 distinct textures for independent mapping
        faceVideoTexturesRef.current = [
          new THREE.VideoTexture(video),
          new THREE.VideoTexture(video),
          new THREE.VideoTexture(video),
          new THREE.VideoTexture(video)
        ];

        setCameraActive(true);
      };
      videoRef.current = video;
    } catch (e) {
      alert('No se pudo acceder a la cámara: ' + (e as Error).message);
    }
  }, [selectedCamId]);

  const stopCamera = useCallback(() => {
    if (videoRef.current) {
      (videoRef.current.srcObject as MediaStream)?.getTracks().forEach(t => t.stop());
      videoRef.current = null;
    }
    videoTexRef.current = null;
    setCameraActive(false);
    // Restore canvas textures for camera faces
    setFaces(prev => prev.map(f => f.scene === 'camera' ? { ...f, scene: 'white' } : f));
  }, []);

  const handleFileInput = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const vid = document.createElement('video');
      vid.src = url;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.play().catch(() => { });
      const tex = new THREE.VideoTexture(vid);
      fileSourceRef.current = { type: 'video', el: vid, tex };
    } else if (file.type.startsWith('image/')) {
      // Shared offscreen canvas for image drawing
      if (!fileCanvasRef.current) {
        const c = document.createElement('canvas');
        c.width = 512; c.height = 512;
        fileCanvasRef.current = { canvas: c, ctx: c.getContext('2d')! };
      }
      const img = new Image();
      img.onload = () => {
        const fc = fileCanvasRef.current!;
        fc.ctx.drawImage(img, 0, 0, fc.canvas.width, fc.canvas.height);
        // Assign this canvas as texture to fileinput faces
        faces.forEach((face, i) => {
          if (face.scene !== 'fileinput') return;
          const mat = faceMatsRef.current[i];
          if (!mat) return;
          const tex = new THREE.CanvasTexture(fc.canvas);
          faceOrigTexRef.current[i] = tex;
          mat.map = tex;
          mat.emissiveMap = tex;
          mat.needsUpdate = true;
        });
      };
      img.src = url;
      fileSourceRef.current = { type: 'image', el: img };
    }
  }, [faces]);

  // ─── Light type switching ─────────────────────────────────────────────────
  const switchLightType = useCallback((index: number, type: LightType) => {
    const scene3 = sceneRef.current;
    if (!scene3) return;
    const lo = lightObjsRef.current[index];
    if (!lo) return;
    const cfg = lightsRef.current[index];
    const nLed = ledCountRef.current;

    // Remove old
    scene3.remove(lo.threeLight);
    if (lo.ledGroup) scene3.remove(lo.ledGroup);
    if (lo.spotHelper) { scene3.remove(lo.spotHelper); lo.spotHelper.dispose(); }

    let newLight: THREE.PointLight | THREE.SpotLight;
    let newLedGroup: THREE.Group | undefined;
    let newSpotHelper: THREE.SpotLightHelper | undefined;

    if (type === 'spot') {
      const spot = new THREE.SpotLight(cfg.color, cfg.intensity);
      spot.position.set(cfg.x, cfg.y, cfg.z);
      spot.angle = Math.PI / 7;
      spot.penumbra = 0.25;
      spot.distance = 10;
      spot.castShadow = true;
      scene3.add(spot);
      scene3.add(spot.target);
      newLight = spot;
      lo.helperMesh.visible = true;
      newSpotHelper = new THREE.SpotLightHelper(spot);
      scene3.add(newSpotHelper);

    } else if (type === 'led') {
      const cd = cubeDimsRef.current;
      const HW = cd.w / 2, HD = cd.d / 2;
      const th = 0.10;
      const edgePositions: [number, number, number][] = [
        [-HW + th, 0, HD - th],
        [HW - th, 0, HD - th],
        [HW - th, 0, -HD + th],
        [-HW + th, 0, -HD + th],
      ];
      const [ex, , ez] = edgePositions[index % 4];
      const ledCfg = { ...cfg, x: ex, y: 0, z: ez };
      const group = createLedStripGroup(ledCfg, cd, nLed);
      scene3.add(group);
      newLedGroup = group;
      lo.helperMesh.visible = false;

      const pt = new THREE.PointLight(cfg.color, cfg.intensity * 0.5, 10);
      pt.position.set(ex, 0, ez);
      scene3.add(pt);
      newLight = pt;

      setLights(prev => prev.map((l, li) => li === index ? { ...l, type, x: ex, y: 0, z: ez } : l));
      lightObjsRef.current[index] = { threeLight: newLight, helperMesh: lo.helperMesh, helperMat: lo.helperMat, ledGroup: newLedGroup };
      return;

    } else {
      const pt = new THREE.PointLight(cfg.color, cfg.intensity, 8);
      pt.position.set(cfg.x, cfg.y, cfg.z);
      pt.castShadow = true;
      scene3.add(pt);
      newLight = pt;
      lo.helperMesh.visible = true;
    }

    lightObjsRef.current[index] = { threeLight: newLight, helperMesh: lo.helperMesh, helperMat: lo.helperMat, ledGroup: newLedGroup, spotHelper: newSpotHelper };
    setLights(prev => prev.map((l, i) => i === index ? { ...l, type } : l));
  }, []);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const resetCamera = () => {
    cameraRef.current?.position.set(5, 4, 5);
    cameraRef.current?.lookAt(0, 0, 0);
    orbitRef.current?.target.set(0, 0, 0);
    orbitRef.current?.update();
  };

  const updateLight = (i: number, patch: Partial<LightConfig>) =>
    setLights(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const savePreset = () => {
    const name = presetName.trim() || `Preset ${lightPresets.length + 1}`;
    const updated = [...lightPresets.filter(p => p.name !== name), { name, lights: JSON.parse(JSON.stringify(lights)) }];
    setLightPresets(updated);
    localStorage.setItem('stage_viz_light_presets', JSON.stringify(updated));
    setPresetName('');
  };

  const loadPreset = (preset: LightPreset) => {
    preset.lights.forEach((newL, idx) => {
      if (lights[idx] && lights[idx].type !== newL.type) switchLightType(idx, newL.type);
    });
    setLights(preset.lights.map((l, idx) => ({ ...l, id: idx })));
  };

  const deletePreset = (name: string) => {
    const updated = lightPresets.filter(p => p.name !== name);
    setLightPresets(updated);
    localStorage.setItem('stage_viz_light_presets', JSON.stringify(updated));
  };

  const updateFace = (id: number, patch: Partial<FaceConfig>) =>
    setFaces(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));

  // --- PERSISTENCE: Load/Save Effects ---
  useEffect(() => {
    const saved = localStorage.getItem('stage_viz_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.faces) {
          const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent);
          if (isMobile) {
            setFaces(parsed.faces.map((f: FaceConfig) => ({ ...f, scene: 'trailer' })));
          } else {
            setFaces(parsed.faces);
          }
        }
        if (parsed.lights) setLights(parsed.lights);
        if (parsed.cameraScale) setCameraScale(parsed.cameraScale);
        if (parsed.offFaceOpacity) setOffFaceOpacity(parsed.offFaceOpacity);
        if (parsed.selectedCamId) setSelectedCamId(parsed.selectedCamId);
        if (parsed.autoOrbit !== undefined) setAutoOrbit(parsed.autoOrbit);
        if (parsed.autoOrbitSpeed !== undefined) setAutoOrbitSpeed(parsed.autoOrbitSpeed);
        if (parsed.cubeDims) setCubeDims(parsed.cubeDims);
        if (parsed.rigStyle) setRigStyle(parsed.rigStyle);
        if (parsed.showPeople !== undefined) setShowPeople(parsed.showPeople);
      } catch (e) { console.error('Error loading config', e); }
    }
  }, []);

  useEffect(() => {
    const data = JSON.stringify({ faces, lights, cameraScale, offFaceOpacity, selectedCamId, autoOrbit, autoOrbitSpeed, cubeDims, rigStyle, showPeople });
    localStorage.setItem('stage_viz_config', data);
  }, [faces, lights, cameraScale, offFaceOpacity, selectedCamId, autoOrbit, autoOrbitSpeed, cubeDims, rigStyle, showPeople]);

  useEffect(() => {
    if (selectedCamId && !cameraActive) {
      startCamera().catch(() => { });
    }
  }, [selectedCamId, cameraActive, startCamera]);

  // ─── Computed values ──────────────────────────────────────────────────────
  const totalPixels = faces.reduce((acc, f) => acc + f.resolution.w * f.resolution.h, 0);
  // Recommended input: face[0] and face[1] side by side
  const recInputW = (faces[0]?.resolution.w ?? 0) + (faces[1]?.resolution.w ?? 0);
  const recInputH = faces[0]?.resolution.h ?? 0;

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: C.bgInput, overflow: 'hidden', fontFamily: "'Courier New', monospace", color: C.textPrimary }}>
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 52, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 500, letterSpacing: '0.2em', color: C.accent }}>INSIDE THE BOX</h1>
          <p style={{ fontSize: 9, color: C.textGhost, letterSpacing: '0.1em' }}>By tomix_x</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            style={{ background: 'transparent', color: C.textPrimary, border: `2px solid ${C.borderStrong}`, padding: '6px 14px', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer' }}
            onClick={resetCamera}
          >⌂ RESET CAM</button>
          <button
            style={autoOrbit
              ? { background: C.textPrimary, color: C.accentText, border: `2px solid ${C.textPrimary}`, padding: '6px 14px', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer', fontWeight: 500 }
              : { background: 'transparent', color: C.textPrimary, border: `2px solid ${C.borderStrong}`, padding: '6px 14px', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer' }
            }
            onClick={() => setAutoOrbit(v => !v)}
          >⟳ AUTO ORBIT</button>
          {autoOrbit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: C.textLabel, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Speed</span>
              <input type="range" min={-20} max={20} step={0.1} value={autoOrbitSpeed}
                onChange={e => setAutoOrbitSpeed(+e.target.value)} style={{ width: 80 }} />
              <span style={{ fontSize: 10, color: C.textSecondary, fontFamily: 'monospace' }}>{autoOrbitSpeed.toFixed(1)}x</span>
            </div>
          )}
          <button
            style={{ background: 'transparent', color: C.accent, border: `2px solid ${C.accent}`, padding: '6px 14px', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer' }}
            onClick={() => setShowMappingUI(true)}
          >⚙ MAPEO</button>
        </div>
      </div>

      {/* ── MAIN ROW (3 columns) ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* ── LEFT SIDEBAR (Escenas + Cámara) ── */}
        <div style={{ width: 300, borderRight: `1px solid ${C.border}`, overflowY: 'auto', flexShrink: 0 }} onPointerDown={e => e.stopPropagation()}>
          {/* PANEL: Cámara Virtual */}
          <div style={{ borderBottom: `1px solid ${C.border}` }}>
            <button
              style={{ width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', color: showCameraSection ? C.textPrimary : C.textMuted, fontFamily: 'inherit', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => setShowCameraSection(v => !v)}
            >
              <span>📹 CÁMARA VIRTUAL</span>
              <span>{showCameraSection ? '▼' : '▶'}</span>
            </button>
            {showCameraSection && (
              <div style={{ padding: '0 16px 16px' }}>
                <select
                  style={{ width: '100%', fontSize: 10, padding: '6px 8px', background: C.bgPanel, color: C.textSecondary, border: `2px solid ${C.borderStrong}`, fontFamily: 'inherit', marginBottom: 8 }}
                  value={selectedCamId}
                  onChange={e => setSelectedCamId(e.target.value)}
                >
                  {cameraList.length === 0 && <option>— sin cámaras detectadas —</option>}
                  {cameraList.map(c => (
                    <option key={c.deviceId} value={c.deviceId}>{c.label || `Cam ${c.deviceId.slice(0, 8)}…`}</option>
                  ))}
                </select>
                <button
                  style={{ width: '100%', background: 'transparent', color: C.textPrimary, border: `2px solid ${cameraActive ? C.accent : C.borderStrong}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer', marginBottom: 12 }}
                  onClick={cameraActive ? stopCamera : startCamera}
                >{cameraActive && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#fff', marginRight: 6, animation: 'blink 1s infinite' }} />}{cameraActive ? 'DETENER CÁMARA' : '▶ INICIAR CÁMARA'}</button>
                <div style={{ border: `2px dashed ${C.borderStrong}`, padding: '16px', textAlign: 'center', cursor: 'pointer', position: 'relative' }}>
                  <p style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>📁 CARGAR ARCHIVO</p>
                  <p style={{ fontSize: 9, color: C.textGhost }}>Video (.mp4) o Imagen (.png)</p>
                  <input type="file" accept="video/*,image/*"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                    onChange={e => { const file = e.target.files?.[0]; if (file) handleFileInput(file); }}
                  />
                </div>
                {cameraActive && (
                  <div style={{ marginTop: 8, padding: '8px', border: '1px solid #1a3a1a', textAlign: 'center' }}>
                    <p style={{ fontSize: 10, color: C.accent }}>● CÁMARA ACTIVA</p>
                    <p style={{ fontSize: 9, color: C.textFaint, marginTop: 4 }}>{cameraResolution.w}×{cameraResolution.h}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PANEL: Escenas */}
          <div style={{ borderBottom: `1px solid ${C.border}` }}>
            <button
              style={{ width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', color: showFacePanel ? C.textPrimary : C.textMuted, fontFamily: 'inherit', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => setShowFacePanel(v => !v)}
            >
              <span>ESCENAS</span>
              <span>{showFacePanel ? '▼' : '▶'}</span>
            </button>
            {showFacePanel && (
              <div style={{ padding: '0 16px 16px' }}>
                {/* Master Projection */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Master Projection</span>
                    <span style={{ fontSize: 11, color: C.textSecondary, fontFamily: 'monospace' }}>{(offFaceOpacity * 100).toFixed(0)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={offFaceOpacity}
                    onChange={e => setOffFaceOpacity(parseFloat(e.target.value))} style={{ width: '100%' }} />
                </div>
                {/* Sync */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <label style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 8 }}>Sync a todas</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      style={{ flex: 1, fontSize: 10, padding: '6px', background: C.bgPanel, color: C.textSecondary, border: `2px solid ${C.borderStrong}`, fontFamily: 'inherit' }}
                      value={syncScene} onChange={e => setSyncScene(e.target.value as SceneType)}
                    >
                      {SCENE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button
                      style={{ background: C.accent, color: C.accentText, border: `2px solid ${C.accent}`, padding: '6px 12px', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
                      onClick={() => setFaces(prev => prev.map(f => ({ ...f, scene: syncScene })))}
                    >▶ SYNC</button>
                  </div>
                </div>
                {/* Previews toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Previews</span>
                  <button
                    style={{ fontSize: 9, padding: '4px 10px', border: `2px solid ${showPreviews ? C.accent : C.borderStrong}`, color: showPreviews ? C.accent : C.textFaint, background: 'transparent', fontFamily: 'inherit', cursor: 'pointer' }}
                    onClick={() => setShowPreviews(v => !v)}
                  >{showPreviews ? 'OCULTAR' : 'MOSTRAR'}</button>
                </div>
                {/* Per-face */}
                {faces.map(face => (
                  <div key={face.id} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.bgMain}` }}>
                    {showPreviews && (
                      <canvas
                        ref={el => { if (el) previewCanvasesRef.current.set(face.id, el); else previewCanvasesRef.current.delete(face.id); }}
                        width={112} height={63}
                        style={{ display: 'block', width: '50%', border: `1px solid ${C.border}`, background: '#000', marginBottom: 6 }}
                      />
                    )}
                    <input
                      style={{ width: '100%', fontSize: 10, background: 'transparent', border: 'none', borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontFamily: 'inherit', padding: '2px 0', marginBottom: 6, outline: 'none' }}
                      value={face.name} onChange={e => updateFace(face.id, { name: e.target.value })}
                    />
                    <select
                      style={{ width: '100%', fontSize: 10, padding: '6px 8px', background: C.bgPanel, color: C.textSecondary, border: `2px solid ${C.borderStrong}`, fontFamily: 'inherit' }}
                      value={face.scene} onChange={e => updateFace(face.id, { scene: e.target.value as SceneType })}
                    >
                      {SCENE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {(face.scene === 'white' || face.scene === 'gradient' || face.scene === 'win98') && (
                      <div style={{ marginTop: 8, padding: '8px', border: `1px solid ${C.bgMain}` }}>
                        <span style={{ fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Variación</span>
                        {face.scene === 'white' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <input type="color" value={face.params?.color || '#ffffff'} onChange={e => updateFace(face.id, { params: { ...face.params, color: e.target.value } })}
                              style={{ width: 40, height: 24, cursor: 'pointer', border: `2px solid ${C.borderStrong}`, background: 'transparent' }} />
                            <span style={{ fontSize: 9, color: C.textFaint }}>Color</span>
                          </div>
                        )}
                        {(face.scene === 'gradient' || face.scene === 'win98') && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <span style={{ fontSize: 9, color: C.textFaint }}>Velocidad</span>
                            <input type="range" min={0.1} max={3} step={0.1} value={face.params?.speed || 1}
                              onChange={e => updateFace(face.id, { params: { ...face.params, speed: +e.target.value } })}
                              style={{ flex: 1 }} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>{/* end left sidebar */}

        {/* ── CENTER: Three.js Viewport ── */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', minWidth: 0 }} />

        {/* ── RIGHT: Controles (320px) ── */}
        <div style={{ width: 320, borderLeft: `1px solid ${C.border}`, overflowY: 'auto', flexShrink: 0 }} onPointerDown={e => e.stopPropagation()}>

          {/* LUCES */}
          <div style={{ borderBottom: `1px solid ${C.border}` }}>
            <button
              style={{ width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', color: showLightPanel ? C.textPrimary : C.textMuted, fontFamily: 'inherit', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => setShowLightPanel(v => !v)}
            >
              <span>LUCES</span>
              <span>{showLightPanel ? '▼' : '▶'}</span>
            </button>
            {showLightPanel && (
              <div style={{ padding: '0 16px 16px' }}>
                {/* Light Presets */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <label style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 8 }}>Presets</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input type="text" placeholder="Nombre…" value={presetName}
                      onChange={e => setPresetName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && savePreset()}
                      style={{ flex: 1, fontSize: 10, background: C.bgInput, border: `2px solid ${C.borderStrong}`, color: C.textSecondary, fontFamily: 'inherit', padding: '6px 8px' }}
                    />
                    <button
                      style={{ background: C.accent, color: C.accentText, border: `2px solid ${C.accent}`, padding: '6px 12px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer', fontWeight: 500 }}
                      onClick={savePreset}
                    >SAVE</button>
                  </div>
                  {lightPresets.length === 0 && <p style={{ fontSize: 9, color: C.textGhost, fontStyle: 'italic' }}>Sin presets guardados</p>}
                  <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                    {lightPresets.map(p => (
                      <div key={p.name} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                        <button
                          style={{ flex: 1, textAlign: 'left', fontSize: 9, padding: '6px 8px', background: C.bgPanel, color: C.textTertiary, border: `2px solid ${C.border}`, fontFamily: 'inherit', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          onClick={() => loadPreset(p)}
                        >▶ {p.name}</button>
                        <button
                          style={{ fontSize: 9, padding: '6px 8px', background: 'transparent', color: C.danger, border: `2px solid ${C.dangerBorder}`, fontFamily: 'inherit', cursor: 'pointer' }}
                          onClick={() => deletePreset(p.name)}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Master controls */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button
                    style={lightsAllOff
                      ? { flex: 1, background: '#ff3333', color: C.white, border: '2px solid #ff3333', padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer', fontWeight: 500 }
                      : { flex: 1, background: 'transparent', color: C.textFaint, border: `2px solid ${C.borderStrong}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer' }
                    }
                    onClick={() => setLightsAllOff(v => !v)}
                  >{lightsAllOff ? '🔴 OFF' : '⚡ ON'}</button>
                  <button
                    style={chaserActive
                      ? { flex: 1, background: C.accent, color: C.accentText, border: `2px solid ${C.accent}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer', fontWeight: 500 }
                      : { flex: 1, background: 'transparent', color: C.textFaint, border: `2px solid ${C.borderStrong}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer' }
                    }
                    onClick={() => setChaserActive(v => !v)}
                  >⚡ CHASE</button>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <button
                    style={!showLightHelpers
                      ? { width: '100%', background: 'transparent', color: C.accent, border: `2px solid ${C.accent}`, padding: '7px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer', fontWeight: 600 }
                      : { width: '100%', background: 'transparent', color: C.textMuted, border: `2px solid ${C.borderStrong}`, padding: '7px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer' }
                    }
                    onClick={() => setShowLightHelpers(v => !v)}
                  >{showLightHelpers ? '👁️ OCULTAR LUCES 3D' : '👁️ MOSTRAR LUCES 3D'}</button>
                </div>
                {chaserActive && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', minWidth: 32 }}>BPM</span>
                    <input type="range" min={30} max={300} step={1} value={chaserBpm}
                      onChange={e => setChaserBpm(+e.target.value)} style={{ flex: 1 }} />
                    <input type="number" min={30} max={300} value={chaserBpm}
                      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setChaserBpm(Math.max(30, Math.min(300, v))); }}
                      style={{ width: 48, fontSize: 9, background: C.bgInput, border: `2px solid ${C.borderStrong}`, color: C.accent, fontFamily: 'monospace', padding: '4px' }} />
                  </div>
                )}

                {/* Light tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                  {lights.map((l, i) => {
                    const typeEmoji = l.type === 'spot' ? '🔦' : '💡';
                    const isActive = activeLightTab === i;
                    return (
                      <button key={i}
                        style={{ flex: 1, fontSize: 10, padding: '6px 4px', background: 'transparent', color: isActive ? C.accent : C.textMuted, fontWeight: 'bold', border: isActive ? `2px solid ${C.accent}` : `2px solid ${C.borderStrong}`, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        onClick={() => setActiveLightTab(i)}
                      >{typeEmoji} {l.name.split(' ')[1]}</button>
                    );
                  })}
                </div>

                {(() => {
                  const l = lights[activeLightTab];
                  if (!l) return null;
                  const i = activeLightTab;
                  const numInput = (val: number, min: number, max: number, step: number, key: string) => (
                    <input type="number" min={min} max={max} step={step} value={val}
                      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateLight(i, { [key]: Math.max(min, Math.min(max, v)) }); }}
                      style={{ width: 52, fontSize: 9, background: C.bgInput, border: `2px solid ${C.borderStrong}`, color: C.accent, fontFamily: 'monospace', padding: '3px 4px' }}
                    />
                  );
                  return (
                    <div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                        {(['point', 'spot', 'led'] as LightType[]).map(t => (
                          <button key={t}
                            style={l.type === t
                              ? { flex: 1, fontSize: 9, padding: '8px 4px', background: C.textPrimary, color: C.accentText, border: `2px solid ${C.textPrimary}`, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }
                              : { flex: 1, fontSize: 9, padding: '8px 4px', background: 'transparent', color: C.textMuted, border: `2px solid ${C.borderStrong}`, cursor: 'pointer', fontFamily: 'inherit' }
                            }
                            onClick={() => switchLightType(i, t)}>
                            {t === 'point' ? '💡 POINT' : t === 'spot' ? '🔦 SPOT' : '💡 LEDS'}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <input type="text" value={l.name} onChange={e => updateLight(i, { name: e.target.value })}
                          placeholder="Nombre"
                          style={{ flex: 1, fontSize: 10, background: C.bgInput, border: `2px solid ${C.borderStrong}`, color: C.textPrimary, fontFamily: 'monospace', padding: '4px 6px' }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <input type="color" value={l.color} onChange={e => updateLight(i, { color: e.target.value })}
                          style={{ width: 40, height: 32, cursor: 'pointer', border: `2px solid ${C.borderStrong}`, background: 'transparent' }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 4 }}>Intensidad</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input type="range" min={0} max={10} step={0.1} value={l.intensity}
                              onChange={e => updateLight(i, { intensity: +e.target.value })} style={{ flex: 1 }} />
                            {numInput(l.intensity, 0, 10, 0.1, 'intensity')}
                          </div>
                        </div>
                      </div>
                      {l.type === 'led' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <span style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', minWidth: 36 }}>LEDs</span>
                          <input type="range" min={2} max={48} step={1} value={l.ledCount ?? 12}
                            onChange={e => { updateLight(i, { ledCount: +e.target.value }); switchLightType(i, 'led'); }} style={{ flex: 1 }} />
                          {numInput(l.ledCount ?? 12, 2, 48, 1, 'ledCount')}
                        </div>
                      )}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div className={`toggle-switch ${l.strobe ? 'active' : ''}`} onClick={() => updateLight(i, { strobe: !l.strobe })} />
                          <span style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase' }}>Strobe</span>
                        </div>
                        {l.strobe && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', minWidth: 24 }}>Hz</span>
                            <input type="range" min={0.5} max={20} step={0.5} value={l.strobeHz ?? 3}
                              onChange={e => updateLight(i, { strobeHz: +e.target.value })} style={{ flex: 1 }} />
                            {numInput(l.strobeHz ?? 3, 0.5, 20, 0.5, 'strobeHz')}
                          </div>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Posición XYZ</p>
                      {(['x', 'y', 'z'] as const).map(ax => (
                        <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 500, minWidth: 12, color: ax === 'x' ? '#f66' : ax === 'y' ? '#6f6' : '#66f' }}>{ax.toUpperCase()}</span>
                          <input type="range" min={-2.5} max={2.5} step={0.02} value={l[ax]}
                            onChange={e => updateLight(i, { [ax]: +e.target.value })} style={{ flex: 1 }} />
                          {numInput(l[ax], -2.5, 2.5, 0.01, ax)}
                        </div>
                      ))}
                      {(l.type === 'spot' || l.type === 'led') && (
                        <>
                          <p style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, marginTop: 12 }}>Rotación</p>
                          {(['rotX', 'rotZ'] as const).map(ax => (
                            <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                              <span style={{ fontSize: 9, color: C.textLabel, minWidth: 32 }}>{ax === 'rotX' ? 'X' : 'Z'}</span>
                              <input type="range" min={-180} max={180} step={1} value={l[ax] ?? 0}
                                onChange={e => updateLight(i, { [ax]: +e.target.value })} style={{ flex: 1 }} />
                              {numInput(l[ax] ?? 0, -180, 180, 1, ax === 'rotZ' ? 'rotZ' : 'rotX')}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* ESTRUCTURA */}
          <div style={{ borderBottom: `1px solid ${C.border}` }}>
            <button
              style={{ width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', color: showEstructuraPanel ? C.textPrimary : C.textMuted, fontFamily: 'inherit', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => setShowEstructuraPanel(v => !v)}
            >
              <span>ESTRUCTURA</span>
              <span>{showEstructuraPanel ? '▼' : '▶'}</span>
            </button>
            {showEstructuraPanel && (
              <div style={{ padding: '0 16px 16px' }}>
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <label style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 8 }}>Estilo Rig</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      style={rigStyle === 'pipe'
                        ? { flex: 1, background: C.textPrimary, color: C.accentText, border: `2px solid ${C.textPrimary}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer', fontWeight: 500 }
                        : { flex: 1, background: 'transparent', color: C.textMuted, border: `2px solid ${C.borderStrong}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer' }
                      }
                      onClick={() => setRigStyle('pipe')}
                    >⬜ PIPE</button>
                    <button
                      style={rigStyle === 'truss'
                        ? { flex: 1, background: C.textPrimary, color: C.accentText, border: `2px solid ${C.textPrimary}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer', fontWeight: 500 }
                        : { flex: 1, background: 'transparent', color: C.textMuted, border: `2px solid ${C.borderStrong}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer' }
                      }
                      onClick={() => setRigStyle('truss')}
                    >▦ TRUSS</button>
                    <button
                      style={rigStyle === 'columns'
                        ? { flex: 1, background: C.textPrimary, color: C.accentText, border: `2px solid ${C.textPrimary}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer', fontWeight: 500 }
                        : { flex: 1, background: 'transparent', color: C.textMuted, border: `2px solid ${C.borderStrong}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer' }
                      }
                      onClick={() => setRigStyle('columns')}
                    >🏛️ COLUMNAS</button>
                  </div>
                </div>

                {/* People toggle */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <label style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 8 }}>Personas (escala)</label>
                  <button
                    style={showPeople
                      ? { width: '100%', background: 'transparent', color: C.accent, border: `2px solid ${C.accent}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer', fontWeight: 600 }
                      : { width: '100%', background: 'transparent', color: C.textMuted, border: `2px solid ${C.borderStrong}`, padding: '8px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer' }
                    }
                    onClick={() => setShowPeople(v => !v)}
                  >🧍 {showPeople ? 'OCULTAR PERSONAS' : 'MOSTRAR PERSONAS'}</button>
                </div>

                <label style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 12 }}>Dimensiones</label>
                {(['w', 'h', 'd'] as const).map(dim => {
                  const dimLabels: Record<string, string> = { w: 'Ancho (W)', h: 'Alto (H)', d: 'Profundidad (D)' };
                  return (
                    <div key={dim} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <label style={{ fontSize: 9, color: C.textMuted, textTransform: 'uppercase', minWidth: 88 }}>{dimLabels[dim]}</label>
                      <input type="number" min={0.5} max={50} step={0.1} value={cubeDims[dim]}
                        onChange={e => setCubeDims(prev => ({ ...prev, [dim]: Math.max(0.5, Math.min(50, +e.target.value || 0.5)) }))}
                        style={{ flex: 1, fontSize: 10, background: C.bgInput, border: `2px solid ${C.borderStrong}`, color: C.accent, fontFamily: 'monospace', padding: '4px 6px' }} />
                      <span style={{ fontSize: 9, color: C.textGhost }}>m</span>
                    </div>
                  );
                })}
                <div style={{ marginTop: 4, textAlign: 'center', fontSize: 9, color: C.textFaint, fontFamily: 'monospace' }}>
                  {cubeDims.w.toFixed(1)} × {cubeDims.h.toFixed(1)} × {cubeDims.d.toFixed(1)} m
                </div>
              </div>
            )}
          </div>

          {/* RESOLUCIÓN */}
          <div style={{ borderBottom: `1px solid ${C.border}` }}>
            <button
              style={{ width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', color: showResolucionPanel ? C.textPrimary : C.textMuted, fontFamily: 'inherit', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => setShowResolucionPanel(v => !v)}
            >
              <span>RESOLUCIÓN</span>
              <span>{showResolucionPanel ? '▼' : '▶'}</span>
            </button>
            {showResolucionPanel && (
              <div style={{ padding: '0 16px 16px' }}>
                <label style={{ fontSize: 11, color: C.textLabel, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 12 }}>Resolución por Cara</label>
                {faces.map(face => (
                  <div key={face.id} style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 9, color: C.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{face.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, color: C.textGhost }}>W:</span>
                      <input type="number" min={64} max={2048} step={1} value={face.resolution.w}
                        onChange={e => { const v = Math.max(64, Math.min(2048, parseInt(e.target.value) || 64)); updateFace(face.id, { resolution: { ...face.resolution, w: v } }); }}
                        style={{ width: 60, fontSize: 9, background: C.bgInput, border: `2px solid ${C.borderStrong}`, color: C.accent, fontFamily: 'monospace', padding: '3px 4px' }} />
                      <span style={{ fontSize: 9, color: C.textGhost }}>×</span>
                      <span style={{ fontSize: 9, color: C.textGhost }}>H:</span>
                      <input type="number" min={64} max={2048} step={1} value={face.resolution.h}
                        onChange={e => { const v = Math.max(64, Math.min(2048, parseInt(e.target.value) || 64)); updateFace(face.id, { resolution: { ...face.resolution, h: v } }); }}
                        style={{ width: 60, fontSize: 9, background: C.bgInput, border: `2px solid ${C.borderStrong}`, color: C.accent, fontFamily: 'monospace', padding: '3px 4px' }} />
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 4 }}>
                    <span style={{ color: C.textFaint, textTransform: 'uppercase' }}>Total px</span>
                    <span style={{ color: C.accent, fontFamily: 'monospace' }}>{totalPixels.toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 9, color: C.textFaint, textTransform: 'uppercase', marginBottom: 4 }}>Res. entrada recomendada:</div>
                  <div style={{ fontSize: 10, color: C.accent, fontFamily: 'monospace' }}>{recInputW} × {recInputH}</div>
                </div>
              </div>
            )}
          </div>

        </div>{/* end right sidebar */}

      </div>{/* end main row */}

      {/* ── PRESETS DE ESCENA ── */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 24px', flexShrink: 0 }}>
        <p style={{ fontSize: 12, color: C.textSubtle, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>PRESETS DE ESCENA</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {([
            { emoji: '🖼️', title: 'Default', desc: 'Pre grabada', scene: 'trailer' as SceneType, accent: '#0066ff' },
            { emoji: '🎥', title: 'Camara Virtual', desc: 'Luces dinámicas y estrobos', scene: 'camera' as SceneType, accent: C.variantAccent },
            { emoji: '🗂️', title: 'Grid', desc: 'Setup para eventos corporativos', scene: 'grid_img' as SceneType, accent: '#ff6600' },
            { emoji: '🌈', title: 'Gradients', desc: 'Luces para pista de baile', scene: 'gradient' as SceneType, accent: C.accent },
            { emoji: '🤖', title: 'Preset', desc: 'Crea tu propio preset', scene: 'win98' as SceneType | null, accent: '#888' },
            { emoji: '⬜', title: 'Blanco', desc: 'Iluminación teatral clásica', scene: 'white' as SceneType, accent: '#ffcc00' },
          ] as { emoji: string; title: string; desc: string; scene: SceneType | null; accent: string }[]).map((preset, idx) => (
            <button
              key={idx}
              style={{ background: 'transparent', border: `2px solid ${C.borderStrong}`, padding: '16px 8px', textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = preset.accent)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.borderStrong)}
              onClick={() => {
                if (preset.scene) setFaces(prev => prev.map(f => ({ ...f, scene: preset.scene! })));
                else setShowMappingUI(true);
              }}
            >
              <span style={{ fontSize: 20 }}>{preset.emoji}</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: C.textPrimary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{preset.title}</span>
              <span style={{ fontSize: 8, color: C.textMuted }}>{preset.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── MAPPING OVERLAY ── */}
      {showMappingUI && (
        <div
          style={{ position: 'fixed', zIndex: 100, left: mappingPos.x, top: mappingPos.y, width: 860, height: 620, background: C.bgOverlay, border: `2px solid ${C.borderStrong}`, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', pointerEvents: 'auto', userSelect: 'none' }}
          onPointerDown={e => e.stopPropagation()}
        >
          <div
            style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'move', background: C.bgPanel, flexShrink: 0 }}
            onPointerDown={e => {
              dragStartRef.current = { x: e.clientX, y: e.clientY, winX: mappingPos.x, winY: mappingPos.y };
              const move = (me: PointerEvent) => {
                setMappingPos({ x: dragStartRef.current.winX + (me.clientX - dragStartRef.current.x), y: dragStartRef.current.winY + (me.clientY - dragStartRef.current.y) });
              };
              const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 8, height: 8, background: C.accent, display: 'inline-block' }} />
              <h2 style={{ fontSize: 10, fontWeight: 400, color: C.textSubtle, letterSpacing: '0.2em', textTransform: 'uppercase' }}>CONFIGURAR MAPEITO . _.</h2>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ padding: '6px 14px', background: 'transparent', color: C.textSubtle, border: `2px solid ${C.borderStrong}`, fontSize: 10, fontFamily: 'inherit', letterSpacing: '0.1em', cursor: 'pointer', textTransform: 'uppercase' }} onClick={undo}>UNDO</button>
              <button style={{ padding: '6px 14px', background: C.accent, color: C.accentText, border: `2px solid ${C.accent}`, fontSize: 10, fontFamily: 'inherit', letterSpacing: '0.1em', cursor: 'pointer', fontWeight: 500, textTransform: 'uppercase' }} onClick={() => setShowMappingUI(false)}>CERRAR</button>
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
            <div style={{ background: C.bgInput, border: `1px solid ${C.border}`, padding: 12, fontSize: 9, color: C.textFaint, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
                <span>Dims: <span style={{ color: C.accent, fontFamily: 'monospace' }}>{cubeDims.w.toFixed(1)}×{cubeDims.h.toFixed(1)}×{cubeDims.d.toFixed(1)} m</span></span>
                <span>Total px: <span style={{ color: C.accent, fontFamily: 'monospace' }}>{totalPixels.toLocaleString()}</span></span>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {faces.map(f => <span key={f.id} style={{ fontFamily: 'monospace' }}>{f.name}: <span style={{ color: C.textSubtle }}>{f.resolution.w}×{f.resolution.h}</span></span>)}
              </div>
            </div>

            <div style={{ flexShrink: 0 }}>
              <button
                style={{ padding: '6px 12px', background: 'transparent', color: C.danger, border: `2px solid ${C.dangerBorder}`, fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase' }}
                onClick={() => { if (confirm('¿Restablecer todo a fábrica?')) { localStorage.removeItem('stage_viz_config'); window.location.reload(); } }}
              >FACTORY RESET</button>
            </div>

            <div ref={previewContainerRef} style={{ position: 'relative', background: '#000', border: `1px solid ${C.border}`, overflow: 'hidden', height: 280, flexShrink: 0 }}>
              <canvas ref={mappingPreviewCanvasRef} width={860} height={280} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              <div style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                {(() => {
                  const COLORS = [C.variantAccent, '#00ff85', '#0066ff', '#ffff00'];
                  const HANDLES: { key: string; style: React.CSSProperties }[] = [
                    { key: 'nw', style: { top: -5, left: -5, cursor: 'nwse-resize' } },
                    { key: 'n', style: { top: -5, left: 'calc(50% - 5px)', cursor: 'ns-resize' } },
                    { key: 'ne', style: { top: -5, right: -5, cursor: 'nesw-resize' } },
                    { key: 'e', style: { top: 'calc(50% - 5px)', right: -5, cursor: 'ew-resize' } },
                    { key: 'se', style: { bottom: -5, right: -5, cursor: 'nwse-resize' } },
                    { key: 's', style: { bottom: -5, left: 'calc(50% - 5px)', cursor: 'ns-resize' } },
                    { key: 'sw', style: { bottom: -5, left: -5, cursor: 'nesw-resize' } },
                    { key: 'w', style: { top: 'calc(50% - 5px)', left: -5, cursor: 'ew-resize' } },
                  ];
                  return faces.map((face, index) => {
                    const color = COLORS[index];
                    return (
                      <div key={face.id} style={{ position: 'absolute', userSelect: 'none', left: `${face.mapping.x * 100}%`, top: `${face.mapping.y * 100}%`, width: `${face.mapping.w * 100}%`, height: `${face.mapping.h * 100}%`, border: `2px solid ${color}`, background: color + '15', boxSizing: 'border-box', cursor: 'move' }}
                        onPointerDown={e => {
                          if ((e.target as HTMLElement).dataset.handle) return;
                          e.stopPropagation();
                          (e.target as HTMLElement).setPointerCapture(e.pointerId);
                          faceDragRef.current = { faceId: face.id, startMouseX: e.clientX, startMouseY: e.clientY, startMX: face.mapping.x, startMY: face.mapping.y, mW: face.mapping.w, mH: face.mapping.h };
                        }}
                        onPointerMove={e => {
                          const drag = faceDragRef.current;
                          if (!drag || drag.faceId !== face.id) return;
                          const rect = previewContainerRef.current?.getBoundingClientRect();
                          if (!rect) return;
                          updateFace(face.id, { mapping: { ...face.mapping, x: drag.startMX + (e.clientX - drag.startMouseX) / rect.width, y: drag.startMY + (e.clientY - drag.startMouseY) / rect.height } });
                        }}
                        onPointerUp={() => { faceDragRef.current = null; }}
                      >
                        <div style={{ position: 'absolute', top: 0, left: 0, padding: '2px 4px', fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase', background: color, color: C.accentText, pointerEvents: 'none' }}>{face.name}</div>
                        <div style={{ position: 'absolute', bottom: 0, right: 0, padding: '2px 4px', fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase', background: color + 'bb', color: C.accentText, pointerEvents: 'none' }}>{face.name}</div>
                        {HANDLES.map(({ key, style }) => (
                          <div key={key} data-handle={key}
                            style={{ position: 'absolute', width: 10, height: 10, background: '#fff', border: `2px solid ${color}`, boxSizing: 'border-box', zIndex: 20, ...style }}
                            onPointerDown={e => {
                              e.stopPropagation();
                              (e.target as HTMLElement).setPointerCapture(e.pointerId);
                              faceResizeRef.current = { faceId: face.id, handle: key, startMouseX: e.clientX, startMouseY: e.clientY, startMX: face.mapping.x, startMY: face.mapping.y, startMW: face.mapping.w, startMH: face.mapping.h };
                            }}
                            onPointerMove={e => {
                              const r = faceResizeRef.current;
                              if (!r || r.faceId !== face.id || r.handle !== key) return;
                              const rect = previewContainerRef.current?.getBoundingClientRect();
                              if (!rect) return;
                              const dx = (e.clientX - r.startMouseX) / rect.width;
                              const dy = (e.clientY - r.startMouseY) / rect.height;
                              let x = r.startMX, y = r.startMY, w = r.startMW, h = r.startMH;
                              if (key.includes('e')) w = Math.max(0.02, w + dx);
                              if (key.includes('w')) { x = x + dx; w = Math.max(0.02, w - dx); }
                              if (key.includes('s')) h = Math.max(0.02, h + dy);
                              if (key.includes('n')) { y = y + dy; h = Math.max(0.02, h - dy); }
                              updateFace(face.id, { mapping: { x, y, w, h } });
                            }}
                            onPointerUp={() => { faceResizeRef.current = null; }}
                          />
                        ))}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {(() => {
              const COLORS = [C.variantAccent, '#00ff85', '#0066ff', '#ffff00'];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, background: C.bgInput, padding: 12, border: `1px solid ${C.border}`, flexShrink: 0 }}>
                  {faces.map((f, idx) => {
                    const color = COLORS[idx];
                    const row = (label: string, val: number, onChange: (v: number) => void, min = -1, max = 2) => (
                      <div key={label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: C.textGhost, textTransform: 'uppercase', marginBottom: 2 }}><span>{label}</span><span>{val.toFixed(3)}</span></div>
                        <input type="range" min={min} max={max} step={0.001} value={val} onChange={e => onChange(+e.target.value)} style={{ width: '100%' }} />
                      </div>
                    );
                    return (
                      <div key={f.id} style={{ borderLeft: `2px solid ${color}`, paddingLeft: 8 }}>
                        <p style={{ fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color, marginBottom: 6 }}>{f.name}</p>
                        {row('X', f.mapping.x, v => updateFace(f.id, { mapping: { ...f.mapping, x: v } }))}
                        {row('Y', f.mapping.y, v => updateFace(f.id, { mapping: { ...f.mapping, y: v } }))}
                        {row('W', f.mapping.w, v => updateFace(f.id, { mapping: { ...f.mapping, w: Math.max(0.01, v) } }), 0.01, 2)}
                        {row('H', f.mapping.h, v => updateFace(f.id, { mapping: { ...f.mapping, h: Math.max(0.01, v) } }), 0.01, 2)}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
}
