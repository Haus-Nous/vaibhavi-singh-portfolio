/**
 * ============================================================================
 * A BRAIN BUILT FROM CODE — WebGL Procedural Engine (Version 2.1)
 * Anatomical Sculpting: 3/4 Lateral Silhouette · Domain-Warped Ridged Folds
 * Surface-Dominant Shell (90%) · Aspect-Preserved Micro-Tokens · Directional Shading
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Configuration & Constants
  // --------------------------------------------------------------------------
  const CONFIG = {
    desktopCount: 8200,
    mobileCount: 3400,
    atlasCols: 16,
    atlasRows: 38,
    cellWidth: 160,
    cellHeight: 28,
    // Default 3/4 Lateral View:
    // Left hemisphere lateral profile: Frontal lobe anterior (+Z), Occipital posterior (-Z),
    // Temporal lobe below Sylvian fissure, Cerebellum underneath back, Brainstem descending.
    baseAngleY: 1.08, // ~62 degrees
    baseAngleX: 0.20, // ~11.5 degrees slightly from above
    idleSwayY: 0.32,  // +/- 18 degrees max idle sway (never rotates to flat front)
    idleSwayX: 0.07,  // subtle elevation breathing
    palette: {
      baseLight: [0.92, 0.94, 0.96],      // Sculptural cool off-white (#ebf0f5)
      leftTint:  [0.84, 0.94, 0.98],      // Subtle icy cyan undertone
      rightTint: [0.97, 0.93, 0.86],      // Subtle champagne/warm silver undertone
      highlight: [1.0, 0.62, 0.48]        // Rare peach/coral impulse (#ff9e7a)
    },
    regions: [
      { id: 0, name: "RAG & RETRIEVAL", hemi: "left", label: "LOGIC / 01" },
      { id: 1, name: "AGENTS", hemi: "left", label: "LOGIC / 02" },
      { id: 2, name: "FULL-STACK", hemi: "left", label: "LOGIC / 03" },
      { id: 3, name: "DATA & ML", hemi: "right", label: "RESEARCH / 01" },
      { id: 4, name: "LLMOPS & EVALUATION", hemi: "right", label: "RESEARCH / 02" },
      { id: 5, name: "RESEARCH", hemi: "right", label: "RESEARCH / 03" }
    ]
  };

  // State Management
  const state = {
    isCalm: false,
    viewMode: 'threequarter', // 'threequarter' | 'side' | 'top'
    assemblyStartTime: 0,
    assemblyDuration: 2.2,
    hoveredHemisphere: null,
    activeRegionId: -1,
    particleCount: 0,
    fps: 60,
    frameCount: 0,
    lastTime: performance.now(),
    fpsLastCalculated: performance.now(),
    mouse: new THREE.Vector2(-999, -999),
    mouseWorldPos: new THREE.Vector3(-999, -999, -999),
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    currentRot: { x: CONFIG.baseAngleX, y: CONFIG.baseAngleY },
    targetRot: { x: CONFIG.baseAngleX, y: CONFIG.baseAngleY }
  };

  // Three.js instances
  let renderer, scene, camera;
  let brainMesh, neuralLinesMesh;
  let tokenData = [];
  let tokenAspects = [];
  let atlasTexture;
  let raycaster, planeHit;

  // --------------------------------------------------------------------------
  // Initialization Sequence
  // --------------------------------------------------------------------------
  async function init() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    // Parse URL Parameters (for testing specific angles and Calm mode)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('calm') === '1') {
      state.isCalm = true;
    }
    const viewParam = urlParams.get('view');
    if (viewParam === 'side' || viewParam === 'top' || viewParam === 'threequarter') {
      state.viewMode = viewParam;
    }

    // Check Calm Mode preference from localStorage & media query if not overridden by URL
    if (!urlParams.has('calm')) {
      try {
        const storedCalm = localStorage.getItem('code_brain_calm_mode');
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (storedCalm === 'true' || (storedCalm === null && prefersReducedMotion)) {
          state.isCalm = true;
        }
      } catch (e) {}
    }

    // Load Token Catalog
    try {
      const resp = await fetch('/data/tokens.json');
      const json = await resp.json();
      tokenData = json.tokens || [];
    } catch (e) {
      tokenData = [
        'retrieve()', 'rerank(top_k)', 'policy.authorize()', 'extract_features()',
        '0101', 'if (intent)', 'return', 'Zustand.create()', 'PrismaClient()',
        'p50_latency', 'p95_latency', 'Ollama.run()', 'Llama-3.2', 'Ragas.eval()',
        'cosine_sim()', 'norm_layer', 'FastAPI.post()', 'NextAuth.session()'
      ];
    }

    // Set particle count based on viewport
    const isMobile = window.innerWidth < 768;
    state.particleCount = isMobile ? CONFIG.mobileCount : CONFIG.desktopCount;

    // Setup WebGL Scene
    setupScene(container);

    // Build Token Texture Atlas with Aspect Preservation
    atlasTexture = createTokenAtlas(tokenData);

    // Build Anatomically-Sculpted Procedural Brain Point Cloud
    buildBrainGeometry();

    // Build Organic Neural Pathways
    buildNeuralPathways();

    // Setup Event Listeners
    setupEvents(container);

    // Apply View Mode directly to meshes and UI
    applyViewMode(state.viewMode, true);

    // If assembled=1 parameter is present, bypass the 2.2s assembly delay immediately
    state.assemblyStartTime = (urlParams.get('assembled') === '1') ? (performance.now() - 10000) : performance.now();
    updateUIElements();

    // Signal render-ready for automated tests
    document.body.classList.add('brain-initialized');

    // Immediate synchronous first render pass for screenshots
    render(performance.now());
  }

  // --------------------------------------------------------------------------
  // Camera & Scene Setup
  // --------------------------------------------------------------------------
  function setupScene(container) {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.04);

    camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.9);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x050505, 1.0);
    container.appendChild(renderer.domElement);

    raycaster = new THREE.Raycaster();
    planeHit = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  }

  function applyViewMode(mode, immediate) {
    state.viewMode = mode;
    if (mode === 'side') {
      // Pure lateral profile (looking from left side)
      state.targetRot.x = 0.0;
      state.targetRot.y = Math.PI * 0.5;
    } else if (mode === 'top') {
      // Top-down superior view looking at longitudinal fissure
      state.targetRot.x = Math.PI * 0.48;
      state.targetRot.y = 0.0;
    } else {
      // 3/4 Lateral profile
      state.targetRot.x = CONFIG.baseAngleX;
      state.targetRot.y = CONFIG.baseAngleY;
    }

    if (immediate) {
      state.currentRot.x = state.targetRot.x;
      state.currentRot.y = state.targetRot.y;
      if (brainMesh) {
        brainMesh.rotation.x = state.targetRot.x;
        brainMesh.rotation.y = state.targetRot.y;
      }
      if (neuralLinesMesh) {
        neuralLinesMesh.rotation.x = state.targetRot.x;
        neuralLinesMesh.rotation.y = state.targetRot.y;
      }
    }

    // Update active UI button
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === mode);
    });
  }

  // --------------------------------------------------------------------------
  // Token Texture Atlas Generator (Exact Aspect Preservation)
  // --------------------------------------------------------------------------
  function createTokenAtlas(tokens) {
    const cols = CONFIG.atlasCols;
    const rows = CONFIG.atlasRows;
    const cellW = CONFIG.cellWidth;
    const cellH = CONFIG.cellHeight;

    const canvas = document.createElement('canvas');
    canvas.width = cols * cellW;
    canvas.height = rows * cellH;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Crisp monospace font
    ctx.font = '600 12px "JetBrains Mono", ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    tokenAspects = [];
    const totalCells = cols * rows;

    for (let i = 0; i < totalCells; i++) {
      const token = tokens[i % tokens.length];
      const col = i % cols;
      const row = Math.floor(i / cols);

      const cellX = col * cellW;
      const cellY = row * cellH;

      const measured = ctx.measureText(token).width;
      const contentW = Math.min(cellW - 8, Math.max(20, measured + 8));
      tokenAspects.push(contentW / cellW);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(token, cellX + 4, cellY + cellH / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }

  // --------------------------------------------------------------------------
  // Domain-Warped Ridged Folds Function (Gyri and Sulci)
  // --------------------------------------------------------------------------
  function computeGyriNoise(x, y, z) {
    // Serpentine domain warping
    const wx = Math.sin(3.6 * y + 1.2) * 0.28 + Math.cos(4.0 * z + 0.6) * 0.22;
    const wy = Math.sin(3.6 * z + 0.9) * 0.28 + Math.cos(4.0 * x + 1.5) * 0.22;
    const wz = Math.sin(3.6 * x + 2.2) * 0.28 + Math.cos(4.0 * y + 0.8) * 0.22;

    const qx = x * 6.5 + wx * 3.2;
    const qy = y * 6.5 + wy * 3.2;
    const qz = z * 6.5 + wz * 3.2;

    // Multi-frequency sinusoidal interference creating winding serpentine ridges
    const f1 = Math.abs(Math.sin(qx) * Math.cos(qy) + Math.sin(qy) * Math.cos(qz) + Math.sin(qz) * Math.cos(qx));
    const f2 = Math.abs(Math.sin(qx * 1.5 + 1.4) * Math.cos(qz * 1.5));

    const raw = f1 * 0.68 + f2 * 0.32;
    // Normalize into [0.0 = deep sulcus valley, 1.0 = gyrus peak]
    const ridge = Math.min(1.0, Math.max(0.0, (raw - 0.22) / 0.85));
    return Math.pow(ridge, 1.4); // crisp winding crests
  }

  // --------------------------------------------------------------------------
  // Procedural Anatomical Brain Geometry
  // --------------------------------------------------------------------------
  function buildBrainGeometry() {
    const count = state.particleCount;

    // Base Quad Geometry
    const baseQuad = new THREE.PlaneGeometry(0.13, 0.022);
    const instancedGeo = new THREE.InstancedBufferGeometry();
    instancedGeo.index = baseQuad.index;
    instancedGeo.attributes.position = baseQuad.attributes.position;
    instancedGeo.attributes.uv = baseQuad.attributes.uv;

    // Attributes
    const initialPositions = new Float32Array(count * 3);
    const targetPositions  = new Float32Array(count * 3);
    const normals          = new Float32Array(count * 3);
    const drifts           = new Float32Array(count * 3);
    const tokenIndices     = new Float32Array(count);
    const tokenAspectAttrs = new Float32Array(count);
    const regionIds        = new Float32Array(count);
    const ridgeFactors     = new Float32Array(count);
    const surfaceTypes     = new Float32Array(count);
    const assemblyDelays   = new Float32Array(count);
    const phases           = new Float32Array(count);
    const scales           = new Float32Array(count);

    const totalAtlasTokens = CONFIG.atlasCols * CONFIG.atlasRows;

    let validCount = 0;
    let attempts = 0;
    const maxAttempts = count * 8;

    // 90% Surface Shell, 10% Interior Glow
    while (validCount < count && attempts < maxAttempts) {
      attempts++;
      const isSurface = (Math.random() < 0.90);
      const isRightHemisphere = (Math.random() < 0.5);

      const pt = generateAnatomicalPoint(isRightHemisphere, isSurface);
      if (!pt) continue;

      const i = validCount;

      // 1. Initial Chaotic Scatter Coordinates (R = 3.5 - 6.5)
      const u1 = Math.random();
      const u2 = Math.random();
      const theta = u1 * Math.PI * 2;
      const phi = Math.acos(2 * u2 - 1);
      const scatterR = 3.5 + Math.random() * 3.5;

      initialPositions[i * 3 + 0] = scatterR * Math.sin(phi) * Math.cos(theta);
      initialPositions[i * 3 + 1] = scatterR * Math.sin(phi) * Math.sin(theta);
      initialPositions[i * 3 + 2] = scatterR * Math.cos(phi);

      // 2. Sculpted Anatomical Brain Target Coordinates
      targetPositions[i * 3 + 0] = pt.x;
      targetPositions[i * 3 + 1] = pt.y;
      targetPositions[i * 3 + 2] = pt.z;

      normals[i * 3 + 0] = pt.nx;
      normals[i * 3 + 1] = pt.ny;
      normals[i * 3 + 2] = pt.nz;

      // Subtle compiling drift
      const isLoose = (Math.random() < 0.08);
      const driftMag = isLoose ? 0.18 : 0.03;
      drifts[i * 3 + 0] = (Math.random() - 0.5) * driftMag;
      drifts[i * 3 + 1] = (Math.random() - 0.5) * driftMag;
      drifts[i * 3 + 2] = (Math.random() - 0.5) * driftMag;

      const tIdx = Math.floor(Math.random() * totalAtlasTokens);
      tokenIndices[i] = tIdx;
      tokenAspectAttrs[i] = tokenAspects[tIdx] || 1.0;

      regionIds[i] = pt.regionId;
      ridgeFactors[i] = pt.ridge;
      surfaceTypes[i] = isSurface ? 1.0 : 0.0;
      assemblyDelays[i] = Math.random() * 0.8;
      phases[i] = Math.random() * Math.PI * 2;
      scales[i] = isSurface ? (0.85 + Math.random() * 0.35) : 0.50;

      validCount++;
    }

    instancedGeo.setAttribute('aInitialPos', new THREE.InstancedBufferAttribute(initialPositions, 3));
    instancedGeo.setAttribute('aTargetPos', new THREE.InstancedBufferAttribute(targetPositions, 3));
    instancedGeo.setAttribute('aNormal', new THREE.InstancedBufferAttribute(normals, 3));
    instancedGeo.setAttribute('aDrift', new THREE.InstancedBufferAttribute(drifts, 3));
    instancedGeo.setAttribute('aTokenIndex', new THREE.InstancedBufferAttribute(tokenIndices, 1));
    instancedGeo.setAttribute('aTokenAspect', new THREE.InstancedBufferAttribute(tokenAspectAttrs, 1));
    instancedGeo.setAttribute('aRegionId', new THREE.InstancedBufferAttribute(regionIds, 1));
    instancedGeo.setAttribute('aRidge', new THREE.InstancedBufferAttribute(ridgeFactors, 1));
    instancedGeo.setAttribute('aIsSurface', new THREE.InstancedBufferAttribute(surfaceTypes, 1));
    instancedGeo.setAttribute('aAssemblyDelay', new THREE.InstancedBufferAttribute(assemblyDelays, 1));
    instancedGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    instancedGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));

    // Custom Shader Material with Shading, Aspect Correction, and Depth Fade
    const brainShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlasTexture },
        uAtlasCols: { value: CONFIG.atlasCols },
        uAtlasRows: { value: CONFIG.atlasRows },
        uTime: { value: 0 },
        uAssemblyProgress: { value: 0 },
        uCalmMode: { value: state.isCalm ? 1.0 : 0.0 },
        uHoveredLeft: { value: 0.0 },
        uHoveredRight: { value: 0.0 },
        uActiveRegion: { value: -1.0 },
        uMouseWorld: { value: new THREE.Vector3(-999, -999, -999) },
        uBaseLight: { value: new THREE.Color(...CONFIG.palette.baseLight) },
        uLeftTint: { value: new THREE.Color(...CONFIG.palette.leftTint) },
        uRightTint: { value: new THREE.Color(...CONFIG.palette.rightTint) },
        uHighlight: { value: new THREE.Color(...CONFIG.palette.highlight) },
        uLightDir: { value: new THREE.Vector3(0.85, 1.25, 1.4).normalize() }
      },
      vertexShader: `
        attribute vec3 aInitialPos;
        attribute vec3 aTargetPos;
        attribute vec3 aNormal;
        attribute vec3 aDrift;
        attribute float aTokenIndex;
        attribute float aTokenAspect;
        attribute float aRegionId;
        attribute float aRidge;
        attribute float aIsSurface;
        attribute float aAssemblyDelay;
        attribute float aPhase;
        attribute float aScale;

        uniform float uTime;
        uniform float uAssemblyProgress;
        uniform float uCalmMode;
        uniform vec3 uMouseWorld;
        uniform vec3 uLightDir;
        uniform float uAtlasCols;
        uniform float uAtlasRows;

        varying vec2 vUv;
        varying float vRegionId;
        varying float vIsRight;
        varying float vRidge;
        varying float vIsSurface;
        varying float vMouseProximity;
        varying float vLightDiffuse;
        varying float vDepthFade;

        float easeOutQuint(float x) {
          return 1.0 - pow(1.0 - x, 4.0);
        }

        void main() {
          vRegionId = aRegionId;
          vIsRight = (aTargetPos.x > 0.0) ? 1.0 : 0.0;
          vRidge = aRidge;
          vIsSurface = aIsSurface;

          float p = clamp((uAssemblyProgress - aAssemblyDelay) / 1.5, 0.0, 1.0);
          float ease = easeOutQuint(p);

          vec3 currentPos = mix(aInitialPos, aTargetPos, ease);

          // Subtle breathing motion (stops in Calm mode)
          if (uCalmMode < 0.5) {
            float breath = sin(uTime * 1.2 + aPhase) * 0.007;
            currentPos += aNormal * breath;

            float driftT = sin(uTime * 0.65 + aPhase);
            currentPos += aDrift * driftT;
          }

          // Cursor proximity in 3D
          float distToCursor = distance(currentPos, uMouseWorld);
          float proximity = 1.0 - smoothstep(0.0, 0.8, distToCursor);
          vMouseProximity = proximity;

          // Directional Lighting from Surface Normal
          vec3 worldNormal = normalize(mat3(modelMatrix) * aNormal);
          float NdotL = max(0.20, dot(worldNormal, uLightDir));
          vLightDiffuse = pow(NdotL, 0.75);

          // Billboard Orientation with aspect correction
          vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 cameraUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

          float particleScale = aScale * (1.0 + proximity * 0.45);
          float quadWidth  = position.x * particleScale * aTokenAspect;
          float quadHeight = position.y * particleScale;

          vec3 finalPos = currentPos + cameraRight * quadWidth + cameraUp * quadHeight;

          vec4 mvPosition = viewMatrix * vec4(finalPos, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          // Depth Fade: Far side particles dimmer & softer
          float camZ = -mvPosition.z;
          vDepthFade = smoothstep(7.2, 3.4, camZ);

          // Texture Atlas UV Mapping (exact aspect)
          float col = mod(aTokenIndex, uAtlasCols);
          float row = floor(aTokenIndex / uAtlasCols);
          
          float subUvX = uv.x * aTokenAspect;
          vUv = vec2(
            (col + subUvX) / uAtlasCols,
            (row + (1.0 - uv.y)) / uAtlasRows
          );
        }
      `,
      fragmentShader: `
        uniform sampler2D uAtlas;
        uniform float uHoveredLeft;
        uniform float uHoveredRight;
        uniform float uActiveRegion;
        uniform float uTime;
        uniform vec3 uBaseLight;
        uniform vec3 uLeftTint;
        uniform vec3 uRightTint;
        uniform vec3 uHighlight;

        varying vec2 vUv;
        varying float vRegionId;
        varying float vIsRight;
        varying float vRidge;
        varying float vIsSurface;
        varying float vMouseProximity;
        varying float vLightDiffuse;
        varying float vDepthFade;

        void main() {
          vec4 tex = texture2D(uAtlas, vUv);
          if (tex.a < 0.12) discard;

          // Subtle hemisphere tinting (no harsh split!)
          vec3 tint = (vIsRight > 0.5) ? uRightTint : uLeftTint;
          vec3 baseColor = mix(uBaseLight, tint, 0.32);

          // Gyri ridges are bright, sulci valleys are dark grooves
          float ridgeLuminance = mix(0.20, 1.35, vRidge);

          // Shading: lit side vs shadow side
          vec3 color = baseColor * vLightDiffuse * ridgeLuminance;

          if (vIsSurface < 0.5) {
            color *= 0.35;
          }

          // Hemisphere Hover
          float hemiMod = 1.0;
          if (uHoveredLeft > 0.1) {
            hemiMod = (vIsRight < 0.5) ? 1.45 : 0.35;
          } else if (uHoveredRight > 0.1) {
            hemiMod = (vIsRight > 0.5) ? 1.45 : 0.35;
          }
          color *= hemiMod;

          // Region isolation
          if (uActiveRegion >= 0.0) {
            float matches = (abs(vRegionId - uActiveRegion) < 0.1) ? 1.8 : 0.22;
            color *= matches;
          }

          // Cursor highlight
          color = mix(color, uHighlight, vMouseProximity * 0.85);

          // Subtle network wave pulse
          float wave = sin(uTime * 1.8 - vRegionId * 1.1);
          if (wave > 0.92 && uHoveredLeft < 0.1 && uHoveredRight < 0.1) {
            color = mix(color, uHighlight, 0.35);
          }

          // Cap luminance to prevent solid white blowout
          color = min(color, vec3(1.15));

          float alpha = tex.a * (0.35 + vRidge * 0.55 + vMouseProximity * 0.3) * vDepthFade;
          if (vIsSurface < 0.5) alpha *= 0.30;

          gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    brainMesh = new THREE.Mesh(instancedGeo, brainShaderMaterial);
    brainMesh.rotation.x = state.currentRot.x;
    brainMesh.rotation.y = state.currentRot.y;

    scene.add(brainMesh);
  }

  // --------------------------------------------------------------------------
  // Anatomical Sculpting Function
  // --------------------------------------------------------------------------
  function generateAnatomicalPoint(isRight, isSurface) {
    const side = isRight ? 1.0 : -1.0;
    const roll = Math.random();

    if (roll < 0.83) {
      // ----------------------------------------------------------------------
      // 1. CEREBRUM HEMISPHERE (Frontal, Parietal, Occipital, Temporal Lobes)
      // ----------------------------------------------------------------------
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);

      // Anatomical proportions: AP length (z) = 0.98, Height (y) = 0.74, Width (x) = 0.58
      const rx = 0.58;
      const ry = 0.74;
      const rz = 0.98;

      let x = rx * Math.sin(phi) * Math.cos(theta);
      let y = ry * Math.sin(phi) * Math.sin(theta);
      let z = rz * Math.cos(phi);

      // Longitudinal Fissure Enforcement:
      // Clear deep central chasm along x = 0 (visible from top view)
      if (Math.abs(x) < 0.09) {
        if (Math.random() < 0.88) return null; // cull midline
        x = (x >= 0 ? 0.09 : -0.09) + x * 0.2;
      }

      // Frontal Lobe (+Z anterior): high rounded curve
      if (z > 0.25) {
        y += 0.09 * (z - 0.25);
      }

      // Occipital Lobe (-Z posterior): slopes downward and medially
      if (z < -0.30) {
        y -= 0.14 * Math.abs(z + 0.30);
        x *= (1.0 - 0.20 * Math.abs(z + 0.30));
      }

      // Sylvian (Lateral) Fissure & Temporal Lobe:
      // Runs diagonally on the lateral side (|x| > 0.22)
      const fissureY = -0.05 - 0.20 * z;
      const distToFissure = Math.abs(y - fissureY);

      if (Math.abs(x) > 0.20 && z > -0.35 && z < 0.45) {
        if (distToFissure < 0.11) {
          // Deep lateral groove: cull 75% to leave dark cleft
          if (Math.random() < 0.75) return null;
          x *= 0.80; // indent inward
        } else if (y < fissureY && z > -0.25) {
          // Temporal Lobe: bulges outward and anteriorly below the fissure
          x *= 1.16;
          z += 0.08;
          y -= 0.05;
        }
      }

      // Domain-Warped Ridged Folds (Gyri and Sulci)
      const ridge = computeGyriNoise(x, y, z);

      // Sulci Culling:
      // In deep sulcus valleys (ridge < 0.25), cull 75% so grooves stay dark
      if (ridge < 0.25 && Math.random() < 0.75) {
        return null;
      }

      // Surface Shell Thickness vs Interior
      let depthFactor = 1.0;
      if (isSurface) {
        depthFactor = 1.0 - Math.random() * 0.04;
      } else {
        depthFactor = 0.52 + Math.random() * 0.35;
      }

      // Ridge Physical Displacement (gyri physically project outward)
      const ridgeDisp = (ridge - 0.45) * 0.16;
      const totalR = (1.0 + ridgeDisp) * depthFactor;

      const centerOffsetX = 0.28 * side;
      x = (x * totalR) + centerOffsetX;
      y = (y * totalR) + 0.14;
      z = (z * totalR);

      // Normal
      const nx = Math.sin(phi) * Math.cos(theta) * side;
      const ny = Math.sin(phi) * Math.sin(theta);
      const nz = Math.cos(phi);

      // Region ID Assignment (6 Skill Areas)
      let regionId = 0;
      if (!isRight) {
        // Left Hemisphere: Logic / Systems
        if (y > 0.12 && z > 0.05) {
          regionId = 0; // RAG & RETRIEVAL (Frontal superior)
        } else if (z > -0.25 && y > -0.12) {
          regionId = 1; // AGENTS (Executive center)
        } else {
          regionId = 2; // FULL-STACK (Temporal & base)
        }
      } else {
        // Right Hemisphere: Research / Data
        if (y > 0.12 && z > -0.2) {
          regionId = 3; // DATA & ML (Parietal computational)
        } else if (y > -0.12 && z > -0.3) {
          regionId = 4; // LLMOPS & EVALUATION (Lateral monitoring)
        } else {
          regionId = 5; // RESEARCH (Occipital exploratory)
        }
      }

      return { x, y, z, nx, ny, nz, regionId, ridge };

    } else if (roll < 0.95) {
      // ----------------------------------------------------------------------
      // 2. CEREBELLUM (Twin Lobes Tucked Under Posterior Occipital)
      // ----------------------------------------------------------------------
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * Math.PI;

      const crx = 0.35;
      const cry = 0.24;
      const crz = 0.32;

      // Fine horizontal folia ridges
      const foliaNoise = Math.abs(Math.sin(30.0 * v)) * 0.05;
      const ridge = 0.65 + foliaNoise * 3.0;

      const depth = isSurface ? (1.0 - Math.random() * 0.05) : 0.70;

      const x = ((crx * Math.sin(v) * Math.cos(u) + foliaNoise) * depth) + (0.24 * side);
      const y = (cry * Math.sin(v) * Math.sin(u) * depth) - 0.46;
      const z = (crz * Math.cos(v) * depth) - 0.58;

      return {
        x, y, z,
        nx: Math.sin(v) * Math.cos(u) * side,
        ny: Math.sin(v) * Math.sin(u) - 0.2,
        nz: Math.cos(v) - 0.3,
        regionId: isRight ? 5 : 2,
        ridge: Math.min(1.0, ridge)
      };

    } else {
      // ----------------------------------------------------------------------
      // 3. BRAINSTEM (Descending Central Stalk)
      // ----------------------------------------------------------------------
      const stemH = Math.random();
      const stemAngle = Math.random() * Math.PI * 2;
      const stemR = 0.12 * (1.0 - stemH * 0.32);

      const x = stemR * Math.cos(stemAngle) + (0.02 * side);
      const y = -0.42 - (stemH * 0.48);
      const z = stemR * Math.sin(stemAngle) - 0.15;

      return {
        x, y, z,
        nx: Math.cos(stemAngle),
        ny: -0.3,
        nz: Math.sin(stemAngle),
        regionId: isRight ? 4 : 1,
        ridge: 0.7
      };
    }
  }

  // --------------------------------------------------------------------------
  // Organic Neural Pathways
  // --------------------------------------------------------------------------
  function buildNeuralPathways() {
    const pathwayCount = 12;
    const pointsPerCurve = 32;
    const linePositions = [];
    const lineColors = [];

    const teal = new THREE.Color(0.28, 0.48, 0.54);
    const champagne = new THREE.Color(0.85, 0.78, 0.65);

    for (let c = 0; c < pathwayCount; c++) {
      const isRight = (c % 2 === 0);
      const startSide = isRight ? 0.35 : -0.35;

      const p0 = new THREE.Vector3(
        startSide + (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5) * 0.5 + 0.1,
        (Math.random() - 0.5) * 0.5
      );

      const angle = (c / pathwayCount) * Math.PI * 2;
      const reachR = 1.5 + Math.random() * 0.7;
      const p1 = new THREE.Vector3(
        p0.x * 1.4 + Math.cos(angle) * reachR * 0.5,
        p0.y * 1.2 + (Math.random() - 0.5) * 0.6,
        p0.z * 1.4 + Math.sin(angle) * reachR * 0.5
      );

      const p2 = new THREE.Vector3(
        p1.x * 1.3 + (Math.random() - 0.5) * 0.5,
        p1.y + (Math.random() - 0.5) * 0.6,
        p1.z * 1.3 + (Math.random() - 0.5) * 0.5
      );

      const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
      const pts = curve.getPoints(pointsPerCurve);

      for (let j = 0; j < pts.length - 1; j++) {
        linePositions.push(pts[j].x, pts[j].y, pts[j].z);
        linePositions.push(pts[j + 1].x, pts[j + 1].y, pts[j + 1].z);

        const alpha = 1.0 - (j / pts.length);
        const col = isRight ? champagne : teal;

        lineColors.push(col.r * alpha, col.g * alpha, col.b * alpha);
        lineColors.push(col.r * alpha, col.g * alpha, col.b * alpha);
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending
    });

    neuralLinesMesh = new THREE.LineSegments(lineGeo, lineMat);
    neuralLinesMesh.rotation.x = state.currentRot.x;
    neuralLinesMesh.rotation.y = state.currentRot.y;

    scene.add(neuralLinesMesh);
  }

  // --------------------------------------------------------------------------
  // Event Listeners & Interaction
  // --------------------------------------------------------------------------
  function setupEvents(container) {
    window.addEventListener('resize', onResize);

    // Mouse Tracking & Dragging
    window.addEventListener('mousemove', (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(state.mouse, camera);
      const intersection = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeHit, intersection);
      if (intersection) {
        state.mouseWorldPos.copy(intersection);
      }

      if (state.isDragging) {
        const deltaX = e.clientX - state.dragStart.x;
        const deltaY = e.clientY - state.dragStart.y;

        state.targetRot.y += deltaX * 0.005;
        state.targetRot.x += deltaY * 0.004;
        state.targetRot.x = Math.max(-0.6, Math.min(0.6, state.targetRot.x));

        state.dragStart = { x: e.clientX, y: e.clientY };
      }
    });

    container.addEventListener('mousedown', (e) => {
      state.isDragging = true;
      state.dragStart = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      state.isDragging = false;
    });

    // Touch Support
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        state.isDragging = true;
        state.dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (state.isDragging && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - state.dragStart.x;
        const deltaY = e.touches[0].clientY - state.dragStart.y;

        state.targetRot.y += deltaX * 0.005;
        state.targetRot.x += deltaY * 0.004;
        state.targetRot.x = Math.max(-0.6, Math.min(0.6, state.targetRot.x));

        state.dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      state.isDragging = false;
    });

    // Calm Mode Button
    const btnCalm = document.getElementById('btn-calm');
    if (btnCalm) {
      btnCalm.addEventListener('click', toggleCalmMode);
    }

    // Reset Assembly Button
    const btnResetAssembly = document.getElementById('btn-reset-assembly');
    if (btnResetAssembly) {
      btnResetAssembly.addEventListener('click', () => {
        state.assemblyStartTime = performance.now();
      });
    }

    // View Mode Buttons (Side, Top, 3/4)
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        applyViewMode(view, false);
      });
    });

    // Hemisphere Focus Tags
    const tagLeft = document.getElementById('hemi-tag-left');
    const tagRight = document.getElementById('hemi-tag-right');

    if (tagLeft) {
      tagLeft.addEventListener('mouseenter', () => setHoveredHemisphere('left'));
      tagLeft.addEventListener('mouseleave', () => setHoveredHemisphere(null));
      tagLeft.addEventListener('click', () => setHoveredHemisphere(state.hoveredHemisphere === 'left' ? null : 'left'));
    }

    if (tagRight) {
      tagRight.addEventListener('mouseenter', () => setHoveredHemisphere('right'));
      tagRight.addEventListener('mouseleave', () => setHoveredHemisphere(null));
      tagRight.addEventListener('click', () => setHoveredHemisphere(state.hoveredHemisphere === 'right' ? null : 'right'));
    }

    // Region Filter Buttons
    document.querySelectorAll('.region-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const regionId = parseInt(btn.getAttribute('data-region'), 10);
        if (state.activeRegionId === regionId) {
          state.activeRegionId = -1;
          document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
        } else {
          state.activeRegionId = regionId;
          document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
        if (brainMesh) {
          brainMesh.material.uniforms.uActiveRegion.value = state.activeRegionId;
        }
      });
    });
  }

  function onResize() {
    const container = document.getElementById('canvas-container');
    if (!container || !renderer || !camera) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  function setHoveredHemisphere(hemi) {
    state.hoveredHemisphere = hemi;
    const tagLeft = document.getElementById('hemi-tag-left');
    const tagRight = document.getElementById('hemi-tag-right');

    if (tagLeft) tagLeft.classList.toggle('highlighted', hemi === 'left');
    if (tagRight) tagRight.classList.toggle('highlighted', hemi === 'right');
  }

  function toggleCalmMode() {
    state.isCalm = !state.isCalm;
    try {
      localStorage.setItem('code_brain_calm_mode', state.isCalm ? 'true' : 'false');
    } catch (e) {}

    updateUIElements();

    if (brainMesh) {
      brainMesh.material.uniforms.uCalmMode.value = state.isCalm ? 1.0 : 0.0;
    }
  }

  function updateUIElements() {
    const btnCalm = document.getElementById('btn-calm');
    if (btnCalm) {
      btnCalm.classList.toggle('active', state.isCalm);
      btnCalm.querySelector('.calm-state-text').textContent = state.isCalm ? 'CALM (ON)' : 'CALM (OFF)';
    }

    const countElem = document.getElementById('metric-particle-count');
    if (countElem) {
      countElem.textContent = state.particleCount.toLocaleString();
    }

    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === state.viewMode);
    });
  }

  // --------------------------------------------------------------------------
  // Main Render Loop
  // --------------------------------------------------------------------------
  function render(now) {
    requestAnimationFrame(render);

    const delta = (now - state.lastTime) * 0.001;
    state.lastTime = now;

    // Rolling FPS calculation
    state.frameCount++;
    if (now - state.fpsLastCalculated >= 1000) {
      state.fps = Math.round((state.frameCount * 1000) / (now - state.fpsLastCalculated));
      state.frameCount = 0;
      state.fpsLastCalculated = now;

      const fpsElem = document.getElementById('metric-fps');
      if (fpsElem) fpsElem.textContent = state.fps;

      if (window.location.search.includes('measureFps=1') && !state.hasReportedFps && state.fps > 0) {
        state.hasReportedFps = true;
        fetch('/report-fps?fps=' + state.fps).catch(() => {});
      }
    }

    // Assembly Progression
    const elapsedAssembly = (now - state.assemblyStartTime) * 0.001;
    const assemblyFactor = Math.min(elapsedAssembly, state.assemblyDuration);

    // Camera Angle & Idle Sway
    let curBaseY = CONFIG.baseAngleY;
    let curBaseX = CONFIG.baseAngleX;
    if (state.viewMode === 'side') {
      curBaseY = Math.PI * 0.5;
      curBaseX = 0.0;
    } else if (state.viewMode === 'top') {
      curBaseY = 0.0;
      curBaseX = Math.PI * 0.48;
    }

    if (!state.isCalm) {
      if (!state.isDragging) {
        const t = now * 0.001;
        state.targetRot.y = curBaseY + Math.sin(t * 0.42) * CONFIG.idleSwayY;
        state.targetRot.x = curBaseX + Math.sin(t * 0.28) * CONFIG.idleSwayX;
      }
    } else {
      if (!state.isDragging) {
        state.targetRot.y = curBaseY;
        state.targetRot.x = curBaseX;
      }
    }

    // Smooth Damping to Target Rotation
    state.currentRot.y += (state.targetRot.y - state.currentRot.y) * 0.12;
    state.currentRot.x += (state.targetRot.x - state.currentRot.x) * 0.12;

    if (brainMesh) {
      brainMesh.rotation.y = state.currentRot.y;
      brainMesh.rotation.x = state.currentRot.x;
    }

    if (neuralLinesMesh) {
      neuralLinesMesh.rotation.y = state.currentRot.y;
      neuralLinesMesh.rotation.x = state.currentRot.x;
    }

    // Uniform Updates
    if (brainMesh) {
      const uniforms = brainMesh.material.uniforms;
      uniforms.uTime.value = now * 0.001;
      uniforms.uAssemblyProgress.value = assemblyFactor;
      uniforms.uMouseWorld.value.copy(state.mouseWorldPos);

      const targetLeft = (state.hoveredHemisphere === 'left') ? 1.0 : 0.0;
      const targetRight = (state.hoveredHemisphere === 'right') ? 1.0 : 0.0;

      uniforms.uHoveredLeft.value += (targetLeft - uniforms.uHoveredLeft.value) * 0.12;
      uniforms.uHoveredRight.value += (targetRight - uniforms.uHoveredRight.value) * 0.12;
    }

    if (neuralLinesMesh && !state.isCalm) {
      neuralLinesMesh.material.opacity = 0.22 + Math.sin(now * 0.002) * 0.10;
    }

    renderer.render(scene, camera);
  }

  // --------------------------------------------------------------------------
  // Public Debug API for Headless Captures & Diagnostics
  // --------------------------------------------------------------------------
  window.BrainPrototype = {
    getMetrics: () => ({
      fps: state.fps,
      particleCount: state.particleCount,
      isCalm: state.isCalm,
      viewMode: state.viewMode
    }),
    setView: (view) => applyViewMode(view, true),
    toggleCalm: toggleCalmMode,
    setHoveredHemisphere: setHoveredHemisphere,
    getCanvas: () => renderer ? renderer.domElement : null
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
