import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const app = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    gui: null,
    guiMesh: null,
    guiGroup: null,
    xrControllers: [],
    xrControllerGrips: [],
    video: null,
    texture: null,
    points: null,
    plane: null,
    axesGroup: null,
};

const COLOR_CONVERSIONS = `
    const vec3 D65 = vec3(0.95047, 1.00000, 1.08883); //reference white point

    vec3 srgbToLinear(vec3 c) {
        vec3 res;

        res.r = (c.r <= 0.04045) ? c.r / 12.92 : pow((c.r + 0.055) / 1.055, 2.4);
        res.g = (c.g <= 0.04045) ? c.g / 12.92 : pow((c.g + 0.055) / 1.055, 2.4);
        res.b = (c.b <= 0.04045) ? c.b / 12.92 : pow((c.b + 0.055) / 1.055, 2.4);

        return res;
    }

    vec3 linearRgbToXyz(vec3 rgb) {
        float X = 0.4124564 * rgb.r + 0.3575761 * rgb.g + 0.1804375 * rgb.b;
        float Y = 0.2126729 * rgb.r + 0.7151522 * rgb.g + 0.0721750 * rgb.b;
        float Z = 0.0193339 * rgb.r + 0.1191920 * rgb.g + 0.9503041 * rgb.b;
        return vec3(X, Y, Z);
    }

    vec3 xyzToXyY(vec3 xyz) {
        float sum = xyz.x + xyz.y + xyz.z;
        if (sum == 0.0) return vec3(0.0);
        float x = xyz.x / sum;
        float y = xyz.y / sum;
        return vec3(x, y, xyz.y);
    }

    float lab_f(float t) {
        float delta = 6.0 / 29.0;
        float delta3 = delta * delta * delta;

        if (t > delta3) {
            return pow(t, 1.0 / 3.0);
        } else {
            return t / (3.0 * delta * delta) + 4.0 / 29.0;
        }
    }

    vec3 xyzToLab(vec3 xyz) {
        float fx = lab_f(xyz.x / D65.x);
        float fy = lab_f(xyz.y / D65.y);
        float fz = lab_f(xyz.z / D65.z);

        float L = 116.0 * fy - 16.0;
        float a = 500.0 * (fx - fy);
        float b = 200.0 * (fy - fz);

        return vec3(L, a, b);
    }

    vec3 labToLch(vec3 lab) {
        float L = lab.x;
        float a = lab.y;
        float b = lab.z;

        float C = sqrt(a * a + b * b);
        float h = atan(b, a);  // radians, -pi..pi
        if (h < 0.0) h += 2.0 * 3.14159265359;
        h = h / (2.0 * 3.14159265359); // normalize to 0..1

        return vec3(L, C, h);
    }

    vec3 rgbToHsv(vec3 c) {
        float r = c.r;
        float g = c.g;
        float b = c.b;

        float cMax = max(r, max(g, b));
        float cMin = min(r, min(g, b));
        float delta = cMax - cMin;

        float h = 0.0;
        float s = (cMax == 0.0) ? 0.0 : delta / cMax;
        float v = cMax;

        if (delta == 0.0) {
            h = 0.0;
        } else if (cMax == r) {
            h = mod((g - b) / delta, 6.0);
        } else if (cMax == g) {
            h = (b - r) / delta + 2.0;
        } else {
            h = (r - g) / delta + 4.0;
        }

        h /= 6.0;
        if (h < 0.0) h += 1.0;

        return vec3(h, s, v);
    }

    vec3 convertToSpace(vec3 srgb, int mode) {
        vec3 linearRgb = srgbToLinear(srgb);
        vec3 xyz = linearRgbToXyz(linearRgb);

        if (mode == 0) {
            return srgb;              // RGB
        } else if (mode == 1) {
            return rgbToHsv(srgb);    // HSV
        } else if (mode == 2) {
            return xyz;               // XYZ
        } else if (mode == 3) {
            return xyzToXyY(xyz);     // xyY
        } else if (mode == 4) {
            return xyzToLab(xyz);     // LAB
        } else {
            return labToLch(xyzToLab(xyz)); // LCH
        }
    }

    vec3 normalizeMap(vec3 v, int mode) { // normalization especially needed for LCH and LAB
        if (mode == 0) {
            return v;
        } else if (mode == 1) {
            return v;
        } else if (mode == 2) {
            return v; 
        } else if (mode == 3) {
            return vec3(v.x, v.y, v.z);
        } else if (mode == 4) {
            float x = (v.x / 100.0);
            float y = ((v.y + 128.0) / 255.0);
            float z = ((v.z + 128.0) / 255.0);
            return vec3(x, y, z);
        } else {
            float x = (v.x / 100.0);
            float y = clamp(v.y / 150.0, 0.0, 1.0);
            float z = v.z;
            return vec3(x, y, z);
        }
    }

    float normalizeHeight(vec3 v, int mode, int channel) {
        float h = (channel == 0) ? v.x : (channel == 1) ? v.y : v.z;

        if (mode == 0) {          // RGB
            return h;
        } else if (mode == 1) {   // HSV
            return h;
        } else if (mode == 2) {   // XYZ
            return h;
        } else if (mode == 3) {   // xyY
            return h;
        } else if (mode == 4) {   // LAB
            if (channel == 0) return h / 100.0;
            return (h + 128.0) / 255.0;
        } else {                  // LCH
            if (channel == 0) return h / 100.0;
            if (channel == 1) return clamp(h / 150.0, 0.0, 1.0);
            return h; // h is in range 0..1
        }
    }
`;

