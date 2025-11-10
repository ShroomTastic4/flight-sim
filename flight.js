import * as THREE from "https://unpkg.com/three@0.163.0/build/three.module.js";

const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({antialias: true, canvas});

const camera = new THREE.PerspectiveCamera( 75, 2, 0.1, 100 );
camera.position.set( 0, 3, -7 );

const scene = new THREE.Scene();

const radius = 100;
const geometries = [ new THREE.BoxGeometry( 1, 1, 1 ), new THREE.SphereGeometry(radius, 64, 32) ];

const arrow1 = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, 1), // direction (will update)
  new THREE.Vector3(0, 0, 0), // origin
  10,                          // length
  0xff0000                    // color
);
const arrow2 = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, 1), // direction (will update)
  new THREE.Vector3(0, 0, 0), // origin
  3,                          // length
  0x0000ff                    // color
);
const arrow3 = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, 1), // direction (will update)
  new THREE.Vector3(0, 0, 0), // origin
  3,                          // length
  0x0000ff                    // color
);
scene.add(arrow1);
scene.add(arrow2);
scene.add(arrow3);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(radius*8, radius*8, radius*8);
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.5);//prevColor 0x88aff
fillLight.position.set(-radius*8, -radius*8, -radius*8);
scene.add(fillLight);

const ambient = new THREE.AmbientLight(0xaaaaaa, 1.3);//previous color 0x404040 intensity 0.5
scene.add(ambient);

const loader = new THREE.TextureLoader();
const texture = loader.load(
    'resources/sea.jpg',
    () => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        scene.background = texture;   
    }
);

const forward = new THREE.Vector3();
const globals = {
  time: 0,
  deltaTime: 0,
  moveSpeed: 16,
}

//previous cube color 0x44aa88
const instances = [ 
   mkInstance( geometries[0], 0xcc2200),
   mkInstance( geometries[1], 0x08844)
];

function resizeRenderer( renderer, maxPixelCount=3840*2160 ) {
    const canvas = renderer.domElement;
    const pixelRatio = window.devicePixelRatio;
    let width = Math.floor( canvas.clientWidth * pixelRatio );
    let height = Math.floor( canvas.clientHeight * pixelRatio );
    const pixelCount = width * height;
    const renderScale = pixelCount > maxPixelCount ? Math.sqrt( maxPixelCount / pixelCount ) : 1;
    width = Math.floor( width * renderScale );
    height = Math.floor( height * renderScale );
    
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
        renderer.setSize( width, height, false );
    }
    return needResize
}

function mkInstance( geometry, color) {
    const material = new THREE.MeshPhongMaterial( {color} );
    const instance = new THREE.Mesh( geometry, material );
    
    scene.add(instance);
    
    return instance;
}

function removeArrayElement(array, element) {
  const ndx = array.indexOf(element);
  if (ndx >= 0) {
    array.splice(ndx, 1);
  }
}

// Base for all components
class Component {
  constructor(gameObject) {
    this.gameObject = gameObject;
  }
  update() {
  }
}
 
class GameObject {
  constructor(parent, name) {
    this.name = name;
    this.components = [];
    this.transform = new THREE.Object3D();
    parent.add(this.transform);
  }
  addComponent(ComponentType, ...args) {
    const component = new ComponentType(this, ...args);
    this.components.push(component);
    return component;
  }
  removeComponent(component) {
    removeArrayElement(this.components, component);
  }
  getComponent(ComponentType) {
    return this.components.find(c => c instanceof ComponentType);
  }
  update() {
    for (const component of this.components) {
      component.update();
    }
  }
}

class SafeArray {
  constructor() {
    this.array = [];
    this.addQueue = [];
    this.removeQueue = new Set();
  }
  get isEmpty() {
    return this.addQueue.length + this.array.length > 0;
  }
  add(element) {
    this.addQueue.push(element);
  }
  remove(element) {
    this.removeQueue.add(element);
  }
  forEach(fn) {
    this._addQueued();
    this._removeQueued();
    for (const element of this.array) {
      if (this.removeQueue.has(element)) {
        continue;
      }
      fn(element);
    }
    this._removeQueued();
  }
  _addQueued() {
    if (this.addQueue.length) {
      this.array.splice(this.array.length, 0, ...this.addQueue);
      this.addQueue = [];
    }
  }
  _removeQueued() {
    if (this.removeQueue.size) {
      this.array = this.array.filter(element => !this.removeQueue.has(element));
      this.removeQueue.clear();
    }
  }
}

