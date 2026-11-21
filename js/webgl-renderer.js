/**
 * webgl-renderer.js
 * Motor PBR ligero en WebGL2 (Cook-Torrance GGX + iluminación de estudio).
 * Soporta dos modos:
 *   - 'exhibition': fondo hueso de galería + pedestal + sombras suaves PCF (2048x2048)
 *   - 'transparent': fondo 100% transparente sin pedestal (ideal para incrustar en cualquier web)
 */
(function (global) {
  'use strict';

  const Katze3D = (global.Katze3D = global.Katze3D || {});
  const { Math3D } = Katze3D;

  const SHADOW_VS = `#version 300 es
  precision highp float;
  layout(location = 0) in vec3 aPos;
  uniform mat4 uLightMVP;
  void main() {
    gl_Position = uLightMVP * vec4(aPos, 1.0);
  }`;

  const SHADOW_FS = `#version 300 es
  precision highp float;
  void main() {}`;

  const MAIN_VS = `#version 300 es
  precision highp float;
  layout(location = 0) in vec3 aPos;
  layout(location = 1) in vec3 aNormal;

  uniform mat4 uModel;
  uniform mat4 uViewProj;
  uniform mat3 uNormalMat;
  uniform mat4 uLightSpace;

  out vec3 vWorldPos;
  out vec3 vLocalPos;
  out vec3 vNormal;
  out vec4 vLightSpacePos;

  void main() {
    vec4 worldPos = uModel * vec4(aPos, 1.0);
    vWorldPos = worldPos.xyz;
    vLocalPos = aPos;
    vNormal = normalize(uNormalMat * aNormal);
    vLightSpacePos = uLightSpace * worldPos;
    gl_Position = uViewProj * worldPos;
  }`;

  const MAIN_FS = `#version 300 es
  precision highp float;

  in vec3 vWorldPos;
  in vec3 vLocalPos;
  in vec3 vNormal;
  in vec4 vLightSpacePos;

  uniform vec3 uCamPos;
  uniform vec3 uAlbedo;
  uniform float uRoughness;
  uniform float uF0;
  uniform int uMatType;        // 0 = logo cerámico, 1 = pedestal, 2 = placa, 3 = piso
  uniform float uLogoHeight;
  uniform float uUseShadows;   // 1.0 en exhibición, 0.0 en modo transparente
  uniform float uDarkTone;     // 1.0 para fondos oscuros (realza el brillo de contorno)
  uniform vec3 uBgColor;
  uniform sampler2D uShadowMap;

  out vec4 fragColor;

  const float PI = 3.14159265359;

  // Ruido 3D sutil para textura cerámica / piedra mate
  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  // Sombras suaves PCF de 16 muestras
  float sampleSoftShadow(vec4 lightSpacePos, vec3 N, vec3 L) {
    if (uUseShadows < 0.5) return 1.0;
    vec3 proj = (lightSpacePos.xyz / lightSpacePos.w) * 0.5 + 0.5;
    if (proj.x < 0.01 || proj.x > 0.99 || proj.y < 0.01 || proj.y > 0.99 || proj.z > 1.0) return 1.0;

    float bias = max(0.0022 * (1.0 - dot(N, L)), 0.00075);
    vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
    float spread = (uMatType == 3) ? 2.6 : 2.1;

    const vec2 disk[16] = vec2[16](
      vec2(-0.94201624, -0.39906216), vec2( 0.94558609, -0.76890725),
      vec2(-0.09418410, -0.92938870), vec2( 0.34495938,  0.29387760),
      vec2(-0.91588581,  0.45771432), vec2(-0.81544232, -0.87912464),
      vec2(-0.38277543,  0.27676845), vec2( 0.97484398,  0.75648379),
      vec2( 0.44323325, -0.97511554), vec2( 0.53742981, -0.47373420),
      vec2(-0.26496911, -0.41893023), vec2( 0.79197514,  0.19090188),
      vec2(-0.24188840,  0.99706507), vec2(-0.81409955,  0.91437590),
      vec2( 0.19984126,  0.78641367), vec2( 0.14383161, -0.14100790)
    );

    float lit = 0.0;
    for (int i = 0; i < 16; i++) {
      float depth = texture(uShadowMap, proj.xy + disk[i] * texel * spread).r;
      lit += (proj.z - bias <= depth) ? 1.0 : 0.0;
    }
    return lit / 16.0;
  }

  float ggxDistribution(float NoH, float a) {
    float a2 = a * a;
    float d = (NoH * NoH) * (a2 - 1.0) + 1.0;
    return a2 / (PI * d * d + 1e-6);
  }

  float schlickGeometry(float NoV, float k) {
    return NoV / (NoV * (1.0 - k) + k + 1e-6);
  }

  vec3 evaluateLight(vec3 N, vec3 V, vec3 L, vec3 lightColor, vec3 albedo, float rough, float F0) {
    float NoL = max(dot(N, L), 0.0);
    if (NoL <= 0.0) return vec3(0.0);

    vec3 H = normalize(V + L);
    float NoV = max(dot(N, V), 0.001);
    float NoH = max(dot(N, H), 0.0);
    float VoH = max(dot(V, H), 0.0);

    float D = ggxDistribution(NoH, rough * rough);
    float k = ((rough + 1.0) * (rough + 1.0)) * 0.125;
    float G = schlickGeometry(NoV, k) * schlickGeometry(NoL, k);
    float F = F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);

    vec3 specular = vec3((D * G * F) / (4.0 * NoV * NoL + 1e-4));
    vec3 diffuse  = (1.0 - F) * albedo / PI;
    return (diffuse + specular) * lightColor * NoL;
  }

  vec3 acesToneMap(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 albedo = uAlbedo;
    float rough = uRoughness;
    float F0 = uF0;

    if (uMatType == 0) {
      float grain = noise3(vLocalPos * 76.0) * 0.6 + noise3(vLocalPos * 175.0) * 0.4;
      rough = clamp(uRoughness + (grain - 0.5) * 0.055, 0.34, 0.62);
      vec3 microN = vec3(
        noise3(vLocalPos * 120.0 + vec3(13.1, 0.0, 0.0)) - 0.5,
        noise3(vLocalPos * 120.0 + vec3(0.0, 27.4, 0.0)) - 0.5,
        noise3(vLocalPos * 120.0 + vec3(0.0, 0.0, 41.7)) - 0.5
      );
      N = normalize(N + microN * 0.011);
      // En fondos oscuros subimos ligeramente F0 y albedo base para siluetear el negro mate
      albedo += vec3(0.010, 0.011, 0.013) * uDarkTone;
      F0 += 0.022 * uDarkTone;
    } else if (uMatType == 1 || uMatType == 2) {
      float stone = noise3(vWorldPos * 18.0) * 0.6 + noise3(vWorldPos * 52.0) * 0.4;
      albedo *= (0.98 + stone * 0.04);
      rough = clamp(uRoughness + (stone - 0.5) * 0.05, 0.58, 0.92);
    }

    // Iluminación de estudio de 3 puntos
    vec3 keyDir  = normalize(vec3(0.50, 1.32, 0.42));
    vec3 rimDir  = normalize(vec3(-0.84, 0.48, -0.68));
    vec3 fillDir = normalize(vec3(-0.62, 0.42, 0.78));

    float shadow = sampleSoftShadow(vLightSpacePos, N, keyDir);
    float shadowFactor = mix((uMatType == 3) ? 0.36 : 0.22, 1.0, shadow);

    vec3 color = vec3(0.0);
    color += evaluateLight(N, V, keyDir,  vec3(1.00, 0.985, 0.96) * mix(2.20, 2.50, uDarkTone), albedo, rough, F0) * shadowFactor;
    color += evaluateLight(N, V, rimDir,  vec3(0.86, 0.915, 1.00) * mix(0.95, 1.85, uDarkTone), albedo, rough, F0);
    color += evaluateLight(N, V, fillDir, vec3(0.96, 0.945, 0.92) * mix(0.44, 0.72, uDarkTone), albedo, rough, F0);

    // Reflejos suaves de softbox de galería (clave para resaltar biseles en negro mate)
    vec3 R = reflect(-V, N);
    float NoV = max(dot(N, V), 0.001);
    float fresnel = F0 + (1.0 - F0) * pow(1.0 - NoV, 4.2);
    vec3 hemi = mix(vec3(0.76, 0.72, 0.67), vec3(0.95, 0.94, 0.92), N.y * 0.5 + 0.5);
    color += albedo * hemi * mix(0.68, 0.85, uDarkTone);

    float topBox   = smoothstep(0.40, 0.94, R.y) * smoothstep(0.82, 0.15, length(R.xz));
    float softCard = pow(max(dot(R, normalize(vec3( 0.72, 0.48,  0.50))), 0.0), mix(20.0, 5.0, rough));
    float coolCard = pow(max(dot(R, normalize(vec3(-0.78, 0.36, -0.50))), 0.0), mix(16.0, 4.0, rough));
    float rimBand  = pow(1.0 - abs(R.y), 3.0) * 0.22;

    vec3 envSpec = vec3(0.98, 0.97, 0.95) * topBox * 0.36
                 + vec3(1.00, 0.98, 0.95) * softCard * 0.54
                 + vec3(0.84, 0.90, 0.98) * coolCard * mix(0.50, 0.95, uDarkTone)
                 + vec3(0.90, 0.87, 0.82) * rimBand;

    color += envSpec * fresnel * mix(1.0, 0.22, rough * rough);
    color += vec3(0.85, 0.90, 0.98) * pow(1.0 - NoV, 3.2) * uDarkTone * 0.48;

    // Rebote cálido del pedestal y sombras de contacto en modo exhibición
    if (uMatType == 0 && uUseShadows > 0.5) {
      float underBounce = max(-N.y, 0.0) * smoothstep(1.3, -0.5, vWorldPos.y);
      color += vec3(0.095, 0.088, 0.078) * underBounce * 0.30;
    }

    if (uMatType == 1 || uMatType == 2) {
      if (N.y > 0.7 && vWorldPos.y > -0.92) {
        float dist = length(vWorldPos.xz);
        float spread = 0.62 + uLogoHeight * 0.30;
        float strength = 0.24 - uLogoHeight * 0.12;
        color *= (1.0 - strength * exp(-(dist * dist) / (spread * spread)));
      }
      color *= mix(0.82, 1.0, smoothstep(0.0, 0.16, max(vWorldPos.y - (-1.68), 0.0)));
    }

    if (uMatType == 3) {
      vec2 boxDist = abs(vWorldPos.xz) - vec2(1.19);
      color *= mix(0.76, 1.0, smoothstep(0.0, 0.54, length(max(boxDist, 0.0))));
      vec3 mapped = pow(acesToneMap(color), vec3(1.0 / 2.2));
      float fade = smoothstep(2.8, 9.2, length(vWorldPos.xz));
      fragColor = vec4(mix(mapped, uBgColor, fade), 1.0);
      return;
    }

    fragColor = vec4(pow(acesToneMap(color), vec3(1.0 / 2.2)), 1.0);
  }`;

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function linkProgram(gl, vsSource, fsSource) {
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  function createRenderer(canvas, options = {}) {
    const transparent = Boolean(options.transparent);
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: transparent,
      premultipliedAlpha: transparent,
      powerPreference: 'high-performance'
    });
    if (!gl) return null;

    const mainProg = linkProgram(gl, MAIN_VS, MAIN_FS);
    const shadowProg = transparent ? null : linkProgram(gl, SHADOW_VS, SHADOW_FS);

    // Shadow map de 2048x2048 solo en modo exhibición
    const SHADOW_SIZE = 2048;
    let shadowTex = null, shadowFBO = null;
    if (!transparent) {
      shadowTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      shadowFBO = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      // Textura dummy 1x1 para mantener el sampler2D válido sin sombras
      shadowTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    }

    const uShadowMVP = shadowProg ? gl.getUniformLocation(shadowProg, 'uLightMVP') : null;
    const u = {
      model:      gl.getUniformLocation(mainProg, 'uModel'),
      viewProj:   gl.getUniformLocation(mainProg, 'uViewProj'),
      normalMat:  gl.getUniformLocation(mainProg, 'uNormalMat'),
      lightSpace: gl.getUniformLocation(mainProg, 'uLightSpace'),
      camPos:     gl.getUniformLocation(mainProg, 'uCamPos'),
      albedo:     gl.getUniformLocation(mainProg, 'uAlbedo'),
      roughness:  gl.getUniformLocation(mainProg, 'uRoughness'),
      f0:         gl.getUniformLocation(mainProg, 'uF0'),
      matType:    gl.getUniformLocation(mainProg, 'uMatType'),
      logoHeight: gl.getUniformLocation(mainProg, 'uLogoHeight'),
      useShadows: gl.getUniformLocation(mainProg, 'uUseShadows'),
      darkTone:   gl.getUniformLocation(mainProg, 'uDarkTone'),
      bgColor:    gl.getUniformLocation(mainProg, 'uBgColor'),
      shadowMap:  gl.getUniformLocation(mainProg, 'uShadowMap')
    };

    const lightView = Math3D.lookAt([3.8, 10.2, 3.2], [0.0, -0.2, 0.0], [0, 1, 0]);
    const lightSpace = Math3D.multiply(Math3D.orthographic(-3.8, 3.8, -3.8, 3.8, 2.0, 20.0), lightView);
    const identity = Math3D.identity();
    const identityNorm = Math3D.normalMatrix3(identity);
    const BG_SRGB = [239 / 255, 236 / 255, 230 / 255];

    function drawMesh(mesh, countOverride) {
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, countOverride !== undefined ? countOverride : mesh.count, gl.UNSIGNED_INT, 0);
    }

    function renderFrame({ dynamicItems, stage, cam, targetY, floatWave, darkTone = 0 }) {
      const width = canvas.width;
      const height = canvas.height;

      // Paso 1: Mapa de sombras (solo en modo exhibición con pedestal)
      if (!transparent && stage) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFBO);
        gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.clear(gl.DEPTH_BUFFER_BIT);

        gl.useProgram(shadowProg);
        for (const item of dynamicItems) {
          gl.uniformMatrix4fv(uShadowMVP, false, Math3D.multiply(lightSpace, item.model));
          drawMesh(item.mesh, item.countOverride);
        }
        gl.uniformMatrix4fv(uShadowMVP, false, lightSpace);
        drawMesh(stage.pedestalMain);
        drawMesh(stage.pedestalAccent);
      }

      // Paso 2: Render principal
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      if (transparent) {
        gl.clearColor(0, 0, 0, 0);
      } else {
        gl.clearColor(BG_SRGB[0], BG_SRGB[1], BG_SRGB[2], 1.0);
      }
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const aspect = width / height;
      const halfH = aspect < 0.95 ? (cam.zoom * 0.95) / aspect : cam.zoom;
      const halfW = halfH * aspect;
      const proj = Math3D.orthographic(-halfW, halfW, -halfH, halfH, 0.1, 40.0);

      const camDist = 14.0;
      const target = [0.0, targetY, 0.0];
      const camPos = [
        target[0] + camDist * Math.cos(cam.elev) * Math.sin(cam.azim),
        target[1] + camDist * Math.sin(cam.elev),
        target[2] + camDist * Math.cos(cam.elev) * Math.cos(cam.azim)
      ];
      const viewProj = Math3D.multiply(proj, Math3D.lookAt(camPos, target, [0, 1, 0]));

      gl.useProgram(mainProg);
      gl.uniformMatrix4fv(u.viewProj, false, viewProj);
      gl.uniformMatrix4fv(u.lightSpace, false, lightSpace);
      gl.uniform3fv(u.camPos, camPos);
      gl.uniform3fv(u.bgColor, BG_SRGB);
      gl.uniform1f(u.logoHeight, floatWave * 0.5 + 0.5);
      gl.uniform1f(u.useShadows, transparent ? 0.0 : 1.0);
      gl.uniform1f(u.darkTone, darkTone);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);
      gl.uniform1i(u.shadowMap, 0);

      if (!transparent && stage) {
        gl.uniformMatrix4fv(u.model, false, identity);
        gl.uniformMatrix3fv(u.normalMat, false, identityNorm);

        // Piso
        gl.uniform3f(u.albedo, 0.87, 0.85, 0.815);
        gl.uniform1f(u.roughness, 0.92);
        gl.uniform1f(u.f0, 0.02);
        gl.uniform1i(u.matType, 3);
        drawMesh(stage.floor);

        // Pedestal alabastro
        gl.uniform3f(u.albedo, 0.89, 0.865, 0.825);
        gl.uniform1f(u.roughness, 0.78);
        gl.uniform1f(u.f0, 0.035);
        gl.uniform1i(u.matType, 1);
        drawMesh(stage.pedestalMain);

        // Placa superior y ranura
        gl.uniform3f(u.albedo, 0.72, 0.695, 0.655);
        gl.uniform1f(u.roughness, 0.68);
        gl.uniform1f(u.f0, 0.04);
        gl.uniform1i(u.matType, 2);
        drawMesh(stage.pedestalAccent);
      }

      // Piezas 3D de los logos
      gl.uniform1i(u.matType, 0);
      for (const item of dynamicItems) {
        gl.uniformMatrix4fv(u.model, false, item.model);
        gl.uniformMatrix3fv(u.normalMat, false, Math3D.normalMatrix3(item.model));
        gl.uniform3f(u.albedo, item.mat.albedo[0], item.mat.albedo[1], item.mat.albedo[2]);
        gl.uniform1f(u.roughness, item.mat.roughness);
        gl.uniform1f(u.f0, item.mat.f0);
        drawMesh(item.mesh, item.countOverride);
      }
    }

    return { gl, renderFrame };
  }

  Katze3D.createRenderer = createRenderer;
})(window);
