/**
 * ============================================================================
 * A BRAIN BUILT FROM CODE — WebGL Real Anatomical Engine (Version 3.0)
 * Anatomical Mesh Sampling (CC BY 4.0 Detailed Human Brain) · Curvature Sulci/Gyri
 * Tangent-Aligned Micro-Tokens · Faint Curving Pathways · Lateral / Top Views
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Configuration & Constants
  // --------------------------------------------------------------------------
  const CONFIG = {
    desktopShapeDots: 32000,   // Layer (a): 32k tiny dots defining silhouette & folds
    mobileShapeDots: 12000,
    desktopCodeTokens: 1800,   // Layer (b): 1.8k legible tokens on gyri crests
    mobileCodeTokens: 800,
    atlasCols: 16,
    atlasRows: 38,
    cellWidth: 192,
    cellHeight: 32,

    // Anatomical Camera View Modes (Mesh Centered at Origin):
    // - Side View: Pure lateral (Frontal on left, cerebellum/brainstem at back-bottom)
    // - 3/4 View: Lateral profile angled ~25° toward viewer, slight elevation
    // - Top View: Superior looking down, showing longitudinal fissure
    views: {
      side:         { ry: 1.5708, rx: 0.0, swayY: 0.17, swayX: 0.03 },
      threequarter: { ry: 1.12,   rx: 0.18, swayY: 0.18, swayX: 0.05 },
      top:          { ry: 0.0,    rx: 1.50, swayY: 0.08, swayX: 0.03 }
    },

    palette: {
      baseLight: [0.93, 0.95, 0.97],      // Sculptural cool off-white (#edf2f7)
      leftTint:  [0.82, 0.94, 0.98],      // Subtle icy cyan undertone
      rightTint: [0.97, 0.93, 0.85],      // Subtle champagne/warm silver undertone
      highlight: [1.0, 0.60, 0.45]        // Rare peach/coral impulse (#ff9973)
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
    isDebugMesh: false,
    viewMode: 'side', // 'side' (default) | 'threequarter' | 'top'
    assemblyStartTime: 0,
    assemblyDuration: 2.2,
    hoveredHemisphere: null,
    activeRegionId: -1,
    particleCount: 0,
    shapeDotCount: 0,
    codeTokenCount: 0,
    fps: 60,
    frameCount: 0,
    lastTime: performance.now(),
    fpsLastCalculated: performance.now(),
    mouse: new THREE.Vector2(-999, -999),
    mouseWorldPos: new THREE.Vector3(-999, -999, -999),
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    currentRot: { x: CONFIG.views.side.rx, y: CONFIG.views.side.ry },
    targetRot: { x: CONFIG.views.side.rx, y: CONFIG.views.side.ry },
    hasReportedFps: false
  };

  // Three.js instances
  let renderer, scene, camera;
  let brainMesh, shapePointsMesh, neuralLinesMesh, debugMesh;
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

    // Parse URL Parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('calm') === '1') {
      state.isCalm = true;
    }
    if (urlParams.get('debug') === 'mesh') {
      state.isDebugMesh = true;
    }
    const viewParam = urlParams.get('view');
    if (CONFIG.views[viewParam]) {
      state.viewMode = viewParam;
    }

    if (!urlParams.has('calm')) {
      try {
        const storedCalm = localStorage.getItem('code_brain_calm_mode');
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (storedCalm === 'true' || (storedCalm === null && prefersReducedMotion)) {
          state.isCalm = true;
        }
      } catch (e) {}
    }

    // Determine Particle Density for Two Layers:
    const isMobile = window.innerWidth < 768;
    state.shapeDotCount = isMobile ? CONFIG.mobileShapeDots : CONFIG.desktopShapeDots;
    state.codeTokenCount = isMobile ? CONFIG.mobileCodeTokens : CONFIG.desktopCodeTokens;
    state.particleCount = state.shapeDotCount + state.codeTokenCount;

    // Setup Three.js Core
    setupScene(container);

    // Load Tokens & Create Texture Atlas
    tokenData = await loadTokens();
    atlasTexture = createTokenAtlas(tokenData);

    // Load Real Anatomical 3D Brain Mesh & Sample Surface Particles
    try {
      await loadAnatomicalBrainMesh();
    } catch (err) {
      console.error('Failed to load anatomical brain model:', err);
    }

    // Build Curving Outward Pathways
    if (!state.isDebugMesh) {
      buildCurvedNeuralPathways();
    }

    // Set Initial View Mode
    applyViewMode(state.viewMode, true);

    // Setup Interactivity
    setupEvents(container);

    // Initial UI Sync
    updateUIElements();

    // Start Clock & Assembly
    state.assemblyStartTime = performance.now();
    if (urlParams.get('assembled') === '1') {
      state.assemblyStartTime = performance.now() - 5000;
    }

    // Render loop
    requestAnimationFrame(render);

    // Notify test automation
    window.isRenderDone = true;
  }

  // --------------------------------------------------------------------------
  // Scene, Camera, Renderer Setup
  // --------------------------------------------------------------------------
  function setupScene(container) {
    scene = new THREE.Scene();

    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
    camera.position.set(0, 0, 3.25);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x050505, 1.0);
    container.appendChild(renderer.domElement);

    if (state.isDebugMesh) {
      // Key light: Upper front-left
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
      keyLight.position.set(-2.0, 3.0, 3.0);
      scene.add(keyLight);

      // Fill light: lower right
      const fillLight = new THREE.DirectionalLight(0x708294, 0.7);
      fillLight.position.set(2.5, -1.5, 1.5);
      scene.add(fillLight);

      // Rim light: top-back
      const rimLight = new THREE.DirectionalLight(0x90a4b8, 0.5);
      rimLight.position.set(0, 3.0, -3.0);
      scene.add(rimLight);

      const ambLight = new THREE.AmbientLight(0x22252a, 0.9);
      scene.add(ambLight);
    }

    raycaster = new THREE.Raycaster();
    planeHit = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  }

  // --------------------------------------------------------------------------
  // View Modes & Orientations
  // --------------------------------------------------------------------------
  function applyViewMode(mode, immediate) {
    if (!CONFIG.views[mode]) return;
    state.viewMode = mode;
    const v = CONFIG.views[mode];

    state.targetRot.x = v.rx;
    state.targetRot.y = v.ry;

    if (immediate) {
      state.currentRot.x = v.rx;
      state.currentRot.y = v.ry;
      if (debugMesh) {
        debugMesh.rotation.x = v.rx;
        debugMesh.rotation.y = v.ry;
      }
      if (shapePointsMesh) {
        shapePointsMesh.rotation.x = v.rx;
        shapePointsMesh.rotation.y = v.ry;
      }
      if (brainMesh) {
        brainMesh.rotation.x = v.rx;
        brainMesh.rotation.y = v.ry;
      }
      if (neuralLinesMesh) {
        neuralLinesMesh.rotation.x = v.rx;
        neuralLinesMesh.rotation.y = v.ry;
      }
    }

    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === mode);
    });
  }

  // --------------------------------------------------------------------------
  // Token Texture Atlas Generator
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
    tokenAspects = [];

    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const maxItems = Math.min(tokens.length, cols * rows);

    for (let i = 0; i < maxItems; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW;
      const y = row * cellH;

      const text = typeof tokens[i] === 'string' ? tokens[i] : (tokens[i].token || `token_${i}`);
      let displayText = text;
      let textW = ctx.measureText(displayText).width;

      if (textW > cellW - 16) {
        while (displayText.length > 3 && ctx.measureText(displayText + '…').width > cellW - 16) {
          displayText = displayText.slice(0, -1);
        }
        displayText = displayText + '…';
        textW = ctx.measureText(displayText).width;
      }

      const aspect = Math.min(1.0, Math.max(0.25, (textW + 18) / cellW));
      tokenAspects.push(aspect);

      // Micro pill badge background with subtle border
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 3, textW + 14, cellH - 6, 4);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Sharp crisp text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(displayText, x + 8, y + cellH * 0.5 + 0.5);
    }

    while (tokenAspects.length < tokens.length) {
      tokenAspects.push(0.5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.flipY = false;

    return texture;
  }

  // --------------------------------------------------------------------------
  // Mesh Curvature Calculation (Gyri Ridge Crests vs Sulci Valleys)
  // --------------------------------------------------------------------------
  function computeMeshCurvature(geometry) {
    const pos = geometry.getAttribute('position');
    const norm = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    if (!pos || !norm || !index) return null;

    const numVerts = pos.count;
    const numTris = index.count / 3;

    const neighbors = Array.from({ length: numVerts }, () => new Set());
    for (let t = 0; t < numTris; t++) {
      const i0 = index.getX(t * 3);
      const i1 = index.getX(t * 3 + 1);
      const i2 = index.getX(t * 3 + 2);
      neighbors[i0].add(i1); neighbors[i0].add(i2);
      neighbors[i1].add(i0); neighbors[i1].add(i2);
      neighbors[i2].add(i0); neighbors[i2].add(i1);
    }

    const curvature = new Float32Array(numVerts);
    const sortedC = [];

    for (let i = 0; i < numVerts; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const nx = norm.getX(i), ny = norm.getY(i), nz = norm.getZ(i);

      let sum = 0, count = 0;
      for (const j of neighbors[i]) {
        const vx = pos.getX(j) - px;
        const vy = pos.getY(j) - py;
        const vz = pos.getZ(j) - pz;
        sum -= (vx * nx + vy * ny + vz * nz);
        count++;
      }

      const c = count > 0 ? (sum / count) : 0;
      curvature[i] = c;
      sortedC.push(c);
    }

    sortedC.sort((a, b) => a - b);
    const p08 = sortedC[Math.floor(numVerts * 0.08)];
    const p65 = sortedC[Math.floor(numVerts * 0.65)];
    const p95 = sortedC[Math.floor(numVerts * 0.95)];
    const denom = Math.max(0.0001, p95 - p08);

    const normCurvature = new Float32Array(numVerts);
    const crestWeights = new Float32Array(numVerts);
    const colors = new Float32Array(numVerts * 3);

    for (let i = 0; i < numVerts; i++) {
      const c = curvature[i];
      // Normalized curvature: 0.0 in deepest sulci, 1.0 on gyri crests
      const nc = Math.max(0.0, Math.min(1.0, (c - p08) / denom));
      normCurvature[i] = nc;

      // Color attribute is automatically interpolated by MeshSurfaceSampler!
      // r = normalized curvature [0, 1] for shading and AO
      colors[i * 3]     = nc;
      colors[i * 3 + 1] = nc;
      colors[i * 3 + 2] = nc;

      // Crest weights: only vertices in top 35% percentile get weight > 0
      if (c > p65) {
        crestWeights[i] = Math.pow((c - p65) / (p95 - p65 + 0.001), 2.0) + 0.05;
      } else {
        crestWeights[i] = 0.0;
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('crestWeight', new THREE.BufferAttribute(crestWeights, 1));
    geometry.setAttribute('normCurvature', new THREE.BufferAttribute(normCurvature, 1));

    return { normCurvature, crestWeights };
  }

  // --------------------------------------------------------------------------
  // Load Real Anatomical 3D Brain Mesh & Sample Both Layers
  // --------------------------------------------------------------------------
  async function loadAnatomicalBrainMesh() {
    return new Promise((resolve, reject) => {
      const loader = new THREE.GLTFLoader();
      loader.load('/assets/brain/brain.glb', (gltf) => {
        let baseMesh = null;
        gltf.scene.traverse((child) => {
          if (child.isMesh && !baseMesh) {
            baseMesh = child;
          }
        });

        if (!baseMesh) {
          reject(new Error('No mesh found in brain.glb'));
          return;
        }

        const geometry = baseMesh.geometry;
        geometry.computeVertexNormals();

        // Compute Bounding Box & Scale to fit viewport comfortably (55-60% viewport height)
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetDim = 1.28; // Brain occupies ~57% of viewport height at distance 3.25
        const scaleFactor = targetDim / maxDim;

        // Center and scale geometry directly in local coordinates
        geometry.center();
        geometry.scale(scaleFactor, scaleFactor, scaleFactor);
        geometry.computeVertexNormals();

        if (state.isDebugMesh) {
          const debugMat = new THREE.MeshStandardMaterial({
            color: 0x8a929b,
            roughness: 0.45,
            metalness: 0.05,
            flatShading: false
          });
          baseMesh.material = debugMat;
          baseMesh.rotation.order = 'YXZ';
          baseMesh.rotation.x = state.currentRot.x;
          baseMesh.rotation.y = state.currentRot.y;
          scene.add(baseMesh);
          debugMesh = baseMesh;
          resolve();
          return;
        }

        // Compute Curvature & Surface Weights
        computeMeshCurvature(geometry);

        // 1. Build Sampler for Shape Layer (uniform surface sampling)
        const shapeSampler = new THREE.MeshSurfaceSampler(baseMesh).build();
        buildShapePointsLayer(shapeSampler);

        // 2. Build Sampler for Code Layer (gyri crests only)
        const codeSampler = new THREE.MeshSurfaceSampler(baseMesh)
          .setWeightAttribute('crestWeight')
          .build();
        buildCodeTokenLayer(codeSampler);

        resolve();
      }, undefined, reject);
    });
  }

  // --------------------------------------------------------------------------
  // Layer (a): Shape Layer (25,000–40,000 tiny dots, THREE.Points, 1 Draw Call)
  // --------------------------------------------------------------------------
  function buildShapePointsLayer(sampler) {
    const count = state.shapeDotCount;

    const geometry = new THREE.BufferGeometry();
    const posArray        = new Float32Array(count * 3);
    const startPosArray   = new Float32Array(count * 3);
    const normalArray     = new Float32Array(count * 3);
    const curvatureArray  = new Float32Array(count);
    const hemisphereArray = new Float32Array(count); // -1 = Left, +1 = Right
    const delayArray      = new Float32Array(count);

    const samplePos = new THREE.Vector3();
    const sampleNorm = new THREE.Vector3();
    const sampleColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      sampler.sample(samplePos, sampleNorm, sampleColor);

      const px = samplePos.x;
      const py = samplePos.y;
      const pz = samplePos.z;

      posArray[i * 3]     = px;
      posArray[i * 3 + 1] = py;
      posArray[i * 3 + 2] = pz;

      // Dispersed starting position for assembly sequence
      const explodeR = 1.6 + Math.random() * 1.8;
      startPosArray[i * 3]     = px * explodeR + (Math.random() - 0.5) * 0.4;
      startPosArray[i * 3 + 1] = py * explodeR + (Math.random() - 0.5) * 0.4;
      startPosArray[i * 3 + 2] = pz * explodeR + (Math.random() - 0.5) * 0.4;

      normalArray[i * 3]     = sampleNorm.x;
      normalArray[i * 3 + 1] = sampleNorm.y;
      normalArray[i * 3 + 2] = sampleNorm.z;

      // Curvature from interpolated color attribute (r in [0, 1])
      curvatureArray[i] = sampleColor.r;

      // Hemisphere (px < 0 is Left, px >= 0 is Right)
      hemisphereArray[i] = (px >= 0.0) ? 1.0 : -1.0;

      // Staggered delay for organic inflow
      delayArray[i] = Math.random() * 0.45;
    }

    geometry.setAttribute('position',    new THREE.BufferAttribute(posArray, 3));
    geometry.setAttribute('aStartPos',   new THREE.BufferAttribute(startPosArray, 3));
    geometry.setAttribute('aNormal',     new THREE.BufferAttribute(normalArray, 3));
    geometry.setAttribute('aCurvature',  new THREE.BufferAttribute(curvatureArray, 1));
    geometry.setAttribute('aHemisphere', new THREE.BufferAttribute(hemisphereArray, 1));
    geometry.setAttribute('aDelay',      new THREE.BufferAttribute(delayArray, 1));

    const material = createShapePointsMaterial();

    if (shapePointsMesh) {
      scene.remove(shapePointsMesh);
      shapePointsMesh.geometry.dispose();
    }

    shapePointsMesh = new THREE.Points(geometry, material);
    shapePointsMesh.frustumCulled = false;
    shapePointsMesh.rotation.order = 'YXZ';
    shapePointsMesh.rotation.x = state.currentRot.x;
    shapePointsMesh.rotation.y = state.currentRot.y;

    scene.add(shapePointsMesh);
  }

  // --------------------------------------------------------------------------
  // Shape Layer Shader Material (Key Light Lambert × Curvature AO)
  // --------------------------------------------------------------------------
  function createShapePointsMaterial() {
    const vertexShader = `
      uniform float uTime;
      uniform float uAssemblyProgress;
      uniform vec3  uMouseWorld;
      uniform float uHoveredLeft;
      uniform float uHoveredRight;
      uniform float uCalmMode;

      attribute vec3  aStartPos;
      attribute vec3  aNormal;
      attribute float aCurvature;
      attribute float aHemisphere;
      attribute float aDelay;

      varying vec3  vColor;
      varying float vAlpha;

      void main() {
        // Assembly Interpolation (Dots assemble first)
        float tProg = clamp((uAssemblyProgress * 1.5 - aDelay), 0.0, 1.0);
        float ease = (uAssemblyProgress >= 0.999) ? 1.0 : (1.0 - pow(1.0 - tProg, 3.0));
        vec3 instPos = mix(aStartPos, position, ease);

        // Micro-breathing motion (stops in Calm Mode)
        if (uCalmMode < 0.5) {
          instPos += aNormal * (sin(uTime * 1.2 + position.y * 3.5) * 0.003 * aCurvature);
        }

        // Interactive Cursor Impulse
        float distToMouse = distance(instPos, uMouseWorld);
        if (distToMouse < 0.40 && uMouseWorld.x > -900.0) {
          float force = (1.0 - distToMouse / 0.40) * 0.06;
          instPos += aNormal * force;
        }

        vec4 mvPosition = modelViewMatrix * vec4(instPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // 1-2px tiny dots with depth attenuation
        gl_PointSize = clamp(1.8 * (300.0 / -mvPosition.z), 1.2, 2.6);

        // Key Light Shading from upper front-left
        vec3 keyLight = normalize(vec3(-0.6, 0.8, 0.9));
        vec3 viewNorm = normalize((modelViewMatrix * vec4(aNormal, 0.0)).xyz);
        float NdotL = max(0.0, dot(viewNorm, keyLight));
        float lambert = 0.22 + 0.78 * NdotL;

        // Curvature / AO: sulci clearly darker than gyri crests
        float ao = mix(0.14, 1.20, aCurvature);
        float brightness = lambert * ao;

        // Palette & Hemisphere Tint
        vec3 baseCol = vec3(0.92, 0.94, 0.97); // Cool architectural off-white
        if (aHemisphere < 0.0) {
          baseCol = mix(baseCol, vec3(0.80, 0.93, 0.98), 0.30 + uHoveredLeft * 0.50);
        } else {
          baseCol = mix(baseCol, vec3(0.97, 0.93, 0.84), 0.30 + uHoveredRight * 0.50);
        }

        vColor = baseCol * brightness;
        vAlpha = mix(0.38, 0.92, aCurvature) * ease;
      }
    `;

    const fragmentShader = `
      varying vec3  vColor;
      varying float vAlpha;

      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        if (dist > 0.5) discard;
        float soft = smoothstep(0.5, 0.15, dist);
        gl_FragColor = vec4(vColor, vAlpha * soft);
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime:             { value: 0 },
        uAssemblyProgress: { value: 0 },
        uMouseWorld:       { value: new THREE.Vector3(-999, -999, -999) },
        uHoveredLeft:      { value: 0.0 },
        uHoveredRight:     { value: 0.0 },
        uCalmMode:         { value: 0.0 }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
  }

  // --------------------------------------------------------------------------
  // Layer (b): Code Layer (1,500–2,500 Legible Tokens on Gyri Crests, 1 Draw Call)
  // --------------------------------------------------------------------------
  function buildCodeTokenLayer(sampler) {
    const count = state.codeTokenCount;

    // Base Quad Geometry (1 quad = 2 triangles)
    const baseGeo = new THREE.PlaneGeometry(1.0, 1.0, 1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = baseGeo.index;
    geometry.attributes.position = baseGeo.attributes.position;
    geometry.attributes.uv = baseGeo.attributes.uv;

    const posArray        = new Float32Array(count * 3);
    const startPosArray   = new Float32Array(count * 3);
    const normalArray     = new Float32Array(count * 3);
    const tangentArray    = new Float32Array(count * 3);
    const atlasUVArray    = new Float32Array(count * 2);
    const aspectArray     = new Float32Array(count);
    const delayArray      = new Float32Array(count);
    const regionIdArray   = new Float32Array(count);
    const ridgeArray      = new Float32Array(count);
    const hemisphereArray = new Float32Array(count); // -1 = Left, +1 = Right

    const samplePos = new THREE.Vector3();
    const sampleNorm = new THREE.Vector3();
    const sampleColor = new THREE.Color();
    const upVector = new THREE.Vector3(0, 1, 0);

    const cols = CONFIG.atlasCols;
    const rows = CONFIG.atlasRows;
    const totalTokens = Math.min(tokenData.length, cols * rows);

    for (let i = 0; i < count; i++) {
      sampler.sample(samplePos, sampleNorm, sampleColor);

      const cx = samplePos.x;
      const cy = samplePos.y;
      const cz = samplePos.z;

      const nx = sampleNorm.x;
      const ny = sampleNorm.y;
      const nz = sampleNorm.z;

      // Surface Tangent along Gyrus Curve
      const tangent = new THREE.Vector3();
      if (Math.abs(sampleNorm.dot(upVector)) > 0.90) {
        tangent.crossVectors(sampleNorm, new THREE.Vector3(0, 0, 1)).normalize();
      } else {
        tangent.crossVectors(sampleNorm, upVector).normalize();
      }

      // Add gentle organic winding twist along cortex
      tangent.x += Math.sin(cy * 10.0) * 0.12;
      tangent.z += Math.cos(cx * 10.0) * 0.12;
      tangent.normalize();

      // Hemisphere Assignment (cx < 0 is Left, cx >= 0 is Right)
      const isRight = cx >= 0.0;
      const hemiSign = isRight ? 1.0 : -1.0;

      // Skill Region Mapping (3 Left, 3 Right)
      let regionId = 0;
      if (!isRight) {
        if (cz < -0.10 && cy > 0.05) {
          regionId = 0; // RAG & RETRIEVAL (Frontal superior)
        } else if (cy > -0.10 && cz < 0.20) {
          regionId = 1; // AGENTS (Executive center)
        } else {
          regionId = 2; // FULL-STACK (Temporal & inferior)
        }
      } else {
        if (cz < 0.05 && cy > 0.05) {
          regionId = 3; // DATA & ML (Frontal/Parietal research)
        } else if (cz >= 0.05 && cy > -0.10) {
          regionId = 4; // LLMOPS & EVAL (Occipital / Evaluation)
        } else {
          regionId = 5; // RESEARCH (Temporal / Deep Research)
        }
      }

      // Assign token from atlas
      const tokenIdx = i % totalTokens;
      const col = tokenIdx % cols;
      const row = Math.floor(tokenIdx / cols);
      const u = col / cols;
      const v = row / rows;

      posArray[i * 3]     = cx;
      posArray[i * 3 + 1] = cy;
      posArray[i * 3 + 2] = cz;

      // Dispersed start position for assembly
      const explodeR = 2.0 + Math.random() * 1.5;
      startPosArray[i * 3]     = cx * explodeR + (Math.random() - 0.5) * 0.5;
      startPosArray[i * 3 + 1] = cy * explodeR + (Math.random() - 0.5) * 0.5;
      startPosArray[i * 3 + 2] = cz * explodeR + (Math.random() - 0.5) * 0.5;

      normalArray[i * 3]     = nx;
      normalArray[i * 3 + 1] = ny;
      normalArray[i * 3 + 2] = nz;

      tangentArray[i * 3]     = tangent.x;
      tangentArray[i * 3 + 1] = tangent.y;
      tangentArray[i * 3 + 2] = tangent.z;

      atlasUVArray[i * 2]     = u;
      atlasUVArray[i * 2 + 1] = v;

      aspectArray[i]          = tokenAspects[tokenIdx] || 0.5;
      delayArray[i]           = Math.random() * 0.7;
      regionIdArray[i]        = regionId;
      ridgeArray[i]           = sampleColor.r; // Curvature term
      hemisphereArray[i]      = hemiSign;
    }

    geometry.setAttribute('aInstancePos', new THREE.InstancedBufferAttribute(posArray, 3));
    geometry.setAttribute('aStartPos',    new THREE.InstancedBufferAttribute(startPosArray, 3));
    geometry.setAttribute('aNormal',      new THREE.InstancedBufferAttribute(normalArray, 3));
    geometry.setAttribute('aTangent',     new THREE.InstancedBufferAttribute(tangentArray, 3));
    geometry.setAttribute('aAtlasUV',     new THREE.InstancedBufferAttribute(atlasUVArray, 2));
    geometry.setAttribute('aTokenAspect', new THREE.InstancedBufferAttribute(aspectArray, 1));
    geometry.setAttribute('aDelay',       new THREE.InstancedBufferAttribute(delayArray, 1));
    geometry.setAttribute('aRegionId',    new THREE.InstancedBufferAttribute(regionIdArray, 1));
    geometry.setAttribute('aRidge',       new THREE.InstancedBufferAttribute(ridgeArray, 1));
    geometry.setAttribute('aHemisphere',  new THREE.InstancedBufferAttribute(hemisphereArray, 1));

    const material = createBrainShaderMaterial();

    if (brainMesh) {
      scene.remove(brainMesh);
      brainMesh.geometry.dispose();
    }

    brainMesh = new THREE.Mesh(geometry, material);
    brainMesh.frustumCulled = false;
    brainMesh.rotation.order = 'YXZ';
    brainMesh.rotation.x = state.currentRot.x;
    brainMesh.rotation.y = state.currentRot.y;

    scene.add(brainMesh);
  }

  // --------------------------------------------------------------------------
  // Custom Brain Shader Material (Tangent-Oriented, 40% Smaller Tokens)
  // --------------------------------------------------------------------------
  function createBrainShaderMaterial() {
    const vertexShader = `
      uniform float uTime;
      uniform float uAssemblyProgress;
      uniform vec3  uMouseWorld;
      uniform float uActiveRegion;
      uniform float uHoveredLeft;
      uniform float uHoveredRight;
      uniform float uCalmMode;
      uniform float uAtlasCols;
      uniform float uAtlasRows;

      attribute vec3  aInstancePos;
      attribute vec3  aStartPos;
      attribute vec3  aNormal;
      attribute vec3  aTangent;
      attribute vec2  aAtlasUV;
      attribute float aTokenAspect;
      attribute float aDelay;
      attribute float aRegionId;
      attribute float aRidge;
      attribute float aHemisphere;

      varying vec2  vUV;
      varying vec3  vColor;
      varying float vAlpha;

      void main() {
        // Assembly Interpolation (Tokens assemble after dots)
        float tProg = clamp((uAssemblyProgress * 1.5 - aDelay), 0.0, 1.0);
        float ease = (uAssemblyProgress >= 0.999) ? 1.0 : (1.0 - pow(1.0 - tProg, 3.0));
        vec3 instPos = mix(aStartPos, aInstancePos, ease);

        // Breathing / Micro Motion (stops in Calm Mode)
        if (uCalmMode < 0.5) {
          instPos += aNormal * (sin(uTime * 1.2 + aInstancePos.y * 3.5) * 0.0035 * aRidge);
        }

        // Interactive Cursor Impulse
        float distToMouse = distance(instPos, uMouseWorld);
        if (distToMouse < 0.40 && uMouseWorld.x > -900.0) {
          float force = (1.0 - distToMouse / 0.40) * 0.06;
          instPos += aNormal * force;
        }

        // Local quad sizing: 40% smaller than Round 3
        float tokenWidth = 0.082 * aTokenAspect;
        float tokenHeight = 0.014;

        // Tangent frame alignment:
        vec3 bitangent = normalize(cross(aNormal, aTangent));
        vec3 localOffset = (aTangent * (position.x * tokenWidth)) +
                           (bitangent * (position.y * tokenHeight)) +
                           (aNormal * 0.0035); // float subtly above dots layer

        vec3 worldPos = instPos + localOffset;
        vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // Texture atlas UV calculation
        vUV = aAtlasUV + vec2((uv.x * aTokenAspect) / uAtlasCols, uv.y / uAtlasRows);

        // Palette & Hemisphere Tint
        vec3 col = vec3(0.93, 0.95, 0.97); // Cool off-white
        if (aHemisphere < 0.0) {
          col = mix(col, vec3(0.80, 0.93, 0.98), 0.35 + uHoveredLeft * 0.45);
        } else {
          col = mix(col, vec3(0.97, 0.93, 0.84), 0.35 + uHoveredRight * 0.45);
        }

        // Active Region Highlight
        if (uActiveRegion >= 0.0) {
          if (abs(aRegionId - uActiveRegion) < 0.1) {
            col = vec3(1.0, 0.60, 0.45); // Peach highlight
          } else {
            col *= 0.30; // Dim inactive regions
          }
        }

        // Same Key Light Shading as Shape Layer (upper front-left)
        vec3 keyLight = normalize(vec3(-0.6, 0.8, 0.9));
        vec3 viewNorm = normalize((modelViewMatrix * vec4(aNormal, 0.0)).xyz);
        float NdotL = max(0.0, dot(viewNorm, keyLight));
        float lambert = 0.25 + 0.75 * NdotL;
        float depthAtten = clamp(1.0 + mvPosition.z * 0.18, 0.70, 1.0);

        vColor = col * lambert * depthAtten * 1.15;

        // Base Opacity
        float baseAlpha = mix(0.70, 0.95, aRidge);
        if (uActiveRegion >= 0.0 && abs(aRegionId - uActiveRegion) > 0.1) {
          baseAlpha *= 0.25;
        }
        vAlpha = baseAlpha * ease;
      }
    `;

    const fragmentShader = `
      uniform sampler2D uAtlas;
      varying vec2  vUV;
      varying vec3  vColor;
      varying float vAlpha;

      void main() {
        vec4 texColor = texture2D(uAtlas, vUV);
        if (texColor.a < 0.04) discard;

        // Clean text rendering with soft background
        vec3 outColor = vColor * texColor.rgb;
        gl_FragColor = vec4(outColor, texColor.a * vAlpha);
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime:             { value: 0 },
        uAssemblyProgress: { value: 0 },
        uMouseWorld:       { value: new THREE.Vector3(-999, -999, -999) },
        uActiveRegion:     { value: -1.0 },
        uHoveredLeft:      { value: 0.0 },
        uHoveredRight:     { value: 0.0 },
        uCalmMode:         { value: 0.0 },
        uAtlas:            { value: atlasTexture },
        uAtlasCols:        { value: CONFIG.atlasCols },
        uAtlasRows:        { value: CONFIG.atlasRows }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending
    });
  }

  // --------------------------------------------------------------------------
  // Organic Neural Pathways (Curving AROUND and BEHIND the Brain)
  // --------------------------------------------------------------------------
  function buildCurvedNeuralPathways() {
    const pathwayCount = 10;
    const pointsPerCurve = 36;
    const linePositions = [];
    const lineColors = [];

    // Curves start near temporal/occipital lobes, loop OUTWARD and BEHIND (Z < 0)
    for (let c = 0; c < pathwayCount; c++) {
      const angle = (c / pathwayCount) * Math.PI * 2;
      const isLeft = Math.cos(angle) < 0;

      // Start on cortex surface
      const p0 = new THREE.Vector3(
        Math.cos(angle) * 0.75,
        (Math.random() - 0.5) * 0.6,
        Math.sin(angle) * 0.65
      );

      // Loop OUTWARD and BEHIND in depth (negative Z)
      const p1 = new THREE.Vector3(
        Math.cos(angle + 0.4) * 1.15,
        p0.y + (Math.random() - 0.5) * 0.4,
        -0.45 - Math.random() * 0.40
      );

      // Apex behind occipital/cerebellar pole
      const p2 = new THREE.Vector3(
        Math.cos(angle + 0.9) * 0.95,
        p1.y + (Math.random() - 0.5) * 0.5,
        -0.75 - Math.random() * 0.35
      );

      // Anchor re-entry at inferior brainstem or opposite lobe
      const p3 = new THREE.Vector3(
        Math.cos(angle + 1.4) * 0.55,
        -0.35 - Math.random() * 0.30,
        Math.sin(angle + 1.4) * 0.50
      );

      const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
      const points = curve.getPoints(pointsPerCurve);

      for (let j = 0; j < points.length - 1; j++) {
        linePositions.push(points[j].x, points[j].y, points[j].z);
        linePositions.push(points[j + 1].x, points[j + 1].y, points[j + 1].z);

        const progress = j / points.length;
        const tint = isLeft ? [0.82, 0.94, 0.98] : [0.97, 0.93, 0.85];
        const alphaFade = Math.sin(progress * Math.PI);

        lineColors.push(tint[0] * alphaFade, tint[1] * alphaFade, tint[2] * alphaFade);
        lineColors.push(tint[0] * alphaFade, tint[1] * alphaFade, tint[2] * alphaFade);
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.14, // Faint, subtle filaments
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    neuralLinesMesh = new THREE.LineSegments(lineGeo, lineMat);
    neuralLinesMesh.rotation.order = 'YXZ';
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
        state.targetRot.x = Math.max(-0.6, Math.min(1.55, state.targetRot.x));

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
        state.targetRot.x = Math.max(-0.6, Math.min(1.55, state.targetRot.x));

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

    if (shapePointsMesh && shapePointsMesh.material.uniforms) {
      shapePointsMesh.material.uniforms.uCalmMode.value = state.isCalm ? 1.0 : 0.0;
    }
    if (brainMesh && brainMesh.material.uniforms) {
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
      if (state.isDebugMesh) {
        countElem.textContent = 'RAW MESH';
      } else {
        countElem.textContent = state.particleCount.toLocaleString();
      }
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

    // Assembly Progression: Dots assemble first (0 to 1.2s), then tokens (0.5 to 2.0s)
    const elapsedAssembly = (now - state.assemblyStartTime) * 0.001;
    const dotsProgress = Math.min(elapsedAssembly / 1.2, 1.0);
    const tokensProgress = Math.max(0.0, Math.min((elapsedAssembly - 0.5) / 1.5, 1.0));

    // Camera Angle & Idle Sway
    const v = CONFIG.views[state.viewMode] || CONFIG.views.side;
    if (!state.isCalm) {
      if (!state.isDragging) {
        const t = now * 0.001;
        if (state.viewMode === 'side') {
          // Drifts slowly within ±20° toward 3/4
          const driftOffset = 0.17;
          state.targetRot.y = v.ry - driftOffset + Math.sin(t * 0.35) * driftOffset;
          state.targetRot.x = v.rx + Math.sin(t * 0.22) * 0.03;
        } else {
          state.targetRot.y = v.ry + Math.sin(t * 0.42) * v.swayY;
          state.targetRot.x = v.rx + Math.sin(t * 0.28) * v.swayX;
        }
      }
    } else {
      if (!state.isDragging) {
        state.targetRot.y = v.ry;
        state.targetRot.x = v.rx;
      }
    }

    // Smooth Damping to Target Rotation
    state.currentRot.y += (state.targetRot.y - state.currentRot.y) * 0.12;
    state.currentRot.x += (state.targetRot.x - state.currentRot.x) * 0.12;

    if (debugMesh) {
      debugMesh.rotation.y = state.currentRot.y;
      debugMesh.rotation.x = state.currentRot.x;
    }

    if (shapePointsMesh) {
      shapePointsMesh.rotation.y = state.currentRot.y;
      shapePointsMesh.rotation.x = state.currentRot.x;
    }

    if (brainMesh) {
      brainMesh.rotation.y = state.currentRot.y;
      brainMesh.rotation.x = state.currentRot.x;
    }

    if (neuralLinesMesh) {
      neuralLinesMesh.rotation.y = state.currentRot.y;
      neuralLinesMesh.rotation.x = state.currentRot.x;
    }

    const targetLeft = (state.hoveredHemisphere === 'left') ? 1.0 : 0.0;
    const targetRight = (state.hoveredHemisphere === 'right') ? 1.0 : 0.0;

    // Uniform Updates for Shape Layer
    if (shapePointsMesh && shapePointsMesh.material.uniforms) {
      const uniforms = shapePointsMesh.material.uniforms;
      uniforms.uTime.value = now * 0.001;
      uniforms.uAssemblyProgress.value = dotsProgress;
      uniforms.uMouseWorld.value.copy(state.mouseWorldPos);
      uniforms.uHoveredLeft.value += (targetLeft - uniforms.uHoveredLeft.value) * 0.12;
      uniforms.uHoveredRight.value += (targetRight - uniforms.uHoveredRight.value) * 0.12;
    }

    // Uniform Updates for Code Layer
    if (brainMesh && brainMesh.material.uniforms) {
      const uniforms = brainMesh.material.uniforms;
      uniforms.uTime.value = now * 0.001;
      uniforms.uAssemblyProgress.value = tokensProgress;
      uniforms.uMouseWorld.value.copy(state.mouseWorldPos);
      uniforms.uHoveredLeft.value += (targetLeft - uniforms.uHoveredLeft.value) * 0.12;
      uniforms.uHoveredRight.value += (targetRight - uniforms.uHoveredRight.value) * 0.12;
    }

    // Pulse faint neural lines
    if (neuralLinesMesh && !state.isCalm) {
      neuralLinesMesh.material.opacity = 0.14 + Math.sin(now * 0.002) * 0.04;
    }

    renderer.render(scene, camera);
  }

  // Helper: Token loader (handles both {tokens: [...]} and [...])
  async function loadTokens() {
    try {
      const res = await fetch('/data/tokens.json');
      const json = await res.json();
      return json.tokens || json;
    } catch (e) {
      return ['retrieve()', 'generate()', 'embed()'];
    }
  }

  // Public Debug API for Headless Captures & Diagnostics
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