class GameObjectManager {
  constructor() {
    this.gameObjects = new SafeArray();
  }
  createGameObject(parent, name) {
    const gameObject = new GameObject(parent, name);
    this.gameObjects.add(gameObject);
    return gameObject;
  }
  removeGameObject(gameObject) {
    this.gameObjects.remove(gameObject);
  }
  update() {
    this.gameObjects.forEach(gameObject => gameObject.update());
  }
}

class InputManager {
  constructor() {
    this.mouseX = 0;
    this.mouseY = 0;
  
    this.keys = {};
    const keyMap = new Map();
 
    const setKey = (keyName, pressed) => {
      const keyState = this.keys[keyName];
      keyState.justPressed = pressed && !keyState.down;
      keyState.down = pressed;
    };
 
    const addKey = (keyCode, name) => {
      this.keys[name] = { down: false, justPressed: false };
      keyMap.set(keyCode, name);
    };
 
    const setKeyFromKeyCode = (keyCode, pressed) => {
      const keyName = keyMap.get(keyCode);
      if (!keyName) {
        return;
      }
      setKey(keyName, pressed);
    };
 
    addKey(37, 'left');
    addKey(39, 'right');
    addKey(38, 'up');
    addKey(40, 'down');
    addKey(65, 'a');
    addKey(68, 'd');
    addKey(87, 'w');
    addKey(83, 's');
    addKey(32, 'spacebar');
    
    window.addEventListener('keydown', (e) => {
      setKeyFromKeyCode(e.keyCode, true);
    });
    window.addEventListener('keyup', (e) => {
      setKeyFromKeyCode(e.keyCode, false);
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = (e.clientX / window.innerWidth) * 2 - 1; // Normalize X to -1 to 1
      this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1; // Normalize Y to -1 to 1 (invert for Three.js Y-axis)
    });
  }
  update() {
    for (const keyState of Object.values(this.keys)) {
      if (keyState.justPressed) {
        keyState.justPressed = false;
      }
    }
  }
}

class Player extends Component {
  constructor(gameObject) {
    super(gameObject);
    this.shape = this.gameObject.addComponent( Shape, instances[0], new THREE.Vector3( 0, radius, -radius/2) );
    this.prevForward = new THREE.Vector3(0, 0, 1);
    this.horzAngle = 0;
    this.vertAngle = 0;
    this.tempVec = new THREE.Vector3();
  }
  update() {
    const {deltaTime} = globals;
    let {moveSpeed} = globals;
    const {transform} = this.gameObject;
    
    moveSpeed = (inputManager.keys.spacebar.down ? 48 : 16 );
    const turnSpeed = 16/4 * deltaTime;
                              
    const planetPos = gameObjectManager.gameObjects.array[1].components[1].planetPos
                 
    const pos = transform.getWorldPosition( new THREE.Vector3() );
    this.gravityDir = planetPos.clone().sub(pos).normalize();
    
    let upDir = this.gravityDir.clone().negate();
    transform.up.copy(upDir);
    
    let rightDir = new THREE.Vector3().crossVectors(upDir, this.prevForward).normalize();
    const forwardDir = new THREE.Vector3().crossVectors(rightDir, upDir).normalize();
    
    const left = ( inputManager.keys.left.down || inputManager.keys.a.down );
    const right = ( inputManager.keys.right.down || inputManager.keys.d.down );
    const up = ( inputManager.keys.up.down || inputManager.keys.w.down );
    const down = ( inputManager.keys.down.down || inputManager.keys.s.down );
    
    const dH = (left ? 1 : 0) + (right ? -1 : 0);
    const dV = (up ? -1 : 0) + (down ? 1 : 0);
    
    this.horzAngle = (this.horzAngle + dH * turnSpeed ) % (Math.PI * 2);
    this.vertAngle += dV * turnSpeed;
    this.vertAngle = Math.max(-Math.PI / 2 + 0.55, Math.min(Math.PI / 2 - 0.55, this.vertAngle));
    
    const dir = transform.getWorldDirection( new THREE.Vector3());
    
    rightDir = new THREE.Vector3().crossVectors(upDir, dir).normalize();
    
    const rotatedForward = forwardDir.clone()
            .applyAxisAngle(upDir, this.horzAngle)
            .applyAxisAngle(rightDir, this.vertAngle)
            .normalize();
    
    transform.lookAt(pos.clone().add(rotatedForward));
    
    transform.position.addScaledVector(rotatedForward, moveSpeed/4 * deltaTime );
    
    this.prevForward = forwardDir.clone();
    
    arrow1.setDirection(rotatedForward);
    arrow1.position.copy(pos);
    
    arrow2.setDirection(rightDir.clone().negate());
    arrow2.position.copy(pos);
    
    arrow3.setDirection(rightDir);
    arrow3.position.copy(pos);
  }
}

