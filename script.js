/**
 * ============================================================================
 * VAIBHAVI SINGH — "A BRAIN BUILT FROM CODE"
 * WebGL Real Anatomical Engine & Interactive Experience
 * Nih 3D Model (CC BY 4.0) · 32,000 Shape Dots + 1,800 Gyri Crest Tokens
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------
  const CONFIG = {
    desktopShapeDots: 32000,
    mobileShapeDots: 12000,
    desktopCodeTokens: 1800,
    mobileCodeTokens: 800,
    atlasCols: 16,
    atlasRows: 38,
    cellWidth: 192,
    cellHeight: 32,

    // Lateral, 3/4, and Top anatomical vantage points
    views: {
      side:         { ry: 1.5708, rx: 0.0,  swayY: 0.17, swayX: 0.03 },
      threequarter: { ry: 1.12,   rx: 0.18, swayY: 0.18, swayX: 0.05 },
      top:          { ry: 0.0,    rx: 1.50, swayY: 0.08, swayX: 0.03 }
    }
  };

  // State Management
  const state = {
    isCalm: false,
    viewMode: 'side',
    assemblyStartTime: 0,
    activeRegionId: -1,
    hoveredHemisphere: null,
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
    targetRot: { x: CONFIG.views.side.rx, y: CONFIG.views.side.ry }
  };

  // Three.js Core
  let renderer, scene, camera;
  let brainMesh, shapePointsMesh, neuralLinesMesh;
  let tokenData = [];
  let tokenAspects = [];
  let atlasTexture;
  let raycaster, planeHit;

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------
  async function init() {
    const container = document.getElementById('brain-canvas-container');
    if (!container) return;

    // Check Calm Preference
    try {
      const storedCalm = localStorage.getItem('code_brain_calm_mode');
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (storedCalm === 'true' || (storedCalm === null && prefersReducedMotion)) {
        state.isCalm = true;
      }
    } catch (e) {}

    // Density
    const isMobile = window.innerWidth < 860;
    state.shapeDotCount = isMobile ? CONFIG.mobileShapeDots : CONFIG.desktopShapeDots;
    state.codeTokenCount = isMobile ? CONFIG.mobileCodeTokens : CONFIG.desktopCodeTokens;
    state.particleCount = state.shapeDotCount + state.codeTokenCount;

    // Setup Three.js
    setupScene(container);

    // Load Tokens & Generate Atlas
    tokenData = await loadTokens();
    atlasTexture = createTokenAtlas(tokenData);

    // Load 3D Anatomical Brain Mesh
    try {
      await loadAnatomicalBrainMesh();
    } catch (err) {
      console.error('Failed to load anatomical brain model:', err);
    }

    // Build Curving Outward Pathways
    buildCurvedNeuralPathways();

    // Set Default Side View
    applyViewMode('side', true);

    // Interactions & UI
    setupEvents(container);
    setupDOMInteractions();
    updateCalmUI();
    loadBuildStamp();

    // Start Assembly Clock
    state.assemblyStartTime = performance.now();

    // Render Loop
    requestAnimationFrame(render);
  }

  // --------------------------------------------------------------------------
  // Three.js Scene Setup
  // --------------------------------------------------------------------------
  function setupScene(container) {
    scene = new THREE.Scene();

    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
    camera.position.set(0, 0, 3.25);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    container.appendChild(renderer.domElement);

    raycaster = new THREE.Raycaster();
    planeHit = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  }

  // --------------------------------------------------------------------------
  // View Modes
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
  // Token Atlas Generation
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

      // Badge outline
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 3, textW + 14, cellH - 6, 4);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Sharp text
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
  // Mesh Curvature Calculation
  // --------------------------------------------------------------------------
  function computeMeshCurvature(geometry) {
    const pos = geometry.getAttribute('position');
    const norm = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    if (!pos || !norm || !index) return;

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
      const nc = Math.max(0.0, Math.min(1.0, (c - p08) / denom));
      normCurvature[i] = nc;

      colors[i * 3]     = nc;
      colors[i * 3 + 1] = nc;
      colors[i * 3 + 2] = nc;

      if (c > p65) {
        crestWeights[i] = Math.pow((c - p65) / (p95 - p65 + 0.001), 2.0) + 0.05;
      } else {
        crestWeights[i] = 0.0;
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('crestWeight', new THREE.BufferAttribute(crestWeights, 1));
    geometry.setAttribute('normCurvature', new THREE.BufferAttribute(normCurvature, 1));
  }

  // --------------------------------------------------------------------------
  // Load Anatomical 3D Mesh
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

        // Scale & Center
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetDim = 1.28;
        const scaleFactor = targetDim / maxDim;

        geometry.center();
        geometry.scale(scaleFactor, scaleFactor, scaleFactor);
        geometry.computeVertexNormals();

        // Curvature calculation
        computeMeshCurvature(geometry);

        // 1. Layer (a): Shape Layer (32k tiny dots)
        const shapeSampler = new THREE.MeshSurfaceSampler(baseMesh).build();
        buildShapePointsLayer(shapeSampler);

        // 2. Layer (b): Code Layer (1.8k gyri crest tokens)
        const codeSampler = new THREE.MeshSurfaceSampler(baseMesh)
          .setWeightAttribute('crestWeight')
          .build();
        buildCodeTokenLayer(codeSampler);

        resolve();
      }, undefined, reject);
    });
  }

  // --------------------------------------------------------------------------
  // Layer (a): Shape Points (32,000 Dots)
  // --------------------------------------------------------------------------
  function buildShapePointsLayer(sampler) {
    const count = state.shapeDotCount;

    const geometry = new THREE.BufferGeometry();
    const posArray        = new Float32Array(count * 3);
    const startPosArray   = new Float32Array(count * 3);
    const normalArray     = new Float32Array(count * 3);
    const curvatureArray  = new Float32Array(count);
    const hemisphereArray = new Float32Array(count);
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

      const explodeR = 1.6 + Math.random() * 1.8;
      startPosArray[i * 3]     = px * explodeR + (Math.random() - 0.5) * 0.4;
      startPosArray[i * 3 + 1] = py * explodeR + (Math.random() - 0.5) * 0.4;
      startPosArray[i * 3 + 2] = pz * explodeR + (Math.random() - 0.5) * 0.4;

      normalArray[i * 3]     = sampleNorm.x;
      normalArray[i * 3 + 1] = sampleNorm.y;
      normalArray[i * 3 + 2] = sampleNorm.z;

      curvatureArray[i] = sampleColor.r;
      hemisphereArray[i] = (px >= 0.0) ? 1.0 : -1.0;
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
        float tProg = clamp((uAssemblyProgress * 1.5 - aDelay), 0.0, 1.0);
        float ease = (uAssemblyProgress >= 0.999) ? 1.0 : (1.0 - pow(1.0 - tProg, 3.0));
        vec3 instPos = mix(aStartPos, position, ease);

        if (uCalmMode < 0.5) {
          instPos += aNormal * (sin(uTime * 1.2 + position.y * 3.5) * 0.003 * aCurvature);
        }

        float distToMouse = distance(instPos, uMouseWorld);
        if (distToMouse < 0.40 && uMouseWorld.x > -900.0) {
          float force = (1.0 - distToMouse / 0.40) * 0.06;
          instPos += aNormal * force;
        }

        vec4 mvPosition = modelViewMatrix * vec4(instPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(1.8 * (300.0 / -mvPosition.z), 1.2, 2.6);

        // Upper front-left key light
        vec3 keyLight = normalize(vec3(-0.6, 0.8, 0.9));
        vec3 viewNorm = normalize((modelViewMatrix * vec4(aNormal, 0.0)).xyz);
        float NdotL = max(0.0, dot(viewNorm, keyLight));
        float lambert = 0.22 + 0.78 * NdotL;

        // Curvature / AO
        float ao = mix(0.14, 1.20, aCurvature);
        float brightness = lambert * ao;

        vec3 baseCol = vec3(0.92, 0.94, 0.97);
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
  // Layer (b): Code Token Mesh (1,800 Crest Tokens)
  // --------------------------------------------------------------------------
  function buildCodeTokenLayer(sampler) {
    const count = state.codeTokenCount;

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
    const hemisphereArray = new Float32Array(count);

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

      const tangent = new THREE.Vector3();
      if (Math.abs(sampleNorm.dot(upVector)) > 0.90) {
        tangent.crossVectors(sampleNorm, new THREE.Vector3(0, 0, 1)).normalize();
      } else {
        tangent.crossVectors(sampleNorm, upVector).normalize();
      }

      tangent.x += Math.sin(cy * 10.0) * 0.12;
      tangent.z += Math.cos(cx * 10.0) * 0.12;
      tangent.normalize();

      const isRight = cx >= 0.0;
      const hemiSign = isRight ? 1.0 : -1.0;

      // Map lobes: 0=RAG, 1=Agents, 2=Full-Stack, 3=Data&ML, 4=LLMOps, 5=Research
      let regionId = 0;
      if (!isRight) {
        if (cz < -0.10 && cy > 0.05) {
          regionId = 0;
        } else if (cy > -0.10 && cz < 0.20) {
          regionId = 1;
        } else {
          regionId = 2;
        }
      } else {
        if (cz < 0.05 && cy > 0.05) {
          regionId = 3;
        } else if (cz >= 0.05 && cy > -0.10) {
          regionId = 4;
        } else {
          regionId = 5;
        }
      }

      const tokenIdx = i % totalTokens;
      const col = tokenIdx % cols;
      const row = Math.floor(tokenIdx / cols);
      const u = col / cols;
      const v = row / rows;

      posArray[i * 3]     = cx;
      posArray[i * 3 + 1] = cy;
      posArray[i * 3 + 2] = cz;

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
      ridgeArray[i]           = sampleColor.r;
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
        float tProg = clamp((uAssemblyProgress * 1.5 - aDelay), 0.0, 1.0);
        float ease = (uAssemblyProgress >= 0.999) ? 1.0 : (1.0 - pow(1.0 - tProg, 3.0));
        vec3 instPos = mix(aStartPos, aInstancePos, ease);

        if (uCalmMode < 0.5) {
          instPos += aNormal * (sin(uTime * 1.2 + aInstancePos.y * 3.5) * 0.0035 * aRidge);
        }

        float distToMouse = distance(instPos, uMouseWorld);
        if (distToMouse < 0.40 && uMouseWorld.x > -900.0) {
          float force = (1.0 - distToMouse / 0.40) * 0.06;
          instPos += aNormal * force;
        }

        float tokenWidth = 0.082 * aTokenAspect;
        float tokenHeight = 0.014;

        vec3 bitangent = normalize(cross(aNormal, aTangent));
        vec3 localOffset = (aTangent * (position.x * tokenWidth)) +
                           (bitangent * (position.y * tokenHeight)) +
                           (aNormal * 0.0035);

        vec3 worldPos = instPos + localOffset;
        vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        vUV = aAtlasUV + vec2((uv.x * aTokenAspect) / uAtlasCols, uv.y / uAtlasRows);

        vec3 col = vec3(0.93, 0.95, 0.97);
        if (aHemisphere < 0.0) {
          col = mix(col, vec3(0.80, 0.93, 0.98), 0.35 + uHoveredLeft * 0.45);
        } else {
          col = mix(col, vec3(0.97, 0.93, 0.84), 0.35 + uHoveredRight * 0.45);
        }

        if (uActiveRegion >= 0.0) {
          if (abs(aRegionId - uActiveRegion) < 0.1) {
            col = vec3(1.0, 0.60, 0.45);
          } else {
            col *= 0.30;
          }
        }

        vec3 keyLight = normalize(vec3(-0.6, 0.8, 0.9));
        vec3 viewNorm = normalize((modelViewMatrix * vec4(aNormal, 0.0)).xyz);
        float NdotL = max(0.0, dot(viewNorm, keyLight));
        float lambert = 0.25 + 0.75 * NdotL;
        float depthAtten = clamp(1.0 + mvPosition.z * 0.18, 0.70, 1.0);

        vColor = col * lambert * depthAtten * 1.15;

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
  // Neural Pathways
  // --------------------------------------------------------------------------
  function buildCurvedNeuralPathways() {
    const pathwayCount = 10;
    const pointsPerCurve = 36;
    const linePositions = [];
    const lineColors = [];

    for (let c = 0; c < pathwayCount; c++) {
      const angle = (c / pathwayCount) * Math.PI * 2;
      const isLeft = Math.cos(angle) < 0;

      const p0 = new THREE.Vector3(
        Math.cos(angle) * 0.75,
        (Math.random() - 0.5) * 0.6,
        Math.sin(angle) * 0.65
      );

      const p1 = new THREE.Vector3(
        Math.cos(angle + 0.4) * 1.15,
        p0.y + (Math.random() - 0.5) * 0.4,
        -0.45 - Math.random() * 0.40
      );

      const p2 = new THREE.Vector3(
        Math.cos(angle + 0.9) * 0.95,
        p1.y + (Math.random() - 0.5) * 0.5,
        -0.75 - Math.random() * 0.35
      );

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
      opacity: 0.14,
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
  // WebGL Events
  // --------------------------------------------------------------------------
  function setupEvents(container) {
    window.addEventListener('resize', onResize);

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

    // Recompile sequence
    const btnRecompile = document.getElementById('btn-recompile');
    if (btnRecompile) {
      btnRecompile.addEventListener('click', () => {
        state.assemblyStartTime = performance.now();
      });
    }

    // View buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        applyViewMode(view, false);
      });
    });
  }

  function onResize() {
    const container = document.getElementById('brain-canvas-container');
    if (!container || !renderer || !camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  // --------------------------------------------------------------------------
  // Main Render Loop
  // --------------------------------------------------------------------------
  function render(now) {
    requestAnimationFrame(render);

    // Frame Counting
    state.frameCount++;
    if (now - state.fpsLastCalculated >= 1000) {
      state.fps = Math.round((state.frameCount * 1000) / (now - state.fpsLastCalculated));
      state.frameCount = 0;
      state.fpsLastCalculated = now;

      const fpsElem = document.getElementById('hud-fps');
      if (fpsElem) fpsElem.textContent = state.fps;
    }

    // Assembly
    const elapsedAssembly = (now - state.assemblyStartTime) * 0.001;
    const dotsProgress = Math.min(elapsedAssembly / 1.2, 1.0);
    const tokensProgress = Math.max(0.0, Math.min((elapsedAssembly - 0.5) / 1.5, 1.0));

    // Organic Camera Drift
    const v = CONFIG.views[state.viewMode] || CONFIG.views.side;
    if (!state.isCalm) {
      if (!state.isDragging) {
        const t = now * 0.001;
        if (state.viewMode === 'side') {
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

    // Damping
    state.currentRot.y += (state.targetRot.y - state.currentRot.y) * 0.12;
    state.currentRot.x += (state.targetRot.x - state.currentRot.x) * 0.12;

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

    // Uniforms
    if (shapePointsMesh && shapePointsMesh.material.uniforms) {
      const u = shapePointsMesh.material.uniforms;
      u.uTime.value = now * 0.001;
      u.uAssemblyProgress.value = dotsProgress;
      u.uMouseWorld.value.copy(state.mouseWorldPos);
    }

    if (brainMesh && brainMesh.material.uniforms) {
      const u = brainMesh.material.uniforms;
      u.uTime.value = now * 0.001;
      u.uAssemblyProgress.value = tokensProgress;
      u.uMouseWorld.value.copy(state.mouseWorldPos);
    }

    if (neuralLinesMesh && !state.isCalm) {
      neuralLinesMesh.material.opacity = 0.14 + Math.sin(now * 0.002) * 0.04;
    }

    renderer.render(scene, camera);
  }

  // --------------------------------------------------------------------------
  // DOM & Portfolio Page Interactions
  // --------------------------------------------------------------------------
  function setupDOMInteractions() {
    // 1. Calm Mode Toggle
    const btnCalm = document.getElementById('btn-calm');
    if (btnCalm) {
      btnCalm.addEventListener('click', toggleCalmMode);
    }

    // 2. Mobile Drawer Navigation
    const navToggle = document.getElementById('nav-toggle');
    const mobileDrawer = document.getElementById('mobile-drawer');
    const mobileClose = document.getElementById('mobile-close');

    if (navToggle && mobileDrawer) {
      navToggle.addEventListener('click', () => {
        const isOpen = mobileDrawer.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
      });

      if (mobileClose) {
        mobileClose.addEventListener('click', () => {
          mobileDrawer.classList.remove('open');
          navToggle.setAttribute('aria-expanded', 'false');
          document.body.style.overflow = '';
        });
      }

      mobileDrawer.querySelectorAll('.mob-link, .btn-solid, .btn-outline').forEach(link => {
        link.addEventListener('click', () => {
          mobileDrawer.classList.remove('open');
          navToggle.setAttribute('aria-expanded', 'false');
          document.body.style.overflow = '';
        });
      });
    }

    // 3. Cortical Lobes Interactivity
    const lobeCards = document.querySelectorAll('.lobe-card');
    lobeCards.forEach(card => {
      const lobeId = parseInt(card.getAttribute('data-lobe'), 10);

      card.addEventListener('mouseenter', () => {
        highlightCorticalRegion(lobeId);
      });
      card.addEventListener('mouseleave', () => {
        if (state.activeRegionId === lobeId) {
          highlightCorticalRegion(-1);
        }
      });
      card.addEventListener('click', () => {
        if (state.activeRegionId === lobeId) {
          highlightCorticalRegion(-1);
        } else {
          highlightCorticalRegion(lobeId);
        }
      });
    });

    // 4. Copy Email to Clipboard
    const btnCopyEmail = document.getElementById('btn-copy-email');
    const toast = document.getElementById('toast');
    if (btnCopyEmail) {
      btnCopyEmail.addEventListener('click', () => {
        navigator.clipboard.writeText('vaibhavisingh6655@gmail.com').then(() => {
          if (toast) {
            toast.classList.add('visible');
            setTimeout(() => toast.classList.remove('visible'), 2400);
          }
        }).catch(() => {
          window.location.href = 'mailto:vaibhavisingh6655@gmail.com';
        });
      });
    }

    // 5. Scroll-linked Navigation Highlighting
    const sections = document.querySelectorAll('header.hero-section, section');
    const navLinks = document.querySelectorAll('.nav-link');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navLinks.forEach(link => {
            const href = link.getAttribute('href');
            link.classList.toggle('active', href === `#${id}`);
          });
        }
      });
    }, { rootMargin: '-40% 0px -40% 0px' });

    sections.forEach(sec => observer.observe(sec));

    // 6. Interactive Terminal Staggering on View
    const terminals = document.querySelectorAll('.terminal-screen');
    const termObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const rows = entry.target.querySelectorAll('.t-row');
          rows.forEach((row, idx) => {
            row.style.opacity = '0';
            row.style.transform = 'translateX(-6px)';
            setTimeout(() => {
              row.style.transition = 'all 0.25s ease';
              row.style.opacity = '1';
              row.style.transform = 'none';
            }, idx * 120);
          });
          termObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    terminals.forEach(term => termObserver.observe(term));
  }

  // Highlight Cortical Region in WebGL Shader
  function highlightCorticalRegion(regionId) {
    state.activeRegionId = regionId;
    document.querySelectorAll('.lobe-card').forEach(c => {
      const id = parseInt(c.getAttribute('data-lobe'), 10);
      c.classList.toggle('active', id === regionId);
    });

    if (brainMesh && brainMesh.material.uniforms) {
      brainMesh.material.uniforms.uActiveRegion.value = regionId;
    }

    if (regionId >= 0) {
      // Gently angle camera toward 3/4 view to give vantage on the selected lobe
      applyViewMode('threequarter', false);
    }
  }

  // Calm Mode
  function toggleCalmMode() {
    state.isCalm = !state.isCalm;
    try {
      localStorage.setItem('code_brain_calm_mode', state.isCalm ? 'true' : 'false');
    } catch (e) {}

    updateCalmUI();

    if (shapePointsMesh && shapePointsMesh.material.uniforms) {
      shapePointsMesh.material.uniforms.uCalmMode.value = state.isCalm ? 1.0 : 0.0;
    }
    if (brainMesh && brainMesh.material.uniforms) {
      brainMesh.material.uniforms.uCalmMode.value = state.isCalm ? 1.0 : 0.0;
    }
  }

  function updateCalmUI() {
    document.body.classList.toggle('calm-mode', state.isCalm);
    const btnCalm = document.getElementById('btn-calm');
    if (btnCalm) {
      const label = btnCalm.querySelector('.calm-label');
      if (label) {
        label.textContent = state.isCalm ? 'CALM (ON)' : 'CALM (OFF)';
      }
    }
  }

  // Load Tokens from JSON
  async function loadTokens() {
    try {
      const res = await fetch('/data/tokens.json');
      const json = await res.json();
      return json.tokens || json;
    } catch (e) {
      return ['retrieve()', 'generate()', 'embed()'];
    }
  }

  // Load Build Stamp from lab/build.json
  async function loadBuildStamp() {
    try {
      const res = await fetch('/lab/build.json?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        const stampElem = document.getElementById('footer-build-stamp');
        if (stampElem && data.stamp) {
          stampElem.textContent = data.stamp;
        }
      }
    } catch (e) {}
  }

  // Auto-init on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
