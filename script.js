import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { add } from 'three/tsl';

let camera, controls, scene, renderer, container;
let plan;

// VIDEO AND THE ASSOCIATED TEXTURE
let video,videoTexture;

// GUI
let gui;

let points;
let axesGroup;

// where the points are located 
const vertexShader = `
    varying vec2 vUv;
    uniform sampler2D tex;
    uniform int colorSpaceMode;

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

function addGUIControls() {
    const params = {
        colorSpace: 'RGB',
        density: false
    };

    const axisLabels = {
        RGB: ['R','B','G'],
        HSV: ['H','S','V'],
        CIEXYZ: ['X','Y','Z'],
        CIExyY: ['x','y','Y'],
        CIELAB: ['L','a','b'],
        CIELCH: ['L','C','h']
    };

    const colorModes = {
        RGB: 0,
        HSV: 1,
        CIEXYZ: 2,
        CIExyY: 3,
        CIELAB: 4,
        CIELCH: 5
    };

    gui.add(params, 'colorSpace', ['RGB', 'HSV', 'CIEXYZ', 'CIExyY', 'CIELAB', 'CIELCH'])
    .onChange((value) => {
        if (!points) return;

        const mode = colorModes[value];

        points.material.uniforms.colorSpaceMode.value = mode;

        createCoordinateBox(axisLabels[value]);

        render();
    });

    gui.add(params, 'density')
    .name('Density mode')
    .onChange((value) => {
        if (!points) return;
        points.material.uniforms.densityMode.value = value ? 1.0 : 0.0;
        points.material.blending = value ? THREE.AdditiveBlending : THREE.NormalBlending;
        points.material.depthWrite = value ? false : true;
        points.material.needsUpdate = true;
        render();
    });

}

function initEx1 () {
	
    container = document.createElement( 'div' );
	document.body.appendChild( container );
	
	scene = new THREE.Scene(); 
    scene.background = new THREE.Color(0x3c3b3b);

    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        50
    );
    camera.position.set(2.5, 2.5, 20); 

    const light = new THREE.DirectionalLight(0x888888, 1);
    light.position.set(10, 7, 5);
    scene.add(light);

	renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
	renderer.autoClear = false;
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.shadowMap.enabled = false;

	container.appendChild( renderer.domElement );

	controls = new OrbitControls( camera, renderer.domElement );
	controls.minDistance = 0.005;
	controls.maxDistance = 30;
	controls.enableRotate = true;
    controls.target.set(2.5, 2.5, 2.5);
	controls.addEventListener( 'change', render );
	controls.update();

	video = document.createElement('video');
	video.src = '../video.mp4';
	video.load();
	video.muted = true;
	video.loop = true;

	video.onloadeddata = function () 
	{ 
	videoTexture = new THREE.VideoTexture( video );
	videoTexture.minFilter = THREE.NearestFilter;
	videoTexture.magFilter = THREE.NearestFilter;
	videoTexture.generateMipmaps = false; 
	videoTexture.format = THREE.RGBAFormat;
	
	var geometry = new THREE.PlaneGeometry( 5, 5 * video.videoHeight/video.videoWidth );
	var material = new THREE.MeshBasicMaterial( { map: videoTexture, side : THREE.DoubleSide } );
	plan = new THREE.Mesh( geometry, material );
	plan.receiveShadow = false;
	plan.castShadow = false;
    plan.position.set(2.5, 2.5, -2);
	scene.add( plan );

	var pausePlayObj =
	{
    	pausePlay: function () 
    	{
			if (!video.paused)
			{
				console.log ( "pause" );
				video.pause();
			}
			else
			{
				console.log ( "play" );
				video.play();
			}
		},
		add10sec: function ()
		{
			video.currentTime = video.currentTime + 10;
			console.log ( video.currentTime  );
		}
	};
	
	gui = new GUI();
    gui.add(pausePlayObj,'pausePlay').name ('Pause/play video');
    gui.add(pausePlayObj,'add10sec').name ('Add 10 seconds');
    addGUIControls();

	video.play();
    createPointCloud(videoTexture);

	};
	
	window.addEventListener( 'resize', onWindowResize, false );
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

    points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
    createCoordinateBox();
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
    scene.add( gridFloor );
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
    scene.add( cage );

    if (axesGroup) {
        scene.remove(axesGroup);
    }

    axesGroup = new THREE.Group();

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

    axesGroup.add(xAxis);
    axesGroup.add(yAxis);
    axesGroup.add(zAxis);

    scene.add(axesGroup);
}

function render () {
	renderer.clear();
	renderer.render( scene, camera );
}

function animate() {	
	requestAnimationFrame(animate);
	controls.update();
	render();
}

function onWindowResize () {
	camera.aspect = ( window.innerWidth / window.innerHeight);
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
	render();
}

export function main_ex1 () {
    initEx1();
    animate();
}