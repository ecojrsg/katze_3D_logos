/**
 * logo-geometries.js
 * Construcción clara y modular de todas las geometrías 3D de la exhibición:
 *   - Eco (5 piezas en capas escalonadas con biseles suaves)
 *   - Katze (contorno 3D del gato con muesca circular en la oreja + trazado progresivo)
 *   - Odoo (letras 'o' y 'd' biseladas)
 *   - Motor de morphing tipo plastilina (Odoo O <-> Diamante central de Eco)
 *   - Pedestal arquitectónico minimalista (solo usado en la página de exhibición)
 */
(function (global) {
  'use strict';

  const Katze3D = (global.Katze3D = global.Katze3D || {});
  const { clamp01, lerp, easeInOutCubic } = Katze3D.Easing;

  // Paletas de materiales PBR (en espacio RGB lineal)
  Katze3D.MATERIALS = {
    ecoBlack:   { albedo: [0.020, 0.021, 0.024], roughness: 0.48, f0: 0.050 },
    odooPurple: { albedo: [0.132, 0.054, 0.110], roughness: 0.42, f0: 0.048 }, // #714B67
    odooGray:   { albedo: [0.245, 0.245, 0.250], roughness: 0.45, f0: 0.045 }  // #8F8F8F
  };

  // Constantes compartidas de proporciones
  Katze3D.LAYOUT = {
    ecoScale: 0.94,
    katzeScale: 1.94 / 150.0,
    katzeCenterX: 74.0,
    katzeCenterY: 77.0,
    katzeInnerX: (65.5 - 74.0) * (1.94 / 150.0),
    katzeInnerY: (77.0 - 84.5) * (1.94 / 150.0),
    katzeInnerScale: 0.56,
    odooStep: 0.745,
    odooWordScale: 0.74,
    odooSoloScale: 1.72,
    odooSoloScaleZ: 1.24,
    odooWordY: -0.10,
    odooSoloY: 0.02,
    floorY: -1.68
  };

  // ---------------------------------------------------------------------------
  // Constructor básico de mallas WebGL2 (posición + normal + índices)
  // ---------------------------------------------------------------------------
  function createMeshBuilder(gl) {
    const positions = [];
    const normals = [];
    const indices = [];

    function addTriangle(p0, p1, p2, n0, n1, n2) {
      const base = positions.length / 3;
      positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);

      if (!n0) {
        const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
        const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      } else {
        normals.push(n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], n2[0], n2[1], n2[2]);
      }

      indices.push(base, base + 1, base + 2);
    }

    function addQuad(p0, p1, p2, p3, n0, n1, n2, n3) {
      if (!n0) {
        const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
        const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        const n = [nx / len, ny / len, nz / len];
        addTriangle(p0, p1, p2, n, n, n);
        addTriangle(p0, p2, p3, n, n, n);
      } else {
        addTriangle(p0, p1, p2, n0, n1, n2);
        addTriangle(p0, p2, p3, n0, n2, n3);
      }
    }

    function upload() {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      const posBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

      const normBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

      const idxBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

      gl.bindVertexArray(null);
      return { vao, count: indices.length };
    }

    return { addTriangle, addQuad, upload };
  }

  // Expande un contorno 2D cerrado hacia afuera para generar biseles limpios sin cruces
  function offsetPolygon(points, distance, miterLimit = 2.0) {
    const count = points.length;
    const result = [];

    for (let i = 0; i < count; i++) {
      const prev = points[(i - 1 + count) % count];
      const curr = points[i];
      const next = points[(i + 1) % count];

      const e1x = curr[0] - prev[0], e1y = curr[1] - prev[1];
      const e2x = next[0] - curr[0], e2y = next[1] - curr[1];
      const len1 = Math.hypot(e1x, e1y) || 1;
      const len2 = Math.hypot(e2x, e2y) || 1;

      const n1x = e1y / len1, n1y = -e1x / len1;
      const n2x = e2y / len2, n2y = -e2x / len2;

      let bx = n1x + n2x;
      let by = n1y + n2y;
      const bLen = Math.hypot(bx, by);

      if (bLen < 1e-6) {
        result.push([curr[0] + n1x * distance, curr[1] + n1y * distance]);
      } else {
        bx /= bLen;
        by /= bLen;
        const dot = bx * n1x + by * n1y;
        const factor = distance / Math.max(dot, 1.0 / miterLimit);
        result.push([curr[0] + bx * factor, curr[1] + by * factor]);
      }
    }
    return result;
  }

  // Extruye un polígono 2D (con o sin huecos) en 3D con bisel escultórico de 2 etapas
  function addBeveledExtrusion(builder, vertices, loops, capTriangles, halfDepth, bevelWidth, bevelDepth, smoothAngleCos = 1.1) {
    // 1. Tapas frontal (+Z) y trasera (-Z)
    for (const [i, j, k] of capTriangles) {
      const a = vertices[i], b = vertices[j], c = vertices[k];
      builder.addTriangle([a[0], a[1], halfDepth], [b[0], b[1], halfDepth], [c[0], c[1], halfDepth], [0, 0, 1], [0, 0, 1], [0, 0, 1]);
      builder.addTriangle([a[0], a[1], -halfDepth], [c[0], c[1], -halfDepth], [b[0], b[1], -halfDepth], [0, 0, -1], [0, 0, -1], [0, 0, -1]);
    }

    // 2. Perfil del bisel en 6 cortes desde el frente hacia atrás
    const slices = [
      { offset: 0.00, z:  halfDepth,                     nz:  0.96, nxy: 0.28 },
      { offset: 0.58, z:  halfDepth - bevelDepth * 0.32, nz:  0.68, nxy: 0.73 },
      { offset: 1.00, z:  halfDepth - bevelDepth,        nz:  0.22, nxy: 0.975 },
      { offset: 1.00, z: -(halfDepth - bevelDepth),      nz: -0.22, nxy: 0.975 },
      { offset: 0.58, z: -(halfDepth - bevelDepth * 0.32), nz: -0.68, nxy: 0.73 },
      { offset: 0.00, z: -halfDepth,                     nz: -0.96, nxy: 0.28 }
    ];

    for (const loop of loops) {
      const rings = slices.map(s => (s.offset === 0 ? loop : offsetPolygon(loop, bevelWidth * s.offset, 1.85)));
      const n = loop.length;

      // Normales salientes 2D de cada segmento
      const edgeNormals = [];
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const dx = loop[next][0] - loop[i][0];
        const dy = loop[next][1] - loop[i][1];
        const len = Math.hypot(dx, dy) || 1;
        edgeNormals.push([dy / len, -dx / len]);
      }

      function getVertexXYNormal(edgeIdx, vertIdx) {
        const current = edgeNormals[edgeIdx];
        if (smoothAngleCos > 1.0) return current;
        const neighborIdx = (vertIdx === edgeIdx) ? (edgeIdx - 1 + n) % n : (edgeIdx + 1) % n;
        const neighbor = edgeNormals[neighborIdx];
        if (current[0] * neighbor[0] + current[1] * neighbor[1] >= smoothAngleCos) {
          const sx = current[0] + neighbor[0];
          const sy = current[1] + neighbor[1];
          const sl = Math.hypot(sx, sy) || 1;
          return [sx / sl, sy / sl];
        }
        return current;
      }

      function makeBevelNormal(xy, slice) {
        const nx = xy[0] * slice.nxy;
        const ny = xy[1] * slice.nxy;
        const nz = slice.nz;
        const len = Math.hypot(nx, ny, nz) || 1;
        return [nx / len, ny / len, nz / len];
      }

      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const xy0 = getVertexXYNormal(i, i);
        const xy1 = getVertexXYNormal(i, next);

        for (let s = 0; s < slices.length - 1; s++) {
          const sA = slices[s], sB = slices[s + 1];
          const rA = rings[s],  rB = rings[s + 1];
          const p0 = [rA[i][0],    rA[i][1],    sA.z];
          const p1 = [rB[i][0],    rB[i][1],    sB.z];
          const p2 = [rB[next][0], rB[next][1], sB.z];
          const p3 = [rA[next][0], rA[next][1], sA.z];

          if (s === 2) {
            const n0 = [xy0[0], xy0[1], 0];
            const n1 = [xy1[0], xy1[1], 0];
            builder.addQuad(p0, p1, p2, p3, n0, n0, n1, n1);
          } else {
            builder.addQuad(
              p0, p1, p2, p3,
              makeBevelNormal(xy0, sA), makeBevelNormal(xy0, sB),
              makeBevelNormal(xy1, sB), makeBevelNormal(xy1, sA)
            );
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 1. LOGO ECO (5 piezas independientes en capas de profundidad escalonada)
  // ---------------------------------------------------------------------------
  function normalizeEcoPoints(pixelPoints) {
    const centerX = 500.5, centerY = 500.0, scale = 1.0 / 318.0;
    return pixelPoints.map(([x, y]) => [(x - centerX) * scale, (centerY - y) * scale]);
  }

  const ECO_GEM_OUTER = normalizeEcoPoints([
    [433.5, 393], [351.5, 475], [419.5, 595.5], [500.5, 675.5],
    [581.5, 595.5], [649.5, 475], [567.5, 393]
  ]);
  const ECO_GEM_HOLE = normalizeEcoPoints([
    [387.5, 441], [613.5, 441], [500.5, 637]
  ]);
  const ECO_CHEVRON = normalizeEcoPoints([
    [500.5, 182], [349.5, 333], [423.5, 333],
    [500.5, 256], [577.5, 333], [651.5, 333]
  ]);
  const ECO_CRADLE = normalizeEcoPoints([
    [500.5, 817.5], [778, 540], [701, 463], [674.5, 511], [704.5, 541], [591.5, 653],
    [500.5, 812.5], [409.5, 653], [296.5, 541], [326.5, 511], [300, 463], [223, 540]
  ]);
  const ECO_TRI_LEFT  = normalizeEcoPoints([[232, 333], [261.5, 382.5], [310.5, 333]]);
  const ECO_TRI_RIGHT = normalizeEcoPoints([[690.5, 333], [739.5, 382.5], [769, 333]]);

  function buildEcoPieces(gl) {
    function buildPiece(verts, loops, tris, halfDepth, bevelW, bevelZ) {
      const builder = createMeshBuilder(gl);
      addBeveledExtrusion(builder, verts, loops, tris, halfDepth, bevelW, bevelZ);
      return builder.upload();
    }

    const gemTris = [
      [0, 1, 7], [1, 2, 7], [2, 9, 7], [2, 3, 9], [3, 4, 9],
      [4, 8, 9], [4, 5, 8], [5, 6, 8], [6, 0, 7], [6, 7, 8]
    ];
    const cradleTris = [
      [1, 2, 3], [1, 3, 4], [1, 4, 5], [0, 1, 5], [0, 5, 6],
      [0, 6, 7], [0, 7, 11], [11, 7, 8], [11, 8, 9], [11, 9, 10]
    ];

    return [
      { name: 'Central_Gem',    mesh: buildPiece([...ECO_GEM_OUTER, ...ECO_GEM_HOLE], [ECO_GEM_OUTER, ECO_GEM_HOLE], gemTris, 0.175, 0.013, 0.020), delay: 0.00, liftDir:  0.25, cx:  0.00, cy: -0.04 },
      { name: 'Top_Chevron',    mesh: buildPiece(ECO_CHEVRON,   [ECO_CHEVRON],   [[0,1,2],[0,2,3],[0,3,4],[0,4,5]],           0.115, 0.011, 0.017), delay: 0.07, liftDir:  0.55, cx:  0.00, cy:  0.72 },
      { name: 'Lower_Cradle',   mesh: buildPiece(ECO_CRADLE,    [ECO_CRADLE],    cradleTris,                                  0.115, 0.011, 0.017), delay: 0.09, liftDir: -0.25, cx:  0.00, cy: -0.45 },
      { name: 'Triangle_Left',  mesh: buildPiece(ECO_TRI_LEFT,  [ECO_TRI_LEFT],  [[0, 1, 2]],                                 0.082, 0.009, 0.014), delay: 0.14, liftDir:  0.72, cx: -0.73, cy:  0.47 },
      { name: 'Triangle_Right', mesh: buildPiece(ECO_TRI_RIGHT, [ECO_TRI_RIGHT], [[0, 1, 2]],                                 0.082, 0.009, 0.014), delay: 0.16, liftDir:  0.72, cx:  0.73, cy:  0.47 }
    ];
  }

  // ---------------------------------------------------------------------------
  // 2. CONTORNO 3D DE KATZE (con muesca circular en oreja derecha y trazado 0%->100%)
  // ---------------------------------------------------------------------------
  function buildKatzeContour(gl) {
    const { katzeScale, katzeCenterX, katzeCenterY } = Katze3D.LAYOUT;

    const sampleQuadratic = (p0, p1, p2, steps) => {
      const pts = [];
      for (let i = 0; i < steps; i++) {
        const t = i / steps, u = 1 - t;
        pts.push([
          u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
          u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
        ]);
      }
      return pts;
    };

    const sampleCubic = (p0, p1, p2, p3, steps) => {
      const pts = [];
      for (let i = 0; i < steps; i++) {
        const t = i / steps, u = 1 - t;
        pts.push([
          u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
          u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
        ]);
      }
      return pts;
    };

    // Trazo vectorial del gato (empieza abajo del círculo para que el trazado progresivo rodee Eco)
    const cx = 65.5, cy = 84.5, radius = 65.5;
    const angleBottom    = Math.PI * 0.5;
    const angleNeck      = 2 * Math.PI - 1.204;
    const angleCheek     = 2 * Math.PI - 0.273;
    const angleBottomEnd = 2.5 * Math.PI;

    const raw = [];
    // Arco circular izquierdo y superior
    for (let i = 0; i < 72; i++) {
      const a = angleBottom + ((angleNeck - angleBottom) * i) / 72;
      raw.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }
    // Oreja izquierda
    const pNeck = [cx + radius * Math.cos(angleNeck), cy + radius * Math.sin(angleNeck)];
    raw.push(...sampleQuadratic(pNeck, [93.0, 19.0], [98.0, 16.5], 5));
    raw.push(...sampleQuadratic([98.0, 16.5], [103.5, 5.5], [113.8, 0.2], 10));
    raw.push(...sampleQuadratic([113.8, 0.2], [116.2, 8.8], [118.2, 17.6], 7));
    // Cabeza entre ambas orejas
    raw.push(...sampleCubic([118.2, 17.6], [126.5, 21.5], [133.5, 28.5], [136.0, 35.8], 11));
    // Oreja derecha con muesca circular suave (arco de 12 segmentos)
    const notchCx = 150.3, notchCy = 46.8, notchR = 4.55;
    const notchIn = -1.04, notchOut = -Math.PI - 0.88;
    const pNotchOut = [notchCx + notchR * Math.cos(notchOut), notchCy + notchR * Math.sin(notchOut)];

    raw.push(...sampleQuadratic([136.0, 35.8], [144.4, 37.3], [153.4, 39.2], 7));
    raw.push([153.4, 39.2]);
    for (let i = 0; i <= 12; i++) {
      const a = notchIn + ((notchOut - notchIn) * i) / 12;
      raw.push([notchCx + notchR * Math.cos(a), notchCy + notchR * Math.sin(a)]);
    }
    // Borde inferior de oreja derecha -> mejilla -> cierre circular inferior
    raw.push(...sampleQuadratic(pNotchOut, [143.0, 53.5], [136.6, 56.0], 6));
    const pCheek = [cx + radius * Math.cos(angleCheek), cy + radius * Math.sin(angleCheek)];
    raw.push(...sampleQuadratic([136.6, 56.0], [134.2, 62.2], pCheek, 6));
    for (let i = 0; i < 34; i++) {
      const a = angleCheek + ((angleBottomEnd - angleCheek) * i) / 34;
      raw.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }

    // Limpieza de puntos demasiado cercanos en las uniones de curvas
    const clean = [raw[0]];
    for (let i = 1; i < raw.length; i++) {
      const prev = clean[clean.length - 1];
      if (Math.hypot(raw[i][0] - prev[0], raw[i][1] - prev[1]) > 0.55) {
        clean.push(raw[i]);
      }
    }
    if (Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) <= 0.55) {
      clean.pop();
    }

    const pts = clean.map(([x, y]) => [(x - katzeCenterX) * katzeScale, (katzeCenterY - y) * katzeScale]);
    const M = pts.length;

    const tangents = new Array(M);
    const outDirs = new Array(M);
    const miterLens = new Array(M);

    for (let i = 0; i < M; i++) {
      const prev = pts[(i - 1 + M) % M], curr = pts[i], next = pts[(i + 1) % M];
      const e1x = curr[0] - prev[0], e1y = curr[1] - prev[1];
      const e2x = next[0] - curr[0], e2y = next[1] - curr[1];
      const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
      const t1x = e1x / l1, t1y = e1y / l1, t2x = e2x / l2, t2y = e2y / l2;
      const n1x = -t1y, n1y = t1x, n2x = -t2y, n2y = t2x;

      let bx = n1x + n2x, by = n1y + n2y;
      const bl = Math.hypot(bx, by);
      if (bl < 1e-5) {
        outDirs[i] = [n1x, n1y];
        miterLens[i] = 1.0;
      } else {
        bx /= bl; by /= bl;
        outDirs[i] = [bx, by];
        miterLens[i] = Math.min(1.28, 1.0 / Math.max(bx * n1x + by * n1y, 0.58));
      }

      const tx = t1x + t2x, ty = t1y + t2y, tl = Math.hypot(tx, ty) || 1;
      tangents[i] = [tx / tl, ty / tl];
    }

    // Sección transversal rectangular biselada de 8 lados (más fina en Z que Eco)
    const w = 0.022, hz = 0.092, b = 0.008;
    const profile = [
      [ w - b,  hz], [-w + b,  hz], [-w,  hz - b], [-w, -hz + b],
      [-w + b, -hz], [ w - b, -hz], [ w, -hz + b], [ w,  hz - b]
    ];
    const s2 = 0.70710678;
    const profNormals = [
      [0, 1], [-s2, s2], [-1, 0], [-s2, -s2],
      [0, -1], [s2, -s2], [1, 0], [s2, s2]
    ];

    const ringVertex = (idx, k) => {
      const p = pts[idx % M], od = outDirs[idx % M], ml = miterLens[idx % M];
      const [u, v] = profile[k];
      return [p[0] + od[0] * u * ml, p[1] + od[1] * u * ml, v];
    };

    const ringNormal = (idx, k) => {
      const od = outDirs[idx % M], [nu, nv] = profNormals[k];
      const nx = od[0] * nu, ny = od[1] * nu, nz = nv;
      const len = Math.hypot(nx, ny, nz) || 1;
      return [nx / len, ny / len, nz / len];
    };

    const builder = createMeshBuilder(gl);
    for (let s = 0; s < M; s++) {
      const next = (s + 1) % M;
      for (let k = 0; k < 8; k++) {
        const kNext = (k + 1) % 8;
        const p0 = ringVertex(s, k),    p1 = ringVertex(next, k);
        const p2 = ringVertex(next, kNext), p3 = ringVertex(s, kNext);
        const n0 = ringNormal(s, k),    n1 = ringNormal(next, k);
        builder.addQuad(p0, p3, p2, p1, n0, n0, n1, n1);
      }
    }
    const ribbonMesh = builder.upload();

    // Tapas dinámicas para que el extremo en movimiento del trazo siempre sea sólido
    const capPos = new Float32Array(48 * 3);
    const capNorm = new Float32Array(48 * 3);
    const capIdx = new Uint32Array(48);
    for (let i = 0; i < 48; i++) capIdx[i] = i;

    const capVao = gl.createVertexArray();
    gl.bindVertexArray(capVao);
    const capPosBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, capPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, capPos.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const capNormBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, capNormBuf);
    gl.bufferData(gl.ARRAY_BUFFER, capNorm.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const capIdxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, capIdxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, capIdx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const capMesh = { vao: capVao, count: 48 };

    function updateEndCaps(segCount) {
      let ptr = 0;
      const push = (a, bPt, c, n) => {
        for (const p of [a, bPt, c]) {
          capPos[ptr] = p[0]; capPos[ptr + 1] = p[1]; capPos[ptr + 2] = p[2];
          capNorm[ptr] = n[0]; capNorm[ptr + 1] = n[1]; capNorm[ptr + 2] = n[2];
          ptr += 3;
        }
      };
      const cStart = [pts[0][0], pts[0][1], 0];
      const nStart = [-tangents[0][0], -tangents[0][1], 0];
      for (let k = 0; k < 8; k++) push(cStart, ringVertex(0, (k + 1) % 8), ringVertex(0, k), nStart);

      const tip = segCount % M;
      const cTip = [pts[tip][0], pts[tip][1], 0];
      const nTip = [tangents[tip][0], tangents[tip][1], 0];
      for (let k = 0; k < 8; k++) push(cTip, ringVertex(tip, k), ringVertex(tip, (k + 1) % 8), nTip);

      gl.bindBuffer(gl.ARRAY_BUFFER, capPosBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, capPos);
      gl.bindBuffer(gl.ARRAY_BUFFER, capNormBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, capNorm);
      return capMesh;
    }

    return {
      ribbonMesh,
      getPartial(fraction) {
        const segs = Math.max(0, Math.min(M, Math.round(fraction * M)));
        if (segs <= 0) return null;
        return {
          mesh: ribbonMesh,
          countOverride: segs * 48,
          caps: segs > 0 && segs < M ? updateEndCaps(segs) : null
        };
      }
    };
  }

  // ---------------------------------------------------------------------------
  // 3. LETRAS 3D DE ODOO ('o' y 'd')
  // ---------------------------------------------------------------------------
  const ODOO_R_OUT = 0.345;
  const ODOO_R_IN  = 0.188;
  const ODOO_HALF_Z = 0.132;
  const ODOO_BEVEL_W = 0.012;
  const ODOO_BEVEL_Z = 0.018;

  function buildOdooO(gl) {
    const N = 64;
    const outer = [], hole = [], capVerts = [], capTris = [];
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N;
      outer.push([ODOO_R_OUT * Math.cos(a), ODOO_R_OUT * Math.sin(a)]);
      hole.push([ODOO_R_IN * Math.cos(-a), ODOO_R_IN * Math.sin(-a)]);
      capVerts.push([ODOO_R_OUT * Math.cos(a), ODOO_R_OUT * Math.sin(a)]);
    }
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N;
      capVerts.push([ODOO_R_IN * Math.cos(a), ODOO_R_IN * Math.sin(a)]);
      const next = (i + 1) % N;
      capTris.push([i, next, N + next], [i, N + next, N + i]);
    }
    const builder = createMeshBuilder(gl);
    addBeveledExtrusion(builder, capVerts, [outer, hole], capTris, ODOO_HALF_Z, ODOO_BEVEL_W, ODOO_BEVEL_Z, 0.82);
    return builder.upload();
  }

  function buildOdooD(gl) {
    const rOut = ODOO_R_OUT, rIn = ODOO_R_IN, stroke = rOut - rIn;
    const yJoin = Math.sqrt(rOut * rOut - rIn * rIn);
    const thetaJoin = Math.atan2(yJoin, rIn);
    const capCx = (rOut + rIn) * 0.5, capR = stroke * 0.5, yCap = 0.665;

    const nArc = 48, nStem = 12, nCap = 18;
    const outer = [];
    for (let i = 0; i <= nStem; i++) outer.push([rOut, rIn * Math.sin((thetaJoin * i) / nStem)]);
    outer.push([rOut, yJoin]);
    const capStart = outer.length;
    for (let i = 0; i <= nCap; i++) {
      const a = (Math.PI * i) / nCap;
      outer.push([capCx + capR * Math.cos(a), yCap + capR * Math.sin(a)]);
    }
    const arcStart = outer.length;
    for (let i = 0; i < nArc; i++) {
      const a = thetaJoin + ((2 * Math.PI - thetaJoin) * i) / nArc;
      outer.push([rOut * Math.cos(a), rOut * Math.sin(a)]);
    }

    const innerCCW = [];
    for (let i = 0; i < nStem; i++) {
      const a = (thetaJoin * i) / nStem;
      innerCCW.push([rIn * Math.cos(a), rIn * Math.sin(a)]);
    }
    const innerJoin = innerCCW.length;
    for (let i = 0; i < nArc; i++) {
      const a = thetaJoin + ((2 * Math.PI - thetaJoin) * i) / nArc;
      innerCCW.push([rIn * Math.cos(a), rIn * Math.sin(a)]);
    }
    const holeCW = innerCCW.slice().reverse();

    const capVerts = [...outer, ...innerCCW, [capCx, yCap]];
    const inOff = outer.length, capCenterIdx = capVerts.length - 1;
    const capTris = [];

    for (let i = 0; i < nArc; i++) {
      const o0 = arcStart + i, o1 = i + 1 < nArc ? arcStart + i + 1 : 0;
      const i0 = inOff + innerJoin + i, i1 = i + 1 < nArc ? inOff + innerJoin + i + 1 : inOff;
      capTris.push([o0, o1, i1], [o0, i1, i0]);
    }
    for (let i = 0; i < nStem; i++) capTris.push([i, i + 1, inOff + i + 1], [i, inOff + i + 1, inOff + i]);
    capTris.push([inOff + innerJoin, nStem, nStem + 1], [inOff + innerJoin, nStem + 1, arcStart]);
    capTris.push([arcStart, nStem + 1, capStart], [arcStart, capStart, capStart + nCap]);
    for (let i = 0; i < nCap; i++) capTris.push([capCenterIdx, capStart + i, capStart + i + 1]);

    const builder = createMeshBuilder(gl);
    addBeveledExtrusion(builder, capVerts, [outer, holeCW], capTris, ODOO_HALF_Z, ODOO_BEVEL_W, ODOO_BEVEL_Z, 0.80);
    return builder.upload();
  }

  // ---------------------------------------------------------------------------
  // 4. MOTOR DE MORPHING TIPO PLASTILINA (Odoo O <-> Diamante Central de Eco)
  // ---------------------------------------------------------------------------
  function createClayMorphEngine(gl) {
    const N = 72;
    const { ecoScale, odooSoloScale, odooSoloScaleZ, odooSoloY } = Katze3D.LAYOUT;
    const gOutRaw = ECO_GEM_OUTER.map(([x, y]) => [x * ecoScale, y * ecoScale]);
    const gInCCW  = ECO_GEM_HOLE.slice().reverse().map(([x, y]) => [x * ecoScale, y * ecoScale]);

    const ox = (gInCCW[0][0] + gInCCW[1][0] + gInCCW[2][0]) / 3;
    const oy = (gInCCW[0][1] + gInCCW[1][1] + gInCCW[2][1]) / 3;

    function rayIntersect(poly, angle) {
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let bestT = 1e9;
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
        const sx = x2 - x1, sy = y2 - y1;
        const denom = dx * sy - dy * sx;
        if (Math.abs(denom) < 1e-12) continue;
        const rx = x1 - ox, ry = y1 - oy;
        const t = (rx * sy - ry * sx) / denom;
        const u = (rx * dy - ry * dx) / denom;
        if (t > 0 && u >= -1e-6 && u <= 1.0 + 1e-6 && t < bestT) bestT = t;
      }
      return [ox + bestT * dx, oy + bestT * dy];
    }

    // Muestrea 72 ángulos asegurando que coincidan exactamente con las esquinas del diamante
    const twoPi = Math.PI * 2;
    const angles = Array.from({ length: N }, (_, i) => (twoPi * i) / N);
    const cornerAngles = [
      ...gOutRaw.map(([x, y]) => ((Math.atan2(y - oy, x - ox) % twoPi) + twoPi) % twoPi),
      ...gInCCW.map(([x, y]) => ((Math.atan2(y - oy, x - ox) % twoPi) + twoPi) % twoPi)
    ];
    const used = new Set();
    for (const targetAngle of cornerAngles) {
      let duplicate = false;
      for (const idx of used) {
        const diff = Math.abs(angles[idx] - targetAngle);
        if (Math.min(diff, twoPi - diff) < 0.015) { duplicate = true; break; }
      }
      if (duplicate) continue;
      let bestIdx = 0, bestDist = 1e9;
      for (let i = 0; i < N; i++) {
        if (used.has(i)) continue;
        const diff = Math.abs(angles[i] - targetAngle);
        const wrap = Math.min(diff, twoPi - diff);
        if (wrap < bestDist) { bestDist = wrap; bestIdx = i; }
      }
      angles[bestIdx] = targetAngle;
      used.add(bestIdx);
    }
    angles.sort((a, b) => a - b);

    const gemOut = angles.map(a => rayIntersect(gOutRaw, a));
    const gemIn  = angles.map(a => rayIntersect(gInCCW, a));
    const oOut   = angles.map(a => [ODOO_R_OUT * odooSoloScale * Math.cos(a), odooSoloY + ODOO_R_OUT * odooSoloScale * Math.sin(a)]);
    const oIn    = angles.map(a => [ODOO_R_IN  * odooSoloScale * Math.cos(a), odooSoloY + ODOO_R_IN  * odooSoloScale * Math.sin(a)]);

    // Buffer dinámico reutilizable (cero basura en memoria por frame)
    const maxVerts = 72 * N;
    const posArr = new Float32Array(maxVerts * 3);
    const normArr = new Float32Array(maxVerts * 3);
    const idxArr = new Uint32Array(maxVerts);
    for (let i = 0; i < maxVerts; i++) idxArr[i] = i;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, posArr.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const normBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, normArr.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    const mesh = { vao, count: maxVerts };

    function update(mOut, mIn, mColor) {
      const mAvg = 0.5 * (mOut + mIn);
      const clayWave = Math.sin(Math.PI * clamp01(mAvg));

      const curOut = new Array(N), curInCCW = new Array(N);
      for (let i = 0; i < N; i++) {
        const a = angles[i];
        const waveOut = (0.024 * Math.sin(3 * a + mAvg * 5.2) + 0.011 * Math.cos(5 * a - mAvg * 3.6)) * clayWave;
        const waveIn  = (0.015 * Math.sin(3 * a - mAvg * 4.4)) * clayWave;
        curOut[i]   = [lerp(oOut[i][0], gemOut[i][0], mOut) + Math.cos(a) * waveOut, lerp(oOut[i][1], gemOut[i][1], mOut) + Math.sin(a) * waveOut];
        curInCCW[i] = [lerp(oIn[i][0],  gemIn[i][0],  mIn)  + Math.cos(a) * waveIn,  lerp(oIn[i][1],  gemIn[i][1],  mIn)  + Math.sin(a) * waveIn];
      }
      const curInCW = curInCCW.slice().reverse();

      const halfZ = lerp(ODOO_HALF_Z * odooSoloScaleZ, 0.175 * ecoScale, mAvg) + 0.032 * clayWave;
      const bevelW = lerp(ODOO_BEVEL_W * odooSoloScale * 0.72, 0.013 * ecoScale, mAvg) * (1.0 + 1.35 * clayWave);
      const bevelZ = Math.min(halfZ * 0.46, lerp(ODOO_BEVEL_Z * odooSoloScaleZ, 0.020 * ecoScale, mAvg) * (1.0 + 1.15 * clayWave));
      const smoothCos = clayWave > 0.05 ? lerp(lerp(0.78, 0.985, mAvg), 0.25, Math.pow(clayWave, 0.7)) : lerp(0.78, 0.985, mAvg);

      let ptr = 0;
      const pushTri = (p0, p1, p2, n0, n1, n2) => {
        const pts = [p0, p1, p2], nrms = [n0, n1, n2];
        for (let t = 0; t < 3; t++) {
          posArr[ptr] = pts[t][0]; posArr[ptr + 1] = pts[t][1]; posArr[ptr + 2] = pts[t][2];
          normArr[ptr] = nrms[t][0]; normArr[ptr + 1] = nrms[t][1]; normArr[ptr + 2] = nrms[t][2];
          ptr += 3;
        }
      };
      const pushQuad = (p0, p1, p2, p3, n0, n1, n2, n3) => {
        pushTri(p0, p1, p2, n0, n1, n2);
        pushTri(p0, p2, p3, n0, n2, n3);
      };

      const nf = [0, 0, 1], nb = [0, 0, -1];
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const o0 = curOut[i], o1 = curOut[j], i0 = curInCCW[i], i1 = curInCCW[j];
        pushQuad([o0[0], o0[1], halfZ], [o1[0], o1[1], halfZ], [i1[0], i1[1], halfZ], [i0[0], i0[1], halfZ], nf, nf, nf, nf);
        pushQuad([o0[0], o0[1], -halfZ], [i0[0], i0[1], -halfZ], [i1[0], i1[1], -halfZ], [o1[0], o1[1], -halfZ], nb, nb, nb, nb);
      }

      const slices = [
        { off: 0.00, z:  halfZ,                   nz:  0.96, nxy: 0.28 },
        { off: 0.58, z:  halfZ - bevelZ * 0.32,   nz:  0.68, nxy: 0.73 },
        { off: 1.00, z:  halfZ - bevelZ,          nz:  0.22, nxy: 0.975 },
        { off: 1.00, z: -(halfZ - bevelZ),        nz: -0.22, nxy: 0.975 },
        { off: 0.58, z: -(halfZ - bevelZ * 0.32), nz: -0.68, nxy: 0.73 },
        { off: 0.00, z: -halfZ,                   nz: -0.96, nxy: 0.28 }
      ];

      for (const loop of [curOut, curInCW]) {
        const rings = slices.map(s => (s.off === 0 ? loop : offsetPolygon(loop, bevelW * s.off, 1.85)));
        const edgeN = [];
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N;
          const dx = loop[j][0] - loop[i][0], dy = loop[j][1] - loop[i][1];
          const len = Math.hypot(dx, dy) || 1;
          edgeN.push([dy / len, -dx / len]);
        }
        const getXY = (eIdx, vIdx) => {
          const ec = edgeN[eIdx], adj = edgeN[vIdx === eIdx ? (eIdx - 1 + N) % N : (eIdx + 1) % N];
          if (ec[0] * adj[0] + ec[1] * adj[1] >= smoothCos) {
            const sx = ec[0] + adj[0], sy = ec[1] + adj[1], sl = Math.hypot(sx, sy) || 1;
            return [sx / sl, sy / sl];
          }
          return ec;
        };
        const mkN = (xy, s) => {
          const vx = xy[0] * s.nxy, vy = xy[1] * s.nxy, vz = s.nz, l = Math.hypot(vx, vy, vz) || 1;
          return [vx / l, vy / l, vz / l];
        };
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N;
          const xy0 = getXY(i, i), xy1 = getXY(i, j);
          for (let s = 0; s < 5; s++) {
            const sA = slices[s], sB = slices[s + 1], rA = rings[s], rB = rings[s + 1];
            const p0 = [rA[i][0], rA[i][1], sA.z], p1 = [rB[i][0], rB[i][1], sB.z];
            const p2 = [rB[j][0], rB[j][1], sB.z], p3 = [rA[j][0], rA[j][1], sA.z];
            if (s === 2) pushQuad(p0, p1, p2, p3, [xy0[0], xy0[1], 0], [xy0[0], xy0[1], 0], [xy1[0], xy1[1], 0], [xy1[0], xy1[1], 0]);
            else pushQuad(p0, p1, p2, p3, mkN(xy0, sA), mkN(xy0, sB), mkN(xy1, sB), mkN(xy1, sA));
          }
        }
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, posArr);
      gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, normArr);

      const cT = easeInOutCubic(clamp01(mColor));
      const pMat = Katze3D.MATERIALS.odooPurple;
      const bMat = Katze3D.MATERIALS.ecoBlack;
      return {
        mesh,
        mat: {
          albedo: [lerp(pMat.albedo[0], bMat.albedo[0], cT), lerp(pMat.albedo[1], bMat.albedo[1], cT), lerp(pMat.albedo[2], bMat.albedo[2], cT)],
          roughness: lerp(pMat.roughness, bMat.roughness, cT) + 0.11 * clayWave,
          f0: lerp(pMat.f0, bMat.f0, cT) - 0.015 * clayWave
        }
      };
    }

    return { update };
  }

  // ---------------------------------------------------------------------------
  // 5. PEDESTAL Y PISO DE GALERÍA (solo para la página de exhibición)
  // ---------------------------------------------------------------------------
  function buildExhibitionStage(gl) {
    const floorY = Katze3D.LAYOUT.floorY;

    function addBeveledPlinth(builder, width, height, depth, yBottom, bevel) {
      const hw = width * 0.5, hd = depth * 0.5, y1 = yBottom + height;
      const ring = inset => {
        const w = hw - inset, d = hd - inset, c = bevel * 0.85;
        return [[w - c, d], [w, d - c], [w, -d + c], [w - c, -d], [-w + c, -d], [-w, -d + c], [-w, d - c], [-w + c, d]];
      };
      const topIn = ring(bevel), outer = ring(0), n = outer.length;
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        builder.addTriangle([0, y1, 0], [topIn[i][0], y1, topIn[i][1]], [topIn[next][0], y1, topIn[next][1]], [0, 1, 0], [0, 1, 0], [0, 1, 0]);
        builder.addTriangle([0, yBottom, 0], [outer[next][0], yBottom, outer[next][1]], [outer[i][0], yBottom, outer[i][1]], [0, -1, 0], [0, -1, 0], [0, -1, 0]);
        builder.addQuad([topIn[i][0], y1, topIn[i][1]], [outer[i][0], y1 - bevel, outer[i][1]], [outer[next][0], y1 - bevel, outer[next][1]], [topIn[next][0], y1, topIn[next][1]]);
        builder.addQuad([outer[i][0], y1 - bevel, outer[i][1]], [outer[i][0], yBottom, outer[i][1]], [outer[next][0], yBottom, outer[next][1]], [outer[next][0], y1 - bevel, outer[next][1]]);
      }
    }

    const mainBuilder = createMeshBuilder(gl);
    addBeveledPlinth(mainBuilder, 2.38, 0.14, 2.38, floorY, 0.022);
    addBeveledPlinth(mainBuilder, 1.92, 0.65, 1.92, floorY + 0.19, 0.024);

    const accentBuilder = createMeshBuilder(gl);
    addBeveledPlinth(accentBuilder, 1.82, 0.06, 1.82, floorY + 0.135, 0.010);
    addBeveledPlinth(accentBuilder, 1.42, 0.042, 1.42, floorY + 0.838, 0.012);

    const floorBuilder = createMeshBuilder(gl);
    const s = 15.0;
    floorBuilder.addQuad([-s, floorY, -s], [-s, floorY, s], [s, floorY, s], [s, floorY, -s], [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]);

    return {
      pedestalMain: mainBuilder.upload(),
      pedestalAccent: accentBuilder.upload(),
      floor: floorBuilder.upload()
    };
  }

  Katze3D.Geometries = {
    buildEcoPieces,
    buildKatzeContour,
    buildOdooO,
    buildOdooD,
    createClayMorphEngine,
    buildExhibitionStage
  };
})(window);