// where the points are located, shader for the point cloud
const vertexShader = `
    ${COLOR_CONVERSIONS}
    varying vec2 vUv;
    uniform sampler2D tex;
    uniform int colorSpaceMode;

    void main() {
        vUv = uv;

        vec3 color = texture2D(tex, vUv).rgb;

        vec3 converted = convertToSpace(color, colorSpaceMode);
        vec3 colorPos = normalizeMap(converted, colorSpaceMode);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(colorPos, 1.0);
        gl_PointSize = 2.0;
    }
`;

// how the points look like, shader for the point cloud
const fragmentShader = `
    varying vec2 vUv;
    uniform sampler2D tex;
    uniform float densityMode;

    void main() {
        vec3 color = texture2D(tex, vUv).rgb;
        if (densityMode < 0.5) {
            gl_FragColor = vec4(color, 1.0); // color points
        } else {
            vec2 p = gl_PointCoord - vec2(0.5); // to center the coordinates
            float dist = length(p);
            if (dist > 0.5) {
                discard; // make it circular
            }
            gl_FragColor = vec4(color, 0.5*(1.0 - dist*2.0));
            
        }
    }
`;

// shader for the elevation map
const vertexShader2 = `
    ${COLOR_CONVERSIONS}
    varying vec2 vUv;
    uniform float scaleElevation; 
    uniform vec2 stepPixel;
    uniform sampler2D tex;
    uniform int colorSpaceMode;
    uniform int channel;

    void main() {
        vUv = uv;
        vec3 color = texture2D ( tex, vUv ).rgb;
        vec3 converted = convertToSpace(color, colorSpaceMode);
        float height;
        if (channel == 0) {
            height = converted.x;
        } else if (channel == 1) {
            height = converted.y;
        } else {
            height = converted.z;
        }

        vec3 tmp = position;
        height = normalizeHeight(converted, colorSpaceMode, channel);
        tmp.z = tmp.z + height*scaleElevation;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(tmp, 1.0);
    }
`;

// shader for the elevation map
const fragmentShader2 = `
    varying vec2 vUv;
    uniform sampler2D tex;

    void main() {
        vec3 color = texture2D ( tex, vUv ).rgb;
        gl_FragColor.rgb = color;
        gl_FragColor.a = 1.0;
    }
`;

