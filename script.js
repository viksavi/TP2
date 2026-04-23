import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Line2 } from 'three/addons/lines/Line2.js';

const app = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    gui: null,
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

    vec3 normalizeMap(vec3 v, int mode) {
        if (mode == 0) {
            return v * 5.0;
        } else if (mode == 1) {
            return v * 5.0;
        } else if (mode == 2) {
            return v * 5.0; 
        } else if (mode == 3) {
            return vec3(v.x, v.y, v.z) * 5.0;
        } else if (mode == 4) {
            float x = (v.x / 100.0) * 5.0;
            float y = ((v.y + 128.0) / 255.0) * 5.0;
            float z = ((v.z + 128.0) / 255.0) * 5.0;
            return vec3(x, y, z);
        } else {
            float x = (v.x / 100.0) * 5.0;
            float y = clamp(v.y / 150.0, 0.0, 1.0) * 5.0;
            float z = v.z * 5.0;
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
            return h; // h already 0..1
        }
    }
`;

// where the points are located 
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

// how the points look like
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

const fragmentShader2 = `
    varying vec2 vUv;
    uniform sampler2D tex;

    void main() {
        vec3 color = texture2D ( tex, vUv ).rgb;
        gl_FragColor.rgb = color;
        gl_FragColor.a = 1.0;
    }
