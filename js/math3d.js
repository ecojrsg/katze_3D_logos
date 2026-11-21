/**
 * math3d.js
 * Utilidades claras y legibles de matrices 4x4 (orden column-major para WebGL2)
 * y curvas de suavizado (easing) para las animaciones 3D.
 */
(function (global) {
  'use strict';

  const Katze3D = (global.Katze3D = global.Katze3D || {});

  // ---------------------------------------------------------------------------
  // Matrices 4x4 y 3x3 para transformaciones 3D
  // ---------------------------------------------------------------------------
  const Math3D = {
    identity() {
      const m = new Float32Array(16);
      m[0] = 1;
      m[5] = 1;
      m[10] = 1;
      m[15] = 1;
      return m;
    },

    multiply(a, b) {
      const out = new Float32Array(16);
      for (let col = 0; col < 4; col++) {
        const b0 = b[col * 4 + 0];
        const b1 = b[col * 4 + 1];
        const b2 = b[col * 4 + 2];
        const b3 = b[col * 4 + 3];

        out[col * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
        out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
        out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
        out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
      }
      return out;
    },

    translate(x, y, z) {
      const m = this.identity();
      m[12] = x;
      m[13] = y;
      m[14] = z;
      return m;
    },

    rotateY(radians) {
      const m = this.identity();
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      m[0] = cos;
      m[8] = sin;
      m[2] = -sin;
      m[10] = cos;
      return m;
    },

    rotateZ(radians) {
      const m = this.identity();
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      m[0] = cos;
      m[4] = -sin;
      m[1] = sin;
      m[5] = cos;
      return m;
    },

    scale(sx, sy, sz) {
      const m = this.identity();
      m[0] = sx;
      m[5] = sy;
      m[10] = sz;
      return m;
    },

    // Proyección ortográfica (clave para la vista isométrica real sin distorsión de perspectiva)
    orthographic(left, right, bottom, top, near, far) {
      const m = new Float32Array(16);
      const invW = 1 / (right - left);
      const invH = 1 / (top - bottom);
      const invD = 1 / (far - near);

      m[0] = 2 * invW;
      m[5] = 2 * invH;
      m[10] = -2 * invD;
      m[12] = -(right + left) * invW;
      m[13] = -(top + bottom) * invH;
      m[14] = -(far + near) * invD;
      m[15] = 1;
      return m;
    },

    lookAt(eye, target, up) {
      let zx = eye[0] - target[0];
      let zy = eye[1] - target[1];
      let zz = eye[2] - target[2];
      const zLen = Math.hypot(zx, zy, zz) || 1;
      zx /= zLen; zy /= zLen; zz /= zLen;

      let xx = up[1] * zz - up[2] * zy;
      let xy = up[2] * zx - up[0] * zz;
      let xz = up[0] * zy - up[1] * zx;
      const xLen = Math.hypot(xx, xy, xz) || 1;
      xx /= xLen; xy /= xLen; xz /= xLen;

      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx;

      const m = new Float32Array(16);
      m[0] = xx; m[4] = xy; m[8]  = xz; m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
      m[1] = yx; m[5] = yy; m[9]  = yz; m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
      m[2] = zx; m[6] = zy; m[10] = zz; m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
      m[15] = 1;
      return m;
    },

    // Inversa transpuesta 3x3 para transformar normales correctamente incluso con escala no uniforme
    normalMatrix3(model) {
      const a00 = model[0], a01 = model[1], a02 = model[2];
      const a10 = model[4], a11 = model[5], a12 = model[6];
      const a20 = model[8], a21 = model[9], a22 = model[10];

      const b01 = a22 * a11 - a12 * a21;
      const b11 = -a22 * a10 + a12 * a20;
      const b21 = a21 * a10 - a11 * a20;
      const det = a00 * b01 + a01 * b11 + a02 * b21;
      if (!det) return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

      const inv = 1.0 / det;
      return new Float32Array([
        b01 * inv, (-a22 * a01 + a02 * a21) * inv, (a12 * a01 - a02 * a11) * inv,
        b11 * inv, (a22 * a00 - a02 * a20) * inv,  (-a12 * a00 + a02 * a10) * inv,
        b21 * inv, (-a21 * a00 + a01 * a20) * inv, (a11 * a00 - a01 * a10) * inv
      ]);
    }
  };

  // ---------------------------------------------------------------------------
  // Funciones de suavizado (Easing) para animaciones fluidas
  // ---------------------------------------------------------------------------
  const Easing = {
    clamp01(value) {
      return Math.max(0, Math.min(1, value));
    },
    lerp(start, end, t) {
      return start + (end - start) * t;
    },
    easeInCubic(t) {
      return t * t * t;
    },
    easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    },
    easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    easeOutBack(t) {
      const overshoot = 1.35;
      const c3 = overshoot + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
    }
  };

  // Ángulos isométricos clásicos (35.264° elevación, 45° azimut)
  Katze3D.ISO_ELEVATION = Math.asin(1 / Math.sqrt(3));
  Katze3D.ISO_AZIMUTH = Math.PI / 4;
  Katze3D.Math3D = Math3D;
  Katze3D.Easing = Easing;
})(window);