// shader for Lambertian shading on the elevation map
const vertexShader3 = `
    ${COLOR_CONVERSIONS}

    varying vec2 vUv;
    varying vec3 vColor;
    varying float vLightFactor; // how much light hits the vertex

    uniform sampler2D tex;
    uniform float scaleElevation; 
    uniform vec2 stepPixel;
    uniform int colorSpaceMode;
    uniform int channel;

    uniform vec3 lightDirection;
    uniform float id; // light intensity

    float computeHeight(vec2 uv) {
        vec3 col = texture2D(tex, uv).rgb;
        vec3 converted = convertToSpace(col, colorSpaceMode);
        return normalizeHeight(converted, colorSpaceMode, channel) * scaleElevation;
    }

    void main() {
        vUv = uv;
        vColor = texture2D(tex, vUv).rgb;

        float height = computeHeight(vUv);

        //offset in texture coordinates
        float step = 0.01; 

        float hRight = computeHeight(vUv + vec2(step, 0.0));
        float hLeft  = computeHeight(vUv - vec2(step, 0.0));
        float hUp    = computeHeight(vUv + vec2(0.0, step));
        float hDown  = computeHeight(vUv - vec2(0.0, step));

        // how steep the slope is in each direction
        float slopeX = (hRight - hLeft) / (2.0 * step);
        float slopeY = (hUp - hDown) / (2.0 * step);

        vec3 normalVec = normalize(vec3(-slopeX, -slopeY, 1.0));
        vec3 lightVec = normalize(lightDirection);

        vLightFactor = id * max(dot(normalVec, lightVec), 0.0); // Lambertian shading output

        vec3 displaced = position;
        displaced.z += height;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
`;

const fragmentShader3 = `
    varying vec2 vUv;
    varying vec3 vColor;
    varying float vLightFactor;

    uniform vec3 lightColor;
    uniform float ambientFactor;

    void main() {
        vec3 ambient = vColor * ambientFactor;
        vec3 diffuse = vColor * lightColor * vLightFactor;

        gl_FragColor = vec4(ambient + diffuse, 1.0);
    }
`;

//basic scene setups
function setupScene(useXR = false) {
    app.container = document.createElement('div');
    document.body.appendChild(app.container);

    app.scene = new THREE.Scene();
    app.scene.background = new THREE.Color(0x3c3b3b);

    app.camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        50
    );
    app.camera.position.set(3, 1, 4);

    app.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    app.renderer.userData = {};
    app.renderer.setPixelRatio(window.devicePixelRatio);
    app.renderer.setSize(window.innerWidth, window.innerHeight);

    app.renderer.setClearColor(0x000000, 0); // to make the background transparent in MR

    app.renderer.xr.addEventListener('sessionstart', () => { // to switch between MR and VR modes
        const isMR = app.renderer.userData.xrMode === 'mr';

        if (isMR) {
            app.scene.background = null;
            app.renderer.setClearColor(0x000000, 0);
            app.renderer.setClearAlpha(0);
        } else {
            app.scene.background = new THREE.Color(0x3c3b3b);
            app.renderer.setClearColor(0x000000, 1);
            app.renderer.setClearAlpha(1);
        }
    });

    if (useXR) {
        app.renderer.xr.enabled = true;
        app.xrMode = true;
    }

    app.container.appendChild(app.renderer.domElement);

    app.controls = new OrbitControls(app.camera, app.renderer.domElement);
    app.controls.enableRotate = true;
    app.controls.enableDamping = true;
    app.controls.maxDistance = 30;
    app.controls.target.set(2.5, 1, 2.5);
    app.controls.update();

    const light = new THREE.DirectionalLight(0x888888, 1);
    light.position.set(10, 7, 5);
    app.scene.add(light);

    window.addEventListener('resize', onWindowResize);
}

// update the axis labels when changing color space
function updateAxes(labels) {
    if (app.axesGroup) {
        app.scene.remove(app.axesGroup);
        app.axesGroup = null;
    }

    createCoordinateBox(labels);
}