`;

function setupScene() {
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
    app.camera.position.set(2.5, 2.5, 20);

    app.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    app.renderer.setPixelRatio(window.devicePixelRatio);
    app.renderer.setSize(window.innerWidth, window.innerHeight);

    app.container.appendChild(app.renderer.domElement);

    app.controls = new OrbitControls(app.camera, app.renderer.domElement);
    app.controls.enableRotate = true;
    app.controls.enableDamping = true;
    app.controls.maxDistance = 30;
    app.controls.target.set(2.5, 2.5, 2.5);
    app.controls.update();

    const light = new THREE.DirectionalLight(0x888888, 1);
    light.position.set(10, 7, 5);
    app.scene.add(light);

    window.addEventListener('resize', onWindowResize);
}

function GUI_ex1() {
    if (app.gui) {
        app.gui.destroy();
    }

    app.gui = new GUI();

    const params = {
        colorSpace: 'RGB',
        density: false
    };

    const colorModes = {
        RGB: 0,
        HSV: 1,
        CIEXYZ: 2,
        CIExyY: 3,
        CIELAB: 4,
        CIELCH: 5
    };

    const axisLabels = {
        RGB: ['R','B','G'],
        HSV: ['H','S','V'],
        CIEXYZ: ['X','Y','Z'],
        CIExyY: ['x','y','Y'],
        CIELAB: ['L','a','b'],
        CIELCH: ['L','C','h']
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

    app.gui.add(params, 'colorSpace', Object.keys(colorModes))
        .name('Color Space')
        .onChange((value) => {
            if (!app.points) return;

            app.points.material.uniforms.colorSpaceMode.value = colorModes[value];
            updateAxes(axisLabels[value]);
            render();
        });

    app.gui.add(params, 'density')
        .name('Density')
        .onChange((value) => {
            if (!app.points) return;

            app.points.material.uniforms.densityMode.value = value ? 1.0 : 0.0;
            app.points.material.blending = value ? THREE.AdditiveBlending : THREE.NormalBlending;
            app.points.material.depthWrite = value ? false : true;
            app.points.material.needsUpdate = true;
            render();
        });
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

    const geometry = new THREE.PlaneGeometry(5, 5 * aspect);

    const material = new THREE.MeshBasicMaterial({
        map: app.texture,
        side: THREE.DoubleSide
    });

    app.plane = new THREE.Mesh(geometry, material);
    app.plane.position.set(2.5, 2.5, -2);
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

    const scale = 5.0;
    const factor = height / width;

    for (let i = 0; i < width; i++) {
        for (let j = 0; j < height; j++) {
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
            colorSpaceMode: { value: 0 },
            densityMode: { value: 0.0 } // cloud of points by default
        },
        transparent: false,
        blending: THREE.NormalBlending, 
        depthWrite: true 
    });

    app.points = new THREE.Points(geometry, material);
    app.points.frustumCulled = false;
    app.scene.add(app.points);
}

function createAxisWithTicks(start, end, color, labelText = '') {
    const group = new THREE.Group();
    const tickLength = 0.2; // How far the "stick" pokes out
    const thickWidth = 3;   // Match linewidth
    const arrowSize = 0.3;
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

    for (let i = 0.5; i < totalLength; i+= 0.5) {
        // Calculate the center point of the tick
        const tickCenter = start.clone().add(direction.clone().multiplyScalar(i));
        
        let offset = new THREE.Vector3(0, tickLength, 0); 
        if (Math.abs(direction.y) > 0.5) { 
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
    
    sprite.position.copy(end.clone().add(direction.clone().multiplyScalar(0.6)));
    sprite.scale.set(0.8, 0.8, 1);
    group.add(sprite);

    return group;
}

function createCoordinateBox(labels = ['R','B','G']) {
    const size = 5.0;
    const center = size / 2.0;

    const gridFloor = new THREE.GridHelper( 
        size, // total width
        10, // number of divisions
        0x828282, // color for center lines
        0x242423 // color for outer lines
    );
    gridFloor.position.set(center, 0, center);
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
    cage.position.set(center, center, center);
    app.scene.add( cage );

    if (app.axesGroup) {
        app.scene.remove(app.axesGroup);
    }

    app.axesGroup = new THREE.Group();

    const xAxis = createAxisWithTicks(
        new THREE.Vector3(0,0,0),
        new THREE.Vector3(size + 0.5, 0, 0),
        0xff0000,
        labels[0]
    );

    const yAxis = createAxisWithTicks(
        new THREE.Vector3(0,0,0),
        new THREE.Vector3(0, size + 0.5, 0),
        0x0000ff,
        labels[1]
    );

    const zAxis = createAxisWithTicks(
        new THREE.Vector3(0,0,0),
        new THREE.Vector3(0, 0, size + 0.5),
        0x00ff00,
        labels[2]
    );

    app.axesGroup.add(xAxis);
    app.axesGroup.add(yAxis);
    app.axesGroup.add(zAxis);

    app.scene.add(app.axesGroup);
}

function createElevationMap(texture) {
    var scaleElevation = 0.75;
    var discret = 2;

    var basicElevationMaterial = new THREE.ShaderMaterial( {
        vertexShader: vertexShader2,
        fragmentShader: fragmentShader2,
        uniforms: {
            scaleElevation: { value: scaleElevation },
            tex: { value: texture },
            colorSpaceMode: { value: 0 },
            channel: { value: 0 },
            }
    } );

    var scale = 4.0;
    var factor = texture.image.videoHeight/texture.image.videoWidth;
    var planeGeometry = new THREE.PlaneGeometry( scale, scale*factor, texture.image.videoWidth/discret, texture.image.videoHeight/discret );  
    app.plane = new THREE.Mesh( planeGeometry, basicElevationMaterial);
    app.plane.material.side = THREE.DoubleSide;
    app.plane.position.z = -0.8;
    app.plane.rotation.z = Math.PI;

    app.scene.add(app.plane);

    var basicMaterial = new THREE.MeshBasicMaterial ( { map: texture } );
    var plane2 = new THREE.Mesh( planeGeometry, basicMaterial);
    plane2.material.side = THREE.DoubleSide;
    plane2.position.z = -1.6;
    plane2.rotation.z = Math.PI;

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
    setupScene();
    app.camera.rotation.x = -Math.PI; 
    app.camera.position.set(4, 4, 5);
    loadVideoSource('../video.mp4', () => {
        createElevationMap(app.texture);
        GUI_ex2();
        app.video.play();
        animate();
    });

}