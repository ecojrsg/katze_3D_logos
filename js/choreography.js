/**
 * choreography.js
 * Coreografía limpia y legible de las 4 piezas y sus transiciones:
 *   0 = Eco       (negro mate, 5 capas)
 *   1 = Katze     (Eco se encoge y el contorno 3D del gato con muesca circular se dibuja alrededor)
 *   2 = Odoo      (palabra completa #714B67 y #8F8F8F)
 *   3 = Odoo · O  (las 3 letras grises salen volando; luego la O se moldea como plastilina hacia Eco)
 */
(function (global) {
  'use strict';

  const Katze3D = (global.Katze3D = global.Katze3D || {});
  const { Math3D, Easing, MATERIALS, LAYOUT, Geometries } = Katze3D;
  const { clamp01, lerp, easeInCubic, easeOutCubic, easeInOutCubic, easeOutBack } = Easing;

  const ODOO_WORD_X = [
    -1.5 * LAYOUT.odooStep,
    -0.5 * LAYOUT.odooStep,
     0.5 * LAYOUT.odooStep,
     1.5 * LAYOUT.odooStep
  ];

  function createDirector(gl) {
    const ecoPieces    = Geometries.buildEcoPieces(gl);
    const katzeContour = Geometries.buildKatzeContour(gl);
    const odooOMesh    = Geometries.buildOdooO(gl);
    const odooDMesh    = Geometries.buildOdooD(gl);
    const clayMorph    = Geometries.createClayMorphEngine(gl);

    // Devuelve la duración ideal para cada tipo de transición
    function getTransitionDuration(fromIndex, toIndex) {
      const isClayMorph = (fromIndex === 3 && toIndex === 0) || (fromIndex === 0 && toIndex === 3);
      const isKatzeDraw = (fromIndex === 0 && toIndex === 1) || (fromIndex === 1 && toIndex === 0);
      if (isClayMorph) return 1.75;
      if (isKatzeDraw) return 1.45;
      return 1.30;
    }

    // Construye la lista de mallas a dibujar en el frame actual
    function buildFrame({ fromExhibit, currentExhibit, progress, baseY, floatWave, rotationY }) {
      const items = [];
      const logoY = baseY + floatWave * 0.070;
      const p = clamp01(progress);

      const wordScale = LAYOUT.odooWordScale;
      const soloScale = LAYOUT.odooSoloScale;
      const soloScaleZ = LAYOUT.odooSoloScaleZ;
      const wordY = LAYOUT.odooWordY;
      const soloY = LAYOUT.odooSoloY;
      const wordOX = ODOO_WORD_X[0] * wordScale;

      // -- Helpers locales legibles -------------------------------------------

      function pushEco(mode, prog, opts = {}) {
        const baseScale = opts.scale !== undefined ? opts.scale : LAYOUT.ecoScale;
        const offX = opts.x || 0;
        const offY = opts.y || 0;
        const spinOffset = mode === 'exit'
          ? easeInCubic(prog) * 0.55
          : mode === 'enter'
            ? -(1 - easeOutCubic(prog)) * 0.55
            : 0;

        const root = Math3D.multiply(Math3D.translate(0, logoY, 0), Math3D.rotateY(rotationY + (opts.rotOffset || 0) + spinOffset));

        for (const piece of ecoPieces) {
          let sc = baseScale;
          let lift = 0;
          if (mode === 'enter') {
            const tp = clamp01((prog - piece.delay) / 0.78);
            if (tp <= 0.001) continue;
            sc = baseScale * Math.max(0.001, easeOutBack(tp));
            lift = (1 - easeOutCubic(tp)) * (0.35 + piece.liftDir * 0.28);
          } else if (mode === 'exit') {
            const tp = clamp01((prog - (0.16 - piece.delay)) / 0.78);
            if (tp >= 0.999) continue;
            sc = baseScale * Math.max(0.001, 1 - easeInCubic(tp));
            lift = easeInCubic(tp) * (0.42 + piece.liftDir * 0.25);
          }
          const local = Math3D.multiply(Math3D.translate(offX, offY + lift, 0), Math3D.scale(sc, sc, sc));
          items.push({ mesh: piece.mesh, model: Math3D.multiply(root, local), mat: MATERIALS.ecoBlack });
        }
      }

      function pushKatzeOutline(drawFraction, opts = {}) {
        if (drawFraction <= 0.004) return;
        const partial = katzeContour.getPartial(drawFraction);
        if (!partial) return;

        const sc = opts.scale !== undefined ? opts.scale : 1.0;
        const model = Math3D.multiply(
          Math3D.translate(0, logoY + (opts.lift || 0), 0),
          Math3D.multiply(Math3D.rotateY(rotationY + (opts.rotOffset || 0)), Math3D.scale(sc, sc, sc))
        );
        items.push({ mesh: partial.mesh, countOverride: partial.countOverride, model, mat: MATERIALS.ecoBlack });
        if (partial.caps) {
          items.push({ mesh: partial.caps, model, mat: MATERIALS.ecoBlack });
        }
      }

      function pushOdoo(purpleState, grayStates) {
        const group = Math3D.multiply(Math3D.translate(0, logoY, 0), Math3D.rotateY(rotationY + (purpleState.rotOffset || 0)));

        if (purpleState.scale > 0.004) {
          const sz = purpleState.scaleZ !== undefined ? purpleState.scaleZ : purpleState.scale;
          const m = Math3D.multiply(group, Math3D.multiply(Math3D.translate(purpleState.x, purpleState.y, 0), Math3D.scale(purpleState.scale, purpleState.scale, sz)));
          items.push({ mesh: odooOMesh, model: m, mat: MATERIALS.odooPurple });
        }

        const grayMeshes = [odooDMesh, odooOMesh, odooOMesh];
        for (let i = 0; i < 3; i++) {
          const st = grayStates[i];
          if (!st || st.scale <= 0.004) continue;
          let local = Math3D.translate(st.x, st.y, st.z || 0);
          if (st.tilt) local = Math3D.multiply(local, Math3D.rotateZ(st.tilt));
          local = Math3D.multiply(local, Math3D.scale(st.scale, st.scale, st.scale));
          items.push({ mesh: grayMeshes[i], model: Math3D.multiply(group, local), mat: MATERIALS.odooGray });
        }
      }

      // -- Estado estable (sin transición activa) -----------------------------
      if (p >= 0.999) {
        if (currentExhibit === 0) {
          pushEco('hold', 1);
        } else if (currentExhibit === 1) {
          pushEco('hold', 1, { scale: LAYOUT.katzeInnerScale, x: LAYOUT.katzeInnerX, y: LAYOUT.katzeInnerY });
          pushKatzeOutline(1.0);
        } else if (currentExhibit === 2) {
          pushOdoo(
            { x: wordOX, y: wordY, scale: wordScale },
            [1, 2, 3].map(idx => ({ x: ODOO_WORD_X[idx] * wordScale, y: wordY, scale: wordScale }))
          );
        } else {
          pushOdoo({ x: 0, y: soloY, scale: soloScale, scaleZ: soloScaleZ }, [null, null, null]);
        }
        return items;
      }

      // -- Transición 01 Eco -> 02 Katze (trazado progresivo del contorno 3D) -
      if (fromExhibit === 0 && currentExhibit === 1) {
        const shrinkT = easeInOutCubic(clamp01(p / 0.62));
        pushEco('hold', 1, {
          scale: lerp(LAYOUT.ecoScale, LAYOUT.katzeInnerScale, shrinkT),
          x: lerp(0, LAYOUT.katzeInnerX, shrinkT),
          y: lerp(0, LAYOUT.katzeInnerY, shrinkT)
        });
        pushKatzeOutline(easeInOutCubic(clamp01((p - 0.14) / 0.86)));
        return items;
      }

      // -- Transición inversa 02 Katze -> 01 Eco ------------------------------
      if (fromExhibit === 1 && currentExhibit === 0) {
        pushKatzeOutline(1.0 - easeInOutCubic(clamp01(p / 0.72)));
        const growT = easeInOutCubic(clamp01((p - 0.24) / 0.76));
        pushEco('hold', 1, {
          scale: lerp(LAYOUT.katzeInnerScale, LAYOUT.ecoScale, growT),
          x: lerp(LAYOUT.katzeInnerX, 0, growT),
          y: lerp(LAYOUT.katzeInnerY, 0, growT)
        });
        return items;
      }

      // -- Transición 03 Odoo -> 04 O (las 3 letras grises se van volando) ----
      if (fromExhibit === 2 && currentExhibit === 3) {
        const oT = easeInOutCubic(clamp01((p - 0.18) / 0.82));
        const purpleState = {
          x: lerp(wordOX, 0, oT),
          y: lerp(wordY, soloY, oT) + Math.sin(oT * Math.PI) * 0.07,
          scale: lerp(wordScale, soloScale, oT),
          scaleZ: lerp(wordScale, soloScaleZ, oT)
        };
        const delays = [0.10, 0.05, 0.00];
        const grayStates = [1, 2, 3].map((idx, i) => {
          const out = easeInCubic(clamp01((p - delays[i]) / 0.52));
          return {
            x: ODOO_WORD_X[idx] * wordScale + out * (0.55 + i * 0.22),
            y: wordY + out * (0.62 + i * 0.10),
            z: -out * 0.28,
            scale: wordScale * Math.max(0, 1 - out),
            tilt: -out * (0.35 + i * 0.12)
          };
        });
        pushOdoo(purpleState, grayStates);
        return items;
      }

      // -- Transición inversa 04 O -> 03 Odoo (las 3 letras regresan) ---------
      if (fromExhibit === 3 && currentExhibit === 2) {
        const oT = easeInOutCubic(clamp01(p / 0.76));
        const purpleState = {
          x: lerp(0, wordOX, oT),
          y: lerp(soloY, wordY, oT) + Math.sin(oT * Math.PI) * 0.06,
          scale: lerp(soloScale, wordScale, oT),
          scaleZ: lerp(soloScaleZ, wordScale, oT)
        };
        const delays = [0.24, 0.32, 0.40];
        const grayStates = [1, 2, 3].map((idx, i) => {
          const lt = clamp01((p - delays[i]) / 0.56);
          if (lt <= 0.001) return null;
          const inv = 1 - easeOutCubic(lt);
          return {
            x: ODOO_WORD_X[idx] * wordScale + inv * (0.52 + i * 0.18),
            y: wordY + inv * (0.54 + i * 0.08),
            z: -inv * 0.24,
            scale: wordScale * Math.max(0, easeOutBack(lt)),
            tilt: -inv * 0.28
          };
        });
        pushOdoo(purpleState, grayStates);
        return items;
      }

      // -- Transición 04 O -> 01 Eco (morphing tipo plastilina + brote de piezas)
      if (fromExhibit === 3 && currentExhibit === 0) {
        const mOut = easeInOutCubic(clamp01(p / 0.68));
        const mIn  = easeInOutCubic(clamp01((p - 0.08) / 0.66));
        const mCol = clamp01((p - 0.04) / 0.64);
        const morphed = clayMorph.update(mOut, mIn, mCol);

        const clayLift = Math.sin(Math.PI * clamp01(p / 0.74)) * 0.055;
        const clayModel = Math3D.multiply(Math3D.translate(0, logoY + clayLift, 0), Math3D.rotateY(rotationY));
        items.push({ mesh: morphed.mesh, model: clayModel, mat: morphed.mat });

        const outerRoot = Math3D.multiply(Math3D.translate(0, logoY, 0), Math3D.rotateY(rotationY));
        for (let i = 1; i < ecoPieces.length; i++) {
          const piece = ecoPieces[i];
          const startAt = 0.58 + (i - 1) * 0.045;
          const tp = clamp01((p - startAt) / (1.0 - startAt));
          if (tp <= 0.001) continue;
          const sc = Math.max(0.001, easeOutBack(tp));
          const inv = 1 - easeOutCubic(tp);
          const cx = piece.cx * LAYOUT.ecoScale, cy = piece.cy * LAYOUT.ecoScale;
          const local = Math3D.multiply(
            Math3D.translate(cx * (1 + inv * 0.18), cy * (1 + inv * 0.18) + inv * 0.10, 0),
            Math3D.multiply(Math3D.scale(sc, sc, sc), Math3D.multiply(Math3D.translate(-cx, -cy, 0), Math3D.scale(LAYOUT.ecoScale, LAYOUT.ecoScale, LAYOUT.ecoScale)))
          );
          items.push({ mesh: piece.mesh, model: Math3D.multiply(outerRoot, local), mat: MATERIALS.ecoBlack });
        }
        return items;
      }

      // -- Transición inversa 01 Eco -> 04 O (plastilina en reversa) ----------
      if (fromExhibit === 0 && currentExhibit === 3) {
        const outerRoot = Math3D.multiply(Math3D.translate(0, logoY, 0), Math3D.rotateY(rotationY));
        for (let i = 1; i < ecoPieces.length; i++) {
          const piece = ecoPieces[i];
          const delay = (ecoPieces.length - 1 - i) * 0.04;
          const tp = clamp01((p - delay) / 0.34);
          if (tp >= 0.999) continue;
          const out = easeInCubic(tp);
          const sc = Math.max(0.001, 1 - out);
          const cx = piece.cx * LAYOUT.ecoScale, cy = piece.cy * LAYOUT.ecoScale;
          const local = Math3D.multiply(
            Math3D.translate(cx * (1 + out * 0.22), cy * (1 + out * 0.22) + out * 0.14, 0),
            Math3D.multiply(Math3D.scale(sc, sc, sc), Math3D.multiply(Math3D.translate(-cx, -cy, 0), Math3D.scale(LAYOUT.ecoScale, LAYOUT.ecoScale, LAYOUT.ecoScale)))
          );
          items.push({ mesh: piece.mesh, model: Math3D.multiply(outerRoot, local), mat: MATERIALS.ecoBlack });
        }

        const mOut = 1.0 - easeInOutCubic(clamp01((p - 0.18) / 0.74));
        const mIn  = 1.0 - easeInOutCubic(clamp01((p - 0.26) / 0.72));
        const mCol = 1.0 - clamp01((p - 0.22) / 0.70);
        const morphed = clayMorph.update(mOut, mIn, mCol);
        const clayLift = Math.sin(Math.PI * clamp01((p - 0.18) / 0.82)) * 0.055;
        items.push({ mesh: morphed.mesh, model: Math3D.multiply(Math3D.translate(0, logoY + clayLift, 0), Math3D.rotateY(rotationY)), mat: morphed.mat });
        return items;
      }

      // -- Cambio general (ej. 02 Katze -> 03 Odoo o saltos directos entre pestañas)
      const exitP = clamp01(p / 0.50);
      const enterP = clamp01((p - 0.36) / 0.64);

      if (exitP < 0.999) {
        if (fromExhibit === 0) {
          pushEco('exit', exitP);
        } else if (fromExhibit === 1) {
          const out = easeInCubic(exitP);
          pushKatzeOutline(1.0 - easeInOutCubic(clamp01(exitP * 1.15)), { lift: out * 0.40, rotOffset: out * 0.45 });
          pushEco('exit', exitP, { scale: LAYOUT.katzeInnerScale, x: LAYOUT.katzeInnerX, y: LAYOUT.katzeInnerY });
        } else if (fromExhibit === 2) {
          const out = easeInCubic(exitP);
          const sc = wordScale * Math.max(0, 1 - out);
          pushOdoo(
            { x: wordOX, y: wordY + out * 0.55, scale: sc, rotOffset: out * 0.45 },
            [1, 2, 3].map((idx, i) => ({ x: ODOO_WORD_X[idx] * wordScale, y: wordY + out * (0.55 + (i + 1) * 0.06), scale: sc }))
          );
        } else if (fromExhibit === 3) {
          const out = easeInCubic(exitP);
          pushOdoo(
            { x: 0, y: soloY + out * 0.55, scale: soloScale * Math.max(0, 1 - out), scaleZ: soloScaleZ * Math.max(0, 1 - out), rotOffset: out * 0.50 },
            [null, null, null]
          );
        }
      }

      if (enterP > 0.001) {
        if (currentExhibit === 0) {
          pushEco('enter', enterP);
        } else if (currentExhibit === 1) {
          pushEco('enter', clamp01(enterP / 0.72), { scale: LAYOUT.katzeInnerScale, x: LAYOUT.katzeInnerX, y: LAYOUT.katzeInnerY });
          pushKatzeOutline(easeInOutCubic(clamp01((enterP - 0.10) / 0.90)));
        } else if (currentExhibit === 2) {
          const oT = clamp01(enterP / 0.72);
          const purpleState = {
            x: wordOX,
            y: wordY + (1 - easeOutCubic(oT)) * 0.48,
            scale: wordScale * Math.max(0, easeOutBack(oT)),
            rotOffset: -(1 - easeOutCubic(enterP)) * 0.35
          };
          const grayStates = [1, 2, 3].map((idx, i) => {
            const lt = clamp01((enterP - (i + 1) * 0.09) / 0.68);
            if (lt <= 0.001) return null;
            return { x: ODOO_WORD_X[idx] * wordScale, y: wordY + (1 - easeOutCubic(lt)) * 0.48, scale: wordScale * Math.max(0, easeOutBack(lt)) };
          });
          pushOdoo(purpleState, grayStates);
        } else if (currentExhibit === 3) {
          const eb = Math.max(0, easeOutBack(enterP));
          pushOdoo(
            { x: 0, y: soloY + (1 - easeOutCubic(enterP)) * 0.45, scale: soloScale * eb, scaleZ: soloScaleZ * eb, rotOffset: -(1 - easeOutCubic(enterP)) * 0.45 },
            [null, null, null]
          );
        }
      }

      return items;
    }

    return { buildFrame, getTransitionDuration };
  }

  Katze3D.createDirector = createDirector;
})(window);