function GUI_ex1() {
    if (app.gui) {
        app.gui.destroy();
    }

    app.gui = new GUI();

    const colorModes = ['RGB', 'HSV', 'CIEXYZ', 'CIExyY', 'CIELAB', 'CIELCH'];

    const colorModeValues = {
        RGB: 0,
        HSV: 1,
        CIEXYZ: 2,
        CIExyY: 3,
        CIELAB: 4,
        CIELCH: 5
    };

    const axisLabels = {
        RGB: ['R', 'B', 'G'],
        HSV: ['H', 'S', 'V'],
        CIEXYZ: ['X', 'Y', 'Z'],
        CIExyY: ['x', 'y', 'Y'],
        CIELAB: ['L', 'a', 'b'],
        CIELCH: ['L', 'C', 'h']
    };

    const state = {
        colorIndex: 0,
        colorName: 'RGB',
        density: false,

    };

    function applyColorMode() {
        if (!app.points) return;

        state.colorName = colorModes[state.colorIndex];

        app.points.material.uniforms.colorSpaceMode.value = colorModeValues[state.colorName];
        updateAxes(axisLabels[state.colorName]);

        render();
    }

    function toggleDensity() {
        if (!app.points) return;

        state.density = !state.density; 

        app.points.material.uniforms.densityMode.value = state.density ? 1.0 : 0.0;
        app.points.material.blending = state.density ? THREE.AdditiveBlending : THREE.NormalBlending;
        app.points.material.depthWrite = state.density ? false : true;
        app.points.material.transparent = state.density ? true : false;
        app.points.material.needsUpdate = true;

        render();
}

    const controls = {
        pausePlay() {
            if (!app.video) return;

            if (app.video.paused) {
                app.video.play();
            } else {
                app.video.pause();
            }
        },

        add10sec() {
            if (!app.video) return;
            app.video.currentTime += 10;
        },

        prevColorSpace() {
            state.colorIndex = (state.colorIndex - 1 + colorModes.length) % colorModes.length;
            applyColorMode();
        },

        nextColorSpace() {
            state.colorIndex = (state.colorIndex + 1) % colorModes.length;
            applyColorMode();
        },

        toggleDensity() {
            toggleDensity();
        }
    };

    app.gui.add(controls, 'pausePlay').name('Pause / Play');
    app.gui.add(controls, 'add10sec').name('+10 sec');

    app.gui.add(controls, 'prevColorSpace').name('Prev ColorSpace');
    app.gui.add(controls, 'nextColorSpace').name('Next ColorSpace');

    app.gui.add(controls, 'toggleDensity').name('Density');

    applyColorMode();
}

function GUI_ex2() {
    if (app.gui) app.gui.destroy();
    app.gui = new GUI();

    let compCtrl = null;

    const params = {
        colorSpace: 'RGB',
        channel: 'R'
    };

    const spaces = {
        'RGB': { mode: 0, comps: ['R', 'G', 'B'] },
        'HSV': { mode: 1, comps: ['H', 'S', 'V'] },
        'CIEXYZ': { mode: 2, comps: ['X', 'Y', 'Z'] },
        'CIExyY': { mode: 3, comps: ['x', 'y', 'Y'] },
        'CIELAB': { mode: 4, comps: ['L', 'a', 'b'] },
        'CIELCH': { mode: 5, comps: ['L', 'C', 'H'] }
    };

    const pausePlayObj = {
        pausePlay() {
            if (!app.video) return;

            if (app.video.paused) {
                app.video.play();
            } else {
                app.video.pause();
            }
        },
        add10sec() {
            if (!app.video) return;
            app.video.currentTime += 10;
        }
    };

    app.gui.add(pausePlayObj, 'pausePlay').name('Pause/play video');
    app.gui.add(pausePlayObj, 'add10sec').name('Add 10 seconds');

    // initial component
    params.channel = spaces['RGB'].comps[0];
    params.colorSpace = 'RGB';

    function updateComps(val) {
        const newComps = spaces[val].comps;
        compCtrl.destroy();
        params.channel = newComps[0];
        compCtrl = app.gui.add(params, 'channel', newComps).name('Channel').onChange(updateShaderUniforms);
        updateShaderUniforms();
    }

    function updateShaderUniforms() {
        const spaceInfo = spaces[params.colorSpace];
        app.plane.material.uniforms.colorSpaceMode.value = spaceInfo.mode;
        app.plane.material.uniforms.channel.value = spaceInfo.comps.indexOf(params.channel);

        render();
    }

    app.gui.add(params, 'colorSpace', Object.keys(spaces))
        .name('Color Space')
        .onChange(updateComps);

    // initial channel dropdown
    compCtrl = app.gui
        .add(params, 'channel', spaces['RGB'].comps)
        .name('Channel')
        .onChange(updateShaderUniforms);

    // initial sync
    updateShaderUniforms();
}

function loadVideoSource(path, onReady) {
    const video = document.createElement('video');
    video.src = path;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.load();

    video.onloadeddata = () => {
        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.format = THREE.RGBAFormat;

        app.video = video;
        app.texture = texture;
        app.sourceWidth = video.videoWidth;
        app.sourceHeight = video.videoHeight;
        app.sourceType = 'video';

        onReady();
    };
}