class Shape extends Component { 
  constructor(gameObject, model, pos) {
    super(gameObject);
    this.model = model;
    this.gameObject.transform.add(this.model);
    this.gameObject.transform.position.copy(pos);
  }
}

class Planet extends Component {
  constructor(gameObject, model, pos) {
    super(gameObject);
    this.planetPos = pos;
    this.shape = this.gameObject.addComponent(Shape, model, pos );
  }
}

class Camera extends Component {
  constructor(gameObject, target, pos) {
    super(gameObject);
    this.camTarget = target;
    this.camPos = pos;
    this.targetPos = new THREE.Vector3();
    camera.up.copy(new THREE.Vector3(0, 1, 0));
    this.currentLook;
  }
  update() {
    const target = this.camTarget;
    let offset = this.camPos.clone();
    
    target.transform.getWorldPosition(this.targetPos);    
    offset.applyQuaternion(target.transform.quaternion);
    const desiredCamPos = this.targetPos.clone().add(offset);
    
    camera.position.lerp( desiredCamPos, 0.1 );
    
    const mouseX = inputManager.mouseX;
    const mouseY = inputManager.mouseY;
    
    let mouseOffset = new THREE.Vector3( -mouseX * 3/2 * Math.PI, mouseY * 3/2 * Math.PI, 0);
    mouseOffset.applyQuaternion(target.transform.quaternion);
    const lookPos = this.targetPos.clone().add(mouseOffset);
    
    this.currentLook = this.currentLook || this.targetPos.clone();
    this.currentLook.lerp(lookPos, 0.1);
    camera.lookAt(this.currentLook);
    camera.up.lerp(target.transform.up, 0.1).normalize();
  }
}

const gameObjectManager = new GameObjectManager();
const inputManager = new InputManager();

let gameObj = gameObjectManager.createGameObject(scene, 'player');
gameObj.addComponent(Player);

gameObj = gameObjectManager.createGameObject(scene, 'planet');
gameObj.addComponent(Planet, instances[1], new THREE.Vector3(0, 0, 0));

gameObjectManager.update();
const player = gameObjectManager.gameObjects.array[0];

gameObj = gameObjectManager.createGameObject(scene, 'camera');
gameObj.addComponent(Camera, player, new THREE.Vector3( 0, 3, -7));

let then = 0;
function animate( now ) {

    globals.time = now * 0.001;
    globals.deltaTime = Math.min(globals.time - then, 1 / 20);
    then = globals.time
    
    if ( resizeRenderer( renderer ) ) {
        const canvas = renderer.domElement;
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
    }

    gameObjectManager.update();
    inputManager.update();
    
    const player = gameObjectManager.gameObjects.array[0];
    const planet = gameObjectManager.gameObjects.array[1];
    
    let dist = player.transform.position.clone().sub(player.transform.up);
    dist = dist.distanceTo(planet.transform.position);
    
    if ( dist <= radius ) {
      const collisionDist = Math.abs(dist - radius);
      const upDir = player.transform.up.clone();
      const pushVec = upDir.multiplyScalar(collisionDist);
      player.transform.position.add(pushVec);
    }

    renderer.render( scene, camera );
}
renderer.setAnimationLoop( animate );