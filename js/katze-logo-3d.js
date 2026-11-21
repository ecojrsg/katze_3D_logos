/**
 * katze-logo-3d.js
 * Web Component reutilizable y sin librerías externas para mostrar cualquiera
 * de los 4 logos (sin base y con fondo 100% transparente) o la animación completa.
 *
 * Requiere cargar antes:
 *   <script src="js/math3d.js"></script>
 *   <script src="js/logo-geometries.js"></script>
 *   <script src="js/webgl-renderer.js"></script>
 *   <script src="js/choreography.js"></script>
 *   <script src="js/katze-logo-3d.js"></script>
 *
 * Uso:
 *   <katze-logo-3d model="eco"      style="width: 260px; height: 260px;"></katze-logo-3d>
 *   <katze-logo-3d model="katze"    style="width: 260px; height: 260px;"></katze-logo-3d>
 *   <katze-logo-3d model="odoo"     style="width: 320px; height: 240px;"></katze-logo-3d>
 *   <katze-logo-3d model="o"        style="width: 260px; height: 260px;"></katze-logo-3d>
 *   <katze-logo-3d model="showcase" style="width: 320px; height: 320px;"></katze-logo-3d>
 */
(function (global) {
  'use strict';

  if (customElements.get('katze-logo-3d')) return;

  const MODEL_TO_INDEX = { eco: 0, katze: 1, odoo: 2, o: 3 };

  class KatzeLogo3DElement extends HTMLElement {
    static get observedAttributes() {
      return ['model', 'tone', 'speed', 'float', 'zoom', 'hold', 'interactive', 'paused', 'grain', 'grain-strength', 'grain-scale'];
    }

    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: 'open' });
      this._shadow.innerHTML = `
        <style>
          :host {
            display: inline-block;
            width: 280px;
            height: 280px;
            position: relative;
            contain: layout style size;
          }
          canvas {
            width: 100%;
            height: 100%;
            display: block;
            touch-action: none;
            user-select: none;
          }
          canvas.interactive { cursor: grab; }
          canvas.dragging { cursor: grabbing; }
        </style>
        <canvas aria-label="Logo 3D isométrico"></canvas>
      `;

      const { ISO_AZIMUTH, ISO_ELEVATION } = global.Katze3D;
      this._canvas = this._shadow.querySelector('canvas');
      this._cam = {
        azim: ISO_AZIMUTH, elev: ISO_ELEVATION, zoom: 1.45,
        targetAzim: ISO_AZIMUTH, targetElev: ISO_ELEVATION, targetZoom: 1.45
      };

      this._animTime = 0;
      this._lastTs = 0;
      this._rafId = null;
      this._visible = true;
      this._dragging = false;

      // Estado del ciclo cuando model="showcase"
      this._fromExhibit = 0;
      this._currentExhibit = 0;
      this._transProgress = 1.0;
      this._holdTimer = 0.0;
    }

    connectedCallback() {
      this._syncAttributes();

      this._renderer = global.Katze3D.createRenderer(this._canvas, { transparent: true });
      if (!this._renderer) return;
      this._director = global.Katze3D.createDirector(this._renderer.gl);

      this._bindPointerEvents();

      this._resizeObs = new ResizeObserver(() => this._resize());
      this._resizeObs.observe(this);
      this._resize();

      this._interObs = new IntersectionObserver(entries => {
        this._visible = entries[0] ? entries[0].isIntersecting : true;
        if (this._visible) this._startLoop();
        else this._stopLoop();
      }, { threshold: 0.01 });
      this._interObs.observe(this);

      this._startLoop();
    }

    disconnectedCallback() {
      this._stopLoop();
      if (this._resizeObs) this._resizeObs.disconnect();
      if (this._interObs) this._interObs.disconnect();
    }

    attributeChangedCallback() {
      this._syncAttributes();
    }

    // API pública simple
    pause() { this.setAttribute('paused', ''); }
    play()  { this.removeAttribute('paused'); }

    resetView() {
      const { ISO_AZIMUTH, ISO_ELEVATION } = global.Katze3D;
      const twoPi = Math.PI * 2;
      this._cam.targetAzim = ISO_AZIMUTH + Math.round((this._cam.targetAzim - ISO_AZIMUTH) / twoPi) * twoPi;
      this._cam.targetElev = ISO_ELEVATION;
      this._cam.targetZoom = this._defaultZoom;
    }

    setExhibit(index) {
      if (index < 0 || index > 3) return;
      this._fromExhibit = this._currentExhibit;
      this._currentExhibit = index;
      this._transProgress = 0.0;
      this._holdTimer = 0.0;
    }

    _syncAttributes() {
      const modelAttr = (this.getAttribute('model') || 'eco').toLowerCase();
      this._isShowcase = modelAttr === 'showcase';

      if (!this._isShowcase) {
        const idx = MODEL_TO_INDEX[modelAttr] !== undefined ? MODEL_TO_INDEX[modelAttr] : 0;
        this._fromExhibit = idx;
        this._currentExhibit = idx;
        this._transProgress = 1.0;
      }

      const autoZoom = modelAttr === 'odoo' ? 1.55 : modelAttr === 'o' ? 1.15 : 1.40;
      const customZoom = parseFloat(this.getAttribute('zoom'));
      this._defaultZoom = Number.isFinite(customZoom) ? customZoom : autoZoom;
      this._cam.targetZoom = this._defaultZoom;

      const parsedSpeed = parseFloat(this.getAttribute('speed'));
      this._speed = Number.isFinite(parsedSpeed) ? parsedSpeed : 0.44;

      const parsedFloat = parseFloat(this.getAttribute('float'));
      this._floatAmp = Number.isFinite(parsedFloat) ? parsedFloat : 1.0;

      const parsedHold = parseFloat(this.getAttribute('hold'));
      this._holdDuration = Number.isFinite(parsedHold) ? parsedHold : 4.5;

      this._darkTone = this.getAttribute('tone') === 'dark' ? 1.0 : 0.0;
      this._grainMode = (this.getAttribute('grain') || 'riso').toLowerCase();
      const parsedGrain = parseFloat(this.getAttribute('grain-strength'));
      this._grainStrength = Number.isFinite(parsedGrain) ? Math.max(0, Math.min(1, parsedGrain)) : 0.65;
      const parsedScale = parseFloat(this.getAttribute('grain-scale'));
      this._grainScale = Number.isFinite(parsedScale) ? Math.max(0.6, Math.min(3.0, parsedScale)) : 1.35;
      this._interactive = this.getAttribute('interactive') !== 'false';
      this._paused = this.hasAttribute('paused');

      this._canvas.classList.toggle('interactive', this._interactive);
      this._canvas.style.pointerEvents = this._interactive ? 'auto' : 'none';
    }

    _bindPointerEvents() {
      let lastX = 0, lastY = 0;
      this._canvas.addEventListener('pointerdown', e => {
        if (!this._interactive) return;
        this._dragging = true;
        lastX = e.clientX; lastY = e.clientY;
        this._canvas.classList.add('dragging');
        this._canvas.setPointerCapture(e.pointerId);
      });
      this._canvas.addEventListener('pointermove', e => {
        if (!this._dragging) return;
        this._cam.targetAzim -= (e.clientX - lastX) * 0.008;
        this._cam.targetElev = Math.max(-1.2, Math.min(1.4, this._cam.targetElev + (e.clientY - lastY) * 0.007));
        lastX = e.clientX; lastY = e.clientY;
      });
      const end = e => {
        if (!this._dragging) return;
        this._dragging = false;
        this._canvas.classList.remove('dragging');
        try { this._canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      };
      this._canvas.addEventListener('pointerup', end);
      this._canvas.addEventListener('pointercancel', end);
      this._canvas.addEventListener('dblclick', () => { if (this._interactive) this.resetView(); });
    }

    _resize() {
      const rect = this.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (this._canvas.width !== w || this._canvas.height !== h) {
        this._canvas.width = w;
        this._canvas.height = h;
      }
    }

    _startLoop() {
      if (this._rafId !== null) return;
      this._lastTs = performance.now();
      const tick = now => {
        this._rafId = requestAnimationFrame(tick);
        this._render(now);
      };
      this._rafId = requestAnimationFrame(tick);
    }

    _stopLoop() {
      if (this._rafId !== null) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    }

    _render(now) {
      if (!this._renderer || !this._visible) return;
      const dt = Math.min((now - this._lastTs) * 0.001, 0.05);
      this._lastTs = now;

      if (!this._paused) {
        this._animTime += dt;
        if (this._isShowcase) {
          if (this._transProgress < 1.0) {
            const dur = this._director.getTransitionDuration(this._fromExhibit, this._currentExhibit);
            this._transProgress = Math.min(1.0, this._transProgress + dt / dur);
          } else {
            this._holdTimer += dt;
            if (this._holdTimer >= this._holdDuration) {
              this.setExhibit((this._currentExhibit + 1) % 4);
            }
          }
        }
      }

      const damp = 1 - Math.exp(-9.0 * dt);
      this._cam.azim += (this._cam.targetAzim - this._cam.azim) * damp;
      this._cam.elev += (this._cam.targetElev - this._cam.elev) * damp;
      this._cam.zoom += (this._cam.targetZoom - this._cam.zoom) * damp;

      const floatWave = Math.sin(this._animTime * 1.15) * this._floatAmp;
      const dynamicItems = this._director.buildFrame({
        fromExhibit: this._fromExhibit,
        currentExhibit: this._currentExhibit,
        progress: this._transProgress,
        baseY: 0.0,
        floatWave,
        rotationY: this._animTime * this._speed
      });

      this._renderer.renderFrame({
        dynamicItems,
        stage: null,
        cam: this._cam,
        targetY: 0.0,
        floatWave,
        darkTone: this._darkTone,
        grain: {
          mode: this._grainMode,
          strength: this._grainStrength,
          scale: this._grainScale,
          time: this._animTime
        }
      });
    }
  }

  customElements.define('katze-logo-3d', KatzeLogo3DElement);
})(window);