// play the video as a texture on a plane
function createVideoPlane() {
    if (!app.texture) {
        console.warn('Texture not ready');
        return;
    }

    if (app.plane) {
        app.scene.remove(app.plane);
        app.plane.geometry.dispose();
        app.plane.material.dispose();
        app.plane = null;
    }

    const width = app.sourceWidth;
    const height = app.sourceHeight;

    const aspect = height / width;

    const geometry = new THREE.PlaneGeometry(2, 2 * aspect);

    const material = new THREE.MeshBasicMaterial({
        map: app.texture,
        side: THREE.DoubleSide
    });

    app.plane = new THREE.Mesh(geometry, material);
    app.plane.position.set(2, 1, -2);
    app.scene.add(app.plane);
}

function createPointCloud(texture) {
    const width = texture.image.videoWidth;
    const height = texture.image.videoHeight;
    console.log('Texture size:', width, 'x', height);
    console.log('Total points:', width * height);

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];

    const scale = 1.0;
    const factor = height / width;
    const step = 4; // to reduce the number of points for optimization

    for (let i = 0; i < width; i+=step) {
        for (let j = 0; j < height; j+=step) {
            const x = (i / width - 0.5) * scale;
            const y = (j / height - 0.5) * (scale * factor);

            positions.push(x, y, 0);
            uvs.push((i + 0.5) / width, (j + 0.5) / height);
        }
    }

    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(uvs, 2)
    );

    const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            tex: { value: texture },
            colorSpaceMode: { value: 0 }, // RGB by default
            densityMode: { value: 0.0 } // cloud of points by default
        },
        transparent: false,
        blending: THREE.NormalBlending, 
        depthWrite: true 
    });

    app.points = new THREE.Points(geometry, material);
    app.points.frustumCulled = false;
    app.points.position.set(-1.5, 0, -3);
    app.scene.add(app.points);
}

function createAxisWithTicks(start, end, color, labelText = '') {
    const group = new THREE.Group();
    const tickLength = 0.04; // How far the "stick" pokes out
    const thickWidth = 2;   // Match linewidth
    const arrowSize = 0.08;
    // main axis
    const mainGeom = new LineGeometry();
    mainGeom.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
    const mainMat = new LineMaterial({
        color: color,
        linewidth: thickWidth,
        resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
    });
    const mainLine = new Line2(mainGeom, mainMat);
    group.add(mainLine);

    // small divisions
    const axisVector = new THREE.Vector3().subVectors(end, start);
    const totalLength = axisVector.length();
    const direction = axisVector.clone().normalize();

    for (let i = 0.1; i < totalLength - 0.1; i+= 0.1) {
        // Calculate the center point of the tick
        const tickCenter = start.clone().add(direction.clone().multiplyScalar(i));
        
        let offset = new THREE.Vector3(0, tickLength, 0); 
        if (Math.abs(direction.y) > 0.1) { 
            offset = new THREE.Vector3(tickLength, 0, 0);
        }

        const tickStart = tickCenter.clone().sub(offset);
        const tickEnd = tickCenter.clone().add(offset);

        // Create the tick line
        const tickGeom = new LineGeometry();
        tickGeom.setPositions([
            tickStart.x, tickStart.y, tickStart.z,
            tickEnd.x, tickEnd.y, tickEnd.z
        ]);
        const tickLine = new Line2(tickGeom, mainMat); 
        group.add(tickLine);
    }

    const coneGeom = new THREE.ConeGeometry(arrowSize / 2, arrowSize, 8);
    const coneMat = new THREE.MeshBasicMaterial({ color: color });
    const arrowhead = new THREE.Mesh(coneGeom, coneMat);
    
    arrowhead.position.copy(end);
    
    arrowhead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    group.add(arrowhead);

    // add label
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 128; canvas.height = 128;
    ctx.font = 'Bold 80px Arial';
    ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
    ctx.textAlign = 'center';
    ctx.fillText(labelText, 64, 80);

    const amap = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: amap, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    
    sprite.position.copy(end.clone().add(direction.clone().multiplyScalar(0.15)));
    sprite.scale.set(0.18, 0.18, 1);
    group.add(sprite);

    return group;
}

