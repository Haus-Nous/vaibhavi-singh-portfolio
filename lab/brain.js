/**
 * ============================================================================
 * A BRAIN BUILT FROM CODE — WebGL Procedural Engine
 * Author: Vaibhavi Singh (Haus-Nous)
 * Technology: Three.js r160 (Local Vendor) · Instanced Quads · Token Atlas
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Configuration & Constants
  // --------------------------------------------------------------------------
  const CONFIG = {
    desktopCount: 7200,
    mobileCount: 2800,
    atlasCols: 16,
    atlasRows: 38, // 16 * 38 = 608 cells (covers 600 tokens)
    cellWidth: 128,
    cellHeight: 28,
    palette: {
      leftBase: [0.48, 0.77, 0.84],    // Icy blue / pale cyan (#7bc4d6)
      rightBase: [0.85, 0.76, 0.62],   // Warm champagne (#d8c29d)
      activeHighlight: [1.0, 0.55, 0.44], // Rare peach/coral (#ff8e72)
      neuralTeal: [0.29, 0.48, 0.52],  // Desaturated teal (#4a7a85)
      coreWhite: [0.95, 0.94, 0.92]    // Warm off-white
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
    assemblyStartTime: 0,
    assemblyDuration: 2.5,
    hoveredHemisphere: null, // 'left' | 'right' | null
    activeRegionId: -1,      // -1 means all visible
    particleCount: 0,
    fps: 60,
    frameCount: 0,
    lastTime: performance.now(),
    fpsLastCalculated: performance.now(),
    fpsDropCounter: 0,
    mouse: new THREE.Vector2(-999, -999),
    mouseWorldPos: new THREE.Vector3(0, 0, 0),
    isDragging: false,
    previousMousePosition: { x: 0, y: 0 },
    rotationVelocity: { x: 0, y: 0.0018 }
  };

  // Three.js instances
  let renderer, scene, camera;
  let brainMesh, neuralLinesMesh;
  let tokenData = [];
  let atlasTexture;
  let raycaster, planeHit;

  // --------------------------------------------------------------------------
  // Initialization Sequence
  // --------------------------------------------------------------------------
  async function init() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    // Check Calm Mode preference from localStorage & media query
    try {
      const storedCalm = localStorage.getItem('code_brain_calm_mode');
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (storedCalm === 'true' || (storedCalm === null && prefersReducedMotion)) {
        state.isCalm = true;
      }
    } catch (e) {
      console.warn('localStorage access denied, using defaults.');
    }

    // Load Token Catalog
    try {
      const resp = await fetch('/data/tokens.json');
      const json = await resp.json();
      tokenData = json.tokens || [];
    } catch (e) {
      console.warn('Failed to load /data/tokens.json, falling back to built-in tokens.');
      tokenData = [
        'retrieve()', 'rerank(top_k)', 'policy.authorize()', 'extract_features()',
        '0101', 'if (intent)', 'return', 'Zustand.create()', 'PrismaClient()',
        'p50_latency', 'p95_latency', 'Ollama.run()', 'Llama-3.2', 'Ragas.eval()',
        'cosine_sim()', 'norm_layer', 'FastAPI.post()', 'NextAuth.session()'
      ];
    }

    // Determine particle count based on device capability
    const isMobile = window.innerWidth < 768;
    state.particleCount = isMobile ? CONFIG.mobileCount : CONFIG.desktopCount;

    // Setup WebGL Scene
    setupScene(container);
    
    // Build Token Atlas
    atlasTexture = createTokenAtlas(tokenData);

    // Build Procedural Brain Geometry
    buildBrainGeometry();

    // Build Neural Pathways
    buildNeuralPathways();

    // Setup Event Listeners
    setupEvents(container);

    // Start Assembly Clock
    state.assemblyStartTime = performance.now();

    // Update UI Elements
    updateUIElements();

    // Start Animation Loop
    requestAnimationFrame(render);
  }

  // --------------------------------------------------------------------------
  // Scene Setup
  // --------------------------------------------------------------------------
  function setupScene(container) {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.08);

    camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 5.2);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x050505, 1.0);
    container.appendChild(renderer.domElement);

    raycaster = new THREE.Raycaster();
    planeHit = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  }

  // --------------------------------------------------------------------------
  // Dynamic Token Texture Atlas Generator
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
    ctx.font = '500 12px "JetBrains Mono", ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';

    const totalCells = cols * rows;
    for (let i = 0; i < totalCells; i++) {
      const token = tokens[i % tokens.length];
      const col = i % cols;
      const row = Math.floor(i / cols);

      const x = col * cellW + cellW / 2;
      const y = row * cellH + cellH / 2;

      // Draw subtle token code
      ctx.fillText(token, x, y);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }

  // --------------------------------------------------------------------------
  // Procedural Brain Geometry Generator
  // --------------------------------------------------------------------------
  function buildBrainGeometry() {
    const count = state.particleCount;

    // Base Quad Geometry for Billboard
    const baseQuad = new THREE.PlaneGeometry(0.18, 0.045);
    const instancedGeo = new THREE.InstancedBufferGeometry();
    instancedGeo.index = baseQuad.index;
    instancedGeo.attributes.position = baseQuad.attributes.position;
    instancedGeo.attributes.uv = baseQuad.attributes.uv;

    // Instance Attributes
    const initialPositions = new Float32Array(count * 3);
    const targetPositions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const drifts = new Float32Array(count * 3);
    const tokenIndices = new Float32Array(count);
    const regionIds = new Float32Array(count);
    const assemblyDelays = new Float32Array(count);
    const phases = new Float32Array(count);
    const scales = new Float32Array(count);

    const totalAtlasTokens = CONFIG.atlasCols * CONFIG.atlasRows;

    for (let i = 0; i < count; i++) {
      // 1. Initial Chaotic Scatter Position (Sphere of radius 3.5 - 6.0)
      const u1 = Math.random();
      const u2 = Math.random();
      const theta = u1 * Math.PI * 2;
      const phi = Math.acos(2 * u2 - 1);
      const scatterR = 3.2 + Math.random() * 3.5;
      
      initialPositions[i * 3 + 0] = scatterR * Math.sin(phi) * Math.cos(theta);
      initialPositions[i * 3 + 1] = scatterR * Math.sin(phi) * Math.sin(theta);
      initialPositions[i * 3 + 2] = scatterR * Math.cos(phi);

      // 2. Procedural Brain Coordinate
      const isRightHemisphere = (i % 2 === 0);
      const brainPt = generateBrainPoint(isRightHemisphere);

      targetPositions[i * 3 + 0] = brainPt.x;
      targetPositions[i * 3 + 1] = brainPt.y;
      targetPositions[i * 3 + 2] = brainPt.z;

      normals[i * 3 + 0] = brainPt.nx;
      normals[i * 3 + 1] = brainPt.ny;
      normals[i * 3 + 2] = brainPt.nz;

      // Drift vector for compiling effect
      const isLoose = (Math.random() < 0.16);
      const driftMagnitude = isLoose ? 0.35 : 0.08;
      drifts[i * 3 + 0] = (Math.random() - 0.5) * driftMagnitude;
      drifts[i * 3 + 1] = (Math.random() - 0.5) * driftMagnitude;
      drifts[i * 3 + 2] = (Math.random() - 0.5) * driftMagnitude;

      tokenIndices[i] = Math.floor(Math.random() * totalAtlasTokens);
      regionIds[i] = brainPt.regionId;
      assemblyDelays[i] = Math.random() * 0.9; // staggered start
      phases[i] = Math.random() * Math.PI * 2;
      scales[i] = 0.8 + Math.random() * 0.45;
    }

    instancedGeo.setAttribute('aInitialPos', new THREE.InstancedBufferAttribute(initialPositions, 3));
    instancedGeo.setAttribute('aTargetPos', new THREE.InstancedBufferAttribute(targetPositions, 3));
    instancedGeo.setAttribute('aNormal', new THREE.InstancedBufferAttribute(normals, 3));
    instancedGeo.setAttribute('aDrift', new THREE.InstancedBufferAttribute(drifts, 3));
    instancedGeo.setAttribute('aTokenIndex', new THREE.InstancedBufferAttribute(tokenIndices, 1));
    instancedGeo.setAttribute('aRegionId', new THREE.InstancedBufferAttribute(regionIds, 1));
    instancedGeo.setAttribute('aAssemblyDelay', new THREE.InstancedBufferAttribute(assemblyDelays, 1));
    instancedGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    instancedGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));

    // Custom Shader Material
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
        uLeftColor: { value: new THREE.Color(...CONFIG.palette.leftBase) },
        uRightColor: { value: new THREE.Color(...CONFIG.palette.rightBase) },
        uHighlightColor: { value: new THREE.Color(...CONFIG.palette.activeHighlight) },
        uCoreColor: { value: new THREE.Color(...CONFIG.palette.coreWhite) }
      },
      vertexShader: `
        attribute vec3 aInitialPos;
        attribute vec3 aTargetPos;
        attribute vec3 aNormal;
        attribute vec3 aDrift;
        attribute float aTokenIndex;
        attribute float aRegionId;
        attribute float aAssemblyDelay;
        attribute float aPhase;
        attribute float aScale;

        uniform float uTime;
        uniform float uAssemblyProgress;
        uniform float uCalmMode;
        uniform vec3 uMouseWorld;
        uniform float uAtlasCols;
        uniform float uAtlasRows;

        varying vec2 vUv;
        varying float vRegionId;
        varying float vIsRight;
        varying float vMouseProximity;
        varying float vDepthFade;

        // Cubic Quintic Easing
        float easeOutQuint(float x) {
          return 1.0 - pow(1.0 - x, 4.0);
        }

        void main() {
          vRegionId = aRegionId;
          vIsRight = (aTargetPos.x > 0.0) ? 1.0 : 0.0;

          // Assembly progress with individual delay
          float p = clamp((uAssemblyProgress - aAssemblyDelay) / 1.6, 0.0, 1.0);
          float ease = easeOutQuint(p);

          // Position transition
          vec3 currentPos = mix(aInitialPos, aTargetPos, ease);

          // Subtle organic breathing & compiling motion (disabled in Calm mode)
          if (uCalmMode < 0.5) {
            float breath = sin(uTime * 1.4 + aPhase) * 0.012;
            currentPos += aNormal * breath;
            
            // Loose compiling tokens
            float driftT = sin(uTime * 0.75 + aPhase);
            currentPos += aDrift * driftT;
          }

          // Cursor Reaction (Mouse Proximity in 3D)
          float distToCursor = distance(currentPos, uMouseWorld);
          float proximity = 1.0 - smoothstep(0.0, 0.85, distToCursor);
          vMouseProximity = proximity;

          // Scale particle: larger near cursor
          float particleScale = aScale * (1.0 + proximity * 0.65);

          // Billboard orientation: align quad to camera plane
          vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 cameraUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

          vec3 finalPos = currentPos 
                        + cameraRight * position.x * particleScale 
                        + cameraUp * position.y * particleScale;

          vec4 mvPosition = viewMatrix * vec4(finalPos, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          // Depth attenuation
          vDepthFade = smoothstep(12.0, 1.5, -mvPosition.z);

          // Texture Atlas UV Mapping
          float col = mod(aTokenIndex, uAtlasCols);
          float row = floor(aTokenIndex / uAtlasCols);
          vUv = vec2(
            (col + uv.x) / uAtlasCols,
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
        uniform vec3 uLeftColor;
        uniform vec3 uRightColor;
        uniform vec3 uHighlightColor;
        uniform vec3 uCoreColor;

        varying vec2 vUv;
        varying float vRegionId;
        varying float vIsRight;
        varying float vMouseProximity;
        varying float vDepthFade;

        void main() {
          vec4 tex = texture2D(uAtlas, vUv);
          if (tex.a < 0.15) discard;

          // Base hemisphere color
          vec3 baseColor = (vIsRight > 0.5) ? uRightColor : uLeftColor;

          // Hemisphere Hover weighting
          float hemiDim = 1.0;
          if (uHoveredLeft > 0.0) {
            hemiDim = (vIsRight < 0.5) ? 1.45 : 0.32;
          } else if (uHoveredRight > 0.0) {
            hemiDim = (vIsRight > 0.5) ? 1.45 : 0.32;
          }

          // Region filtering
          float regionDim = 1.0;
          if (uActiveRegion >= 0.0) {
            regionDim = (abs(vRegionId - uActiveRegion) < 0.1) ? 1.7 : 0.2;
          }

          // Mouse highlight
          vec3 color = mix(baseColor, uHighlightColor, vMouseProximity * 0.85);

          // Rare warm pulse ripple through network
          float wave = sin(uTime * 2.0 - vRegionId * 1.2);
          if (wave > 0.88 && uHoveredLeft < 0.1 && uHoveredRight < 0.1) {
            color = mix(color, uHighlightColor, 0.45);
          }

          color = mix(color, uCoreColor, 0.25) * hemiDim * regionDim;

          float finalAlpha = tex.a * (0.65 + vMouseProximity * 0.35) * vDepthFade;
          gl_FragColor = vec4(color, clamp(finalAlpha, 0.0, 1.0));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    brainMesh = new THREE.Mesh(instancedGeo, brainShaderMaterial);
    scene.add(brainMesh);
  }

  // --------------------------------------------------------------------------
  // Procedural Brain Math Function
  // --------------------------------------------------------------------------
  function generateBrainPoint(isRight) {
    const side = isRight ? 1.0 : -1.0;
    const centerOffset = 0.32 * side;

    // Pick structure: Cerebrum (80%), Cerebellum (13%), Brainstem (7%)
    const typeRoll = Math.random();

    if (typeRoll < 0.80) {
      // Cerebrum Hemisphere (deformed ellipsoid with noise sulci & gyri)
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);

      // Base radius with anatomical scaling: elongated AP (z), tall (y), separated (x)
      const rx = 0.62;
      const ry = 0.74;
      const rz = 0.94;

      let x = rx * Math.sin(phi) * Math.cos(theta);
      let y = ry * Math.sin(phi) * Math.sin(theta);
      let z = rz * Math.cos(phi);

      // Enforce longitudinal fissure: push away from x=0
      if (Math.abs(x) < 0.06) {
        x = (x >= 0 ? 0.06 : -0.06) + x * 0.5;
      }

      // Gyri & Sulci folds via 3D sinusoidal interference
      const foldNoise = Math.sin(7.0 * x) * Math.cos(7.0 * y) * Math.sin(7.0 * z)
                      + 0.5 * Math.sin(14.0 * x) * Math.cos(14.0 * z)
                      + 0.25 * Math.cos(21.0 * y);
      
      const sulciDisplacement = Math.sign(foldNoise) * Math.pow(Math.abs(foldNoise), 0.65) * 0.12;

      // Volumetric distribution (cortex shell to mid-interior)
      const depth = 0.58 + Math.random() * 0.42;
      const dispFactor = (1.0 + sulciDisplacement) * depth;

      x = (x * dispFactor) + centerOffset;
      y = (y * dispFactor) + 0.12;
      z = (z * dispFactor);

      // Normal
      const nx = Math.sin(phi) * Math.cos(theta) * side;
      const ny = Math.sin(phi) * Math.sin(theta);
      const nz = Math.cos(phi);

      // Skill Region Assignment
      let regionId = 0;
      if (!isRight) {
        // Left Hemisphere: Logic / Systems
        if (y > 0.08 && z > 0.0) {
          regionId = 0; // RAG & RETRIEVAL (Frontal superior)
        } else if (z > -0.25 && y > -0.15) {
          regionId = 1; // AGENTS (Executive center)
        } else {
          regionId = 2; // FULL-STACK (Temporal & base)
        }
      } else {
        // Right Hemisphere: Research / Data
        if (y > 0.08 && z > -0.2) {
          regionId = 3; // DATA & ML (Parietal computational)
        } else if (y > -0.15 && z > -0.3) {
          regionId = 4; // LLMOPS & EVALUATION (Lateral monitoring)
        } else {
          regionId = 5; // RESEARCH (Occipital exploratory)
        }
      }

      return { x, y, z, nx, ny, nz, regionId };

    } else if (typeRoll < 0.93) {
      // Cerebellum (twin smaller posterior lobes below occipital)
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * Math.PI;
      const crx = 0.38;
      const cry = 0.28;
      const crz = 0.34;

      const foliaNoise = Math.sin(26.0 * v) * 0.04;
      const depth = 0.7 + Math.random() * 0.3;

      const x = (crx * Math.sin(v) * Math.cos(u) * depth) + (0.24 * side);
      const y = (cry * Math.sin(v) * Math.sin(u) * depth) - 0.48 + foliaNoise;
      const z = (crz * Math.cos(v) * depth) - 0.58;

      return {
        x, y, z,
        nx: Math.sin(v) * Math.cos(u) * side,
        ny: Math.sin(v) * Math.sin(u),
        nz: Math.cos(v),
        regionId: isRight ? 5 : 2
      };

    } else {
      // Brainstem (central descending cylinder)
      const stemH = Math.random();
      const stemAngle = Math.random() * Math.PI * 2;
      const stemRadius = 0.16 * (1.0 - stemH * 0.35); // taper downward

      const x = stemRadius * Math.cos(stemAngle) + (0.04 * side);
      const y = -0.45 - (stemH * 0.52);
      const z = stemRadius * Math.sin(stemAngle) - 0.12;

      return {
        x, y, z,
        nx: Math.cos(stemAngle),
        ny: -0.2,
        nz: Math.sin(stemAngle),
        regionId: isRight ? 4 : 1
      };
    }
  }

  // --------------------------------------------------------------------------
  // Organic Neural Pathways (Living Streams)
  // --------------------------------------------------------------------------
  function buildNeuralPathways() {
    const pathwayCount = 14;
    const pointsPerCurve = 36;
    const linePositions = [];
    const lineColors = [];

    const teal = new THREE.Color(...CONFIG.palette.neuralTeal);
    const champagne = new THREE.Color(...CONFIG.palette.rightBase);

    for (let c = 0; c < pathwayCount; c++) {
      const isRight = (c % 2 === 0);
      const startSide = isRight ? 0.38 : -0.38;

      // Start on brain cortex
      const p0 = new THREE.Vector3(
        startSide + (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.6 + 0.1,
        (Math.random() - 0.5) * 0.6
      );

      // Mid arching into space
      const angle = (c / pathwayCount) * Math.PI * 2;
      const reachR = 1.6 + Math.random() * 0.8;
      const p1 = new THREE.Vector3(
        p0.x * 1.5 + Math.cos(angle) * reachR * 0.6,
        p0.y * 1.2 + (Math.random() - 0.5) * 0.8,
        p0.z * 1.5 + Math.sin(angle) * reachR * 0.6
      );

      // Terminal end dissipating into void
      const p2 = new THREE.Vector3(
        p1.x * 1.35 + (Math.random() - 0.5) * 0.6,
        p1.y + (Math.random() - 0.5) * 0.8,
        p1.z * 1.35 + (Math.random() - 0.5) * 0.6
      );

      const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
      const pts = curve.getPoints(pointsPerCurve);

      for (let j = 0; j < pts.length - 1; j++) {
        linePositions.push(pts[j].x, pts[j].y, pts[j].z);
        linePositions.push(pts[j + 1].x, pts[j + 1].y, pts[j + 1].z);

        const alphaProgress = 1.0 - (j / pts.length);
        const col = isRight ? champagne : teal;

        lineColors.push(col.r * alphaProgress, col.g * alphaProgress, col.b * alphaProgress);
        lineColors.push(col.r * alphaProgress, col.g * alphaProgress, col.b * alphaProgress);
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending
    });

    neuralLinesMesh = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(neuralLinesMesh);
  }

  // --------------------------------------------------------------------------
  // Event Listeners & Interaction
  // --------------------------------------------------------------------------
  function setupEvents(container) {
    // Window Resize
    window.addEventListener('resize', onResize);

    // Mouse Tracking for Raycasting in 3D
    window.addEventListener('mousemove', (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Unproject to 3D plane at z=0
      raycaster.setFromCamera(state.mouse, camera);
      const intersection = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeHit, intersection);
      if (intersection) {
        state.mouseWorldPos.copy(intersection);
      }

      // Drag Rotation
      if (state.isDragging) {
        const deltaX = e.clientX - state.previousMousePosition.x;
        const deltaY = e.clientY - state.previousMousePosition.y;

        state.rotationVelocity.y = deltaX * 0.0035;
        state.rotationVelocity.x = deltaY * 0.0025;

        state.previousMousePosition = { x: e.clientX, y: e.clientY };
      }
    });

    container.addEventListener('mousedown', (e) => {
      state.isDragging = true;
      state.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      state.isDragging = false;
    });

    // Touch Support for Mobile
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        state.isDragging = true;
        state.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (state.isDragging && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - state.previousMousePosition.x;
        const deltaY = e.touches[0].clientY - state.previousMousePosition.y;

        state.rotationVelocity.y = deltaX * 0.004;
        state.rotationVelocity.x = deltaY * 0.003;

        state.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      state.isDragging = false;
    });

    // UI Buttons
    const btnCalm = document.getElementById('btn-calm');
    if (btnCalm) {
      btnCalm.addEventListener('click', toggleCalmMode);
    }

    const btnResetAssembly = document.getElementById('btn-reset-assembly');
    if (btnResetAssembly) {
      btnResetAssembly.addEventListener('click', () => {
        state.assemblyStartTime = performance.now();
      });
    }

    // Hemisphere Tags
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
      btn.addEventListener('click', (e) => {
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
  }

  // --------------------------------------------------------------------------
  // Main Animation & Render Loop
  // --------------------------------------------------------------------------
  function render(now) {
    requestAnimationFrame(render);

    const delta = (now - state.lastTime) * 0.001;
    state.lastTime = now;

    // Rolling FPS Calculation
    state.frameCount++;
    if (now - state.fpsLastCalculated >= 1000) {
      state.fps = Math.round((state.frameCount * 1000) / (now - state.fpsLastCalculated));
      state.frameCount = 0;
      state.fpsLastCalculated = now;

      const fpsElem = document.getElementById('metric-fps');
      if (fpsElem) fpsElem.textContent = state.fps;

      // Adaptive Performance Throttling
      if (state.fps < 40) {
        state.fpsDropCounter++;
        if (state.fpsDropCounter >= 2 && state.particleCount > 3500) {
          console.warn('FPS < 40 detected for 2s, dynamically lowering particle density.');
          state.particleCount = Math.floor(state.particleCount * 0.7);
          buildBrainGeometry();
          updateUIElements();
          state.fpsDropCounter = 0;
        }
      } else {
        state.fpsDropCounter = 0;
      }
    }

    // Assembly Progress
    const elapsedAssembly = (now - state.assemblyStartTime) * 0.001;
    const assemblyFactor = Math.min(elapsedAssembly, state.assemblyDuration);

    // Smooth Damped Rotation
    if (!state.isCalm) {
      if (!state.isDragging) {
        // Natural idle slow spin
        state.rotationVelocity.y = state.rotationVelocity.y * 0.95 + 0.0012 * 0.05;
        state.rotationVelocity.x = state.rotationVelocity.x * 0.95;
      }

      if (brainMesh) {
        brainMesh.rotation.y += state.rotationVelocity.y;
        brainMesh.rotation.x += state.rotationVelocity.x;
        // Clamp pitch to avoid disorientation
        brainMesh.rotation.x = Math.max(-0.45, Math.min(0.45, brainMesh.rotation.x));
      }

      if (neuralLinesMesh) {
        neuralLinesMesh.rotation.y = brainMesh.rotation.y;
        neuralLinesMesh.rotation.x = brainMesh.rotation.x;
      }
    }

    // Update Uniforms
    if (brainMesh) {
      const uniforms = brainMesh.material.uniforms;
      uniforms.uTime.value = now * 0.001;
      uniforms.uAssemblyProgress.value = assemblyFactor;
      uniforms.uMouseWorld.value.copy(state.mouseWorldPos);

      // Smooth hemisphere hover transitions
      const targetLeft = (state.hoveredHemisphere === 'left') ? 1.0 : 0.0;
      const targetRight = (state.hoveredHemisphere === 'right') ? 1.0 : 0.0;

      uniforms.uHoveredLeft.value += (targetLeft - uniforms.uHoveredLeft.value) * 0.12;
      uniforms.uHoveredRight.value += (targetRight - uniforms.uHoveredRight.value) * 0.12;
    }

    // Pulse neural lines
    if (neuralLinesMesh && !state.isCalm) {
      neuralLinesMesh.material.opacity = 0.28 + Math.sin(now * 0.002) * 0.12;
    }

    renderer.render(scene, camera);
  }

  // Expose API for inspection / tests
  window.BrainPrototype = {
    getMetrics: () => ({
      fps: state.fps,
      particleCount: state.particleCount,
      isCalm: state.isCalm,
      tokenCount: tokenData.length
    }),
    toggleCalm: toggleCalmMode,
    setHoveredHemisphere: setHoveredHemisphere
  };

  // Launch when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