function createCoordinateBox(labels = ['R','B','G']) {
    const size = 1.0;
    const center = size / 2.0;
    const offset = new THREE.Vector3(-1.5, 0, -3);

    const gridFloor = new THREE.GridHelper( 
        size, // total width
        10, // number of divisions
        0x828282, // color for center lines
        0x242423 // color for outer lines
    );
    gridFloor.position.set(center + offset.x, offset.y, center + offset.z);
    app.scene.add( gridFloor );
    console.log ( gridFloor.position );

    const boxGeometry = new THREE.BoxGeometry(size, size, size);
    const boxMaterial = new THREE.MeshStandardMaterial({
        color: 0x999999,     
        transparent: true,    
        opacity: 0.2,         
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide 
    });
    // Create LineSegments to draw the edges only
    const cage = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeometry), 
        boxMaterial
    );
    cage.position.set(center + offset.x, center + offset.y, center + offset.z);
    app.scene.add( cage );

    if (app.axesGroup) {
        app.scene.remove(app.axesGroup);
    }

    app.axesGroup = new THREE.Group();
    app.axesGroup.position.set(-1.5, 0, -3);

    const xAxis = createAxisWithTicks(
        new THREE.Vector3(0,0,0),
        new THREE.Vector3(size + 0.1, 0, 0),
        0xff0000,
        labels[0]
    );

    const yAxis = createAxisWithTicks(
        new THREE.Vector3(0,0,0),
        new THREE.Vector3(0, size + 0.1, 0),
        0x0000ff,
        labels[1]
    );

    const zAxis = createAxisWithTicks(
        new THREE.Vector3(0,0,0),
        new THREE.Vector3(0, 0, size + 0.1),
        0x00ff00,
        labels[2]
    );

    app.axesGroup.add(xAxis);
    app.axesGroup.add(yAxis);
    app.axesGroup.add(zAxis);

    app.scene.add(app.axesGroup);
}

// create the eleavtion map using height, exercise 2
function createElevationBasicMaterial(texture) {
    var scaleElevation = 0.5;
    return new THREE.ShaderMaterial( {
        vertexShader: vertexShader2,
        fragmentShader: fragmentShader2,
        uniforms: {
            scaleElevation: { value: scaleElevation },
            tex: { value: texture },
            colorSpaceMode: { value: 0 },
            channel: { value: 0 },
            }
    } );
}

function createElevationLightingMaterial(texture) {
    var scaleElevation = 0.5;
    return new THREE.ShaderMaterial({
        vertexShader: vertexShader3,
        fragmentShader: fragmentShader3,
        uniforms: {
            scaleElevation: { value: scaleElevation },
            stepPixel: {
                value: new THREE.Vector2(
                    1 / texture.image.videoWidth,
                    1 / texture.image.videoHeight
                )
            },
            tex: { value: texture },
            colorSpaceMode: { value: 0 },
            channel: { value: 0 },
            lightDirection: {
                value: new THREE.Vector3(0.4, 0.8, 1.0).normalize()
            },
            id: { value: 0.8 },
            lightColor: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
            ambientFactor: { value: 0.3 }
        }
    });
}

function createElevationMap(texture, ElevationMaterial) {
    var discret = 2;

    var scale = 1.0;
    var factor = texture.image.videoHeight/texture.image.videoWidth;
    var planeGeometry = new THREE.PlaneGeometry( scale, scale*factor, texture.image.videoWidth/discret, texture.image.videoHeight/discret );  
    app.plane = new THREE.Mesh( planeGeometry, ElevationMaterial);
    app.plane.material.side = THREE.DoubleSide;
    app.plane.rotation.x = -Math.PI / 2;
    app.plane.rotation.z = Math.PI;
    app.plane.position.set(0, 1.2, -2);

    app.scene.add(app.plane);

    var basicMaterial = new THREE.MeshBasicMaterial ( { map: texture } );
    var plane2 = new THREE.Mesh( planeGeometry, basicMaterial);
    plane2.material.side = THREE.DoubleSide;
    plane2.rotation.x = -Math.PI / 2;
    plane2.rotation.z = Math.PI;
    plane2.position.set(0, 0.8, -2);

    app.scene.add(plane2);
}

function render () {
	app.renderer.clear();
	app.renderer.render( app.scene, app.camera );
}

function animate() {	
	requestAnimationFrame(animate);
	app.controls.update();
	render();
}

function onWindowResize () {
	app.camera.aspect = ( window.innerWidth / window.innerHeight);
	app.camera.updateProjectionMatrix();
	app.renderer.setSize( window.innerWidth, window.innerHeight );
	render();
}

export function main_ex1 () {
    setupScene();
    loadVideoSource('../video.mp4', () => {
        GUI_ex1();
        createVideoPlane();
        createPointCloud(app.texture);
        createCoordinateBox();
        app.video.play();
        animate();
    });
}

export function main_ex2 () {
    setupScene(false);
    app.camera.rotation.x = -Math.PI; 
    app.camera.position.set(2, 2, 1);
    app.controls.target.set(0, 1, -3);
    app.controls.update();
    loadVideoSource('../video.mp4', () => {
        createElevationMap(app.texture, createElevationBasicMaterial(app.texture));
        GUI_ex2();
        app.video.play();
        animate();
    });

}

export function main_ex3 () {
    setupScene(false);
    app.camera.rotation.x = -Math.PI; 
    app.camera.position.set(2, 2, 1);
    app.controls.target.set(0, 1, -3);
    app.controls.update();
    loadVideoSource('../video.mp4', () => {
        createElevationMap(app.texture, createElevationLightingMaterial(app.texture));
        GUI_ex2();
        app.video.play();
        animate();
    });

}

// setup the XR controllers to be able to interact with the GUI in XR mode
function setupXRControllers() {
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -5)
    ]);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

    const controller1 = app.renderer.xr.getController(0);
    controller1.add(new THREE.Line(lineGeometry, lineMaterial));
    app.scene.add(controller1);

    const controller2 = app.renderer.xr.getController(1);
    controller2.add(new THREE.Line(lineGeometry, lineMaterial));
    app.scene.add(controller2);

    app.xrControllers = [controller1, controller2];

    const controllerModelFactory = new XRControllerModelFactory();

    const grip1 = app.renderer.xr.getControllerGrip(0);
    grip1.add(controllerModelFactory.createControllerModel(grip1));
    app.scene.add(grip1);

    const grip2 = app.renderer.xr.getControllerGrip(1);
    grip2.add(controllerModelFactory.createControllerModel(grip2));
    app.scene.add(grip2);

    app.xrControllerGrips = [grip1, grip2];
}

//build a special GUI for XR mode
function GUI_ex1_XR() {
    GUI_ex1(); // build the normal lil-gui first

    app.gui.domElement.style.position = 'absolute';
    app.gui.domElement.style.top = '0px';
    app.gui.domElement.style.left = '0px';
    app.gui.domElement.style.opacity = '0';
    app.gui.domElement.style.pointerEvents = 'auto';
    app.gui.domElement.style.zIndex = '-1';

    app.guiGroup = new InteractiveGroup(app.renderer, app.camera);

    if (app.xrControllers[0]) app.guiGroup.listenToXRControllerEvents(app.xrControllers[0]);
    if (app.xrControllers[1]) app.guiGroup.listenToXRControllerEvents(app.xrControllers[1]);

    app.scene.add(app.guiGroup);

    app.guiMesh = new HTMLMesh(app.gui.domElement);

    // place the GUI in front of the user
    app.guiMesh.position.set(0.2, 1.4, -1.4);
    app.guiMesh.rotation.y = -0.25;
    app.guiMesh.scale.setScalar(2.0);

    app.guiGroup.add(app.guiMesh);
}

// a separate GUI for the elevation map
function GUI_ex2_XRPanel() {
    if (app.gui) app.gui.destroy();
    app.gui = new GUI();

    const spaces = {
        'RGB':    { mode: 0, comps: ['R', 'G', 'B'] },
        'HSV':    { mode: 1, comps: ['H', 'S', 'V'] },
        'CIEXYZ': { mode: 2, comps: ['X', 'Y', 'Z'] },
        'CIExyY': { mode: 3, comps: ['x', 'y', 'Y'] },
        'CIELAB': { mode: 4, comps: ['L', 'a', 'b'] },
        'CIELCH': { mode: 5, comps: ['L', 'C', 'H'] }
    };

    const spaceNames = Object.keys(spaces);

    const state = {
        spaceIndex: 0,
        channelIndex: 0
    };

    function currentSpaceName() {
        return spaceNames[state.spaceIndex];
    }

    function currentSpace() {
        return spaces[currentSpaceName()];
    }

    function applyShaderUniforms() {
        if (!app.plane) return;

        const spaceInfo = currentSpace();

        state.channelIndex = Math.min(
            state.channelIndex,
            spaceInfo.comps.length - 1
        );

        app.plane.material.uniforms.colorSpaceMode.value = spaceInfo.mode;
        app.plane.material.uniforms.channel.value = state.channelIndex;

        spaceBtn.name('Color Space: ' + currentSpaceName());
        channelBtn.name('Channel: ' + spaceInfo.comps[state.channelIndex]);

        render();
    }

    const controls = {
        pausePlay() {
            if (!app.video) return;

            if (app.video.paused) {
                app.video.play();
            } else {
                app.video.pause();
            }
        },

        add10sec() {
            if (!app.video) return;
            app.video.currentTime += 10;
        },

        prevColorSpace() {
            state.spaceIndex =
                (state.spaceIndex - 1 + spaceNames.length) % spaceNames.length;

            state.channelIndex = 0;
            applyShaderUniforms();
        },

        nextColorSpace() {
            state.spaceIndex =
                (state.spaceIndex + 1) % spaceNames.length;

            state.channelIndex = 0;
            applyShaderUniforms();
        },

        prevChannel() {
            const comps = currentSpace().comps;

            state.channelIndex =
                (state.channelIndex - 1 + comps.length) % comps.length;

            applyShaderUniforms();
        },

        nextChannel() {
            const comps = currentSpace().comps;

            state.channelIndex =
                (state.channelIndex + 1) % comps.length;

            applyShaderUniforms();
        }
    };

    app.gui.add(controls, 'pausePlay').name('Pause / Play');
    app.gui.add(controls, 'add10sec').name('+10 sec');

    const spaceBtn = app.gui
        .add(controls, 'nextColorSpace')
        .name('Color Space: RGB');

    const channelBtn = app.gui
        .add(controls, 'nextChannel')
        .name('Channel: R');

    applyShaderUniforms();
}

// a wrapper for the GUI ex2
function GUI_ex2_XR() {
    GUI_ex2_XRPanel();

    app.gui.domElement.style.position = 'absolute';
    app.gui.domElement.style.top = '0px';
    app.gui.domElement.style.left = '0px';
    app.gui.domElement.style.opacity = '0';
    app.gui.domElement.style.pointerEvents = 'auto';
    app.gui.domElement.style.zIndex = '-1';

    app.guiGroup = new InteractiveGroup(app.renderer, app.camera);

    if (app.xrControllers[0]) {
        app.guiGroup.listenToXRControllerEvents(app.xrControllers[0]);
    }

    if (app.xrControllers[1]) {
        app.guiGroup.listenToXRControllerEvents(app.xrControllers[1]);
    }

    app.scene.add(app.guiGroup);

    app.guiMesh = new HTMLMesh(app.gui.domElement);

    app.guiMesh.position.set(1, 1.4, -1.4);
    app.guiMesh.rotation.y = -0.25;
    app.guiMesh.scale.setScalar(2.0);

    app.guiGroup.add(app.guiMesh);
}

// a separate renderer for XR
function rendererXR() { 
    app.renderer.setAnimationLoop(() => {
        if (app.controls && !app.renderer.xr.isPresenting) {
            app.controls.update();
        }
        render();
    });
}

export function main_ex1_XR () {
    setupScene(true);

    setupXRControllers();

    loadVideoSource('../video.mp4', () => {
        createVideoPlane();
        createPointCloud(app.texture);
        createCoordinateBox();

        GUI_ex1_XR();

        app.video.play();
        rendererXR();
    });

    return app.renderer;
}

export function main_ex2_XR () {
    setupScene(true);
    app.camera.rotation.x = -Math.PI; 
    app.camera.position.set(2, 0.8, 1);

    setupXRControllers();

    loadVideoSource('../video.mp4', () => {
        createElevationMap(app.texture, createElevationBasicMaterial(app.texture));
        GUI_ex2_XR();
        app.video.play();
        animate();
        rendererXR();
    });

    return app.renderer;
}

export function main_ex3_XR () {
    setupScene(true);
    app.camera.rotation.x = -Math.PI; 
    app.camera.position.set(2, 0.8, 1);

    setupXRControllers();

    loadVideoSource('../video.mp4', () => {
        createElevationMap(app.texture, createElevationLightingMaterial(app.texture));
        GUI_ex2_XR();
        app.video.play();
        animate();
        rendererXR();
    });

    return app.renderer;
}