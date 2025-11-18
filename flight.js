import * as THREE from 'https://unpkg.com/three@0.155.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.155.0/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'https://unpkg.com/three@0.155.0/examples/jsm/utils/SkeletonUtils.js';

const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({antialias: true, canvas});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera( 75, 2, 0.1, 100 );
camera.position.set( 0, 3, -7 );

const scene = new THREE.Scene();

const manager = new THREE.LoadingManager();
manager.onLoad = init;
const models = {
  plane:    { url: 'resources/plane/scene.gltf' },
  kami: { url: 'resources/KamiPlanet/scene_cleaned.gltf' }
};
{
  const gltfLoader = new GLTFLoader(manager);
  for (const model of Object.values(models)) {
    gltfLoader.load(model.url, (gltf) => {
      model.gltf = gltf;
      gltf.scene.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
    });
  }
}

function prepModelsAndAnimations() {
  Object.values(models).forEach(model => {
    const animsByName = {};
    model.gltf.animations.forEach((clip) => {
      animsByName[clip.name] = clip;
    });
    model.animations = animsByName;
  });
}

const globals = {
  time: 0,
  deltaTime: 0,
  moveSpeed: 6,
}

const ambient = new THREE.AmbientLight(0xaaaaaa, 1.5);//previous color 0x404040 intensity 0.5
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


const geometries = [ new THREE.BoxGeometry( 1, 1, 1 )]; 

const instances = [ 
   mkInstance( geometries[0], 0xaa8844),
   mkInstance( geometries[0], 0x44aa88),
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
    
    instance.castShadow = true;
    instance.receiveShadow = true;
    
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
  constructor(gameObject, pos) {
    super(gameObject);
    const model = models.plane;

    this.skin = gameObject.addComponent(SkinInstance, model);
    this.skin.animRoot.scale.set(2,2,2);
    this.skin.animRoot.position.set(0,-this.skin.size.y/2,0);
    
    this.shape = this.gameObject.addComponent( Shape, 0, pos );
    this.planet;
    this.velocity = globals.moveSpeed;
    
    this.prevForward = new THREE.Vector3(0, 0, 1);
    this.horzAngle = 0;
    this.vertAngle = 0;
    this.smoothPos = new THREE.Vector3(); 
  }
  update() {
    const {deltaTime} = globals;
    const {transform} = this.gameObject;
    let moveSpeed = this.velocity;
    //console.log(moveSpeed);
    
    const turnSpeed = moveSpeed/4 * deltaTime;
    moveSpeed *= (inputManager.keys.spacebar.down ? 3 : 1);
                        
    //const planetPos = this.planet.transform.position;
    this.smoothPos.lerp(this.planet.transform.position, 0.01);
                 
    const pos = transform.position;
    
    let upDir = pos.clone().sub(this.smoothPos).normalize();  
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
    
    transform.position.addScaledVector(rotatedForward, moveSpeed * deltaTime );
    
    this.prevForward = forwardDir.clone();
  }
}

class Shape extends Component { 
  constructor(gameObject, model, pos, radius) {
    super(gameObject);
    if ( model != 0 ) {
      this.model = model;
      this.gameObject.transform.add(this.model); 
    }
    this.collisionRadius = radius;
    this.gameObject.transform.position.copy(pos);
  }
}

class SkinInstance extends Component {
  constructor(gameObject, model) {
    super(gameObject);
    this.model = model;
    this.animRoot = SkeletonUtils.clone(this.model.gltf.scene);
    
    const box = new THREE.Box3().setFromObject(this.animRoot);
    this.size = new THREE.Vector3();
    box.getSize(this.size);
    
    this.mixer = new THREE.AnimationMixer(this.animRoot);
    gameObject.transform.add(this.animRoot);
    
    const firstClip = Object.values(this.model.animations)[0];
    const action = this.mixer.clipAction(firstClip);
    action.play();
  }
  update() {
    this.mixer.update(globals.deltaTime);
  }
}

class Light extends Component {
  constructor(gameObject) {
    super(gameObject);
    const light =  new THREE.DirectionalLight(0xffffff, 1.5);
    light.castShadow = true;
    
    light.shadow.mapSize.set(1024, 1024);

    light.shadow.camera.near = 1;
    light.shadow.camera.far  = 500;

    light.shadow.camera.left   = -50;
    light.shadow.camera.right  =  50;
    light.shadow.camera.top    =  50;
    light.shadow.camera.bottom = -50;
    
    light.position.set(0,200,0);
    this.gameObject.transform.add(light);
  }
}

class Planet extends Component {
  constructor(gameObject, color, pos, radius, skin) {
    super(gameObject);
    
    if (color != 0) {
      this.sphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 64, 32),
        new THREE.MeshPhongMaterial({ color: color })
      );
      this.sphere.castShadow = true;
      this.sphere.receiveShadow = true;

      this.gameObject.transform.add(this.sphere);
      this.gameObject.transform.position.copy(pos);
    
      const roadRadius = radius * 1.01;
      const roadHeight = radius / 3;
    
      this.road = new THREE.Mesh(
        new THREE.CylinderGeometry(
          roadRadius, roadRadius, roadHeight, 48, 1),
        new THREE.MeshPhongMaterial({ color: 0x444444 })
      );

      this.road.castShadow = true;
      this.road.receiveShadow = true;

      // rotate so it wraps planet front-to-back
      this.road.rotation.z = Math.PI / 2;
      this.gameObject.transform.add(this.road);
    }
    
    this.skinInstance;
    if ( skin != undefined ) {
      this.skinInstance = gameObject.addComponent(SkinInstance, skin);
    }
    this.shape = this.gameObject.addComponent(Shape, 0, pos, radius);
    this.objects = [ this.gameObject ];
    
    this.enterOrbit = 3*this.shape.collisionRadius;
    this.exitOrbit = this.enterOrbit + 2;
    
    this.smoothPos = new THREE.Vector3();
  }
  update() {
  
    const player = gameObjectManager.gameObjects.array[0];
    const playerPos = player.transform.position.clone();
    const planetPos = this.gameObject.transform.position.clone();
    const playerPlanet = player.getComponent(Player).planet;
    const zeroPlanet = gameObjectManager.gameObjects.array[1];
    
    const diff = playerPos.sub(planetPos);
    const dist = diff.length();
    if ( dist <= this.enterOrbit ) {
      player.getComponent(Player).planet = this.gameObject;
      //console.log("in", player.getComponent(Player).planet.name);
    }
  }
}

class Collision extends Component {
  constructor(gameObject) {
    super(gameObject);
    this.dir = new THREE.Vector3();
  }
  update() {
    const player = this.gameObject;
    const objects = player.getComponent(Player).planet.getComponent(Planet).objects;
    let playerVel = player.getComponent(Player);
       
    for (let i=0; i < objects.length; i++) {
      const radius = objects[i].getComponent(Shape).collisionRadius;
      const playerPos = player.transform.position.clone();
      playerPos.addScaledVector(player.transform.up, -1/2);
    
      const diff = playerPos.sub(objects[i].transform.position);
      const dist = diff.length();
      if ( dist < radius ) {
        const collisionDist = radius - dist;
        const pushDir = diff.normalize();
        player.transform.position.addScaledVector( pushDir, collisionDist );     
        player.transform.getWorldDirection(this.dir);
        playerVel.velocity *= ( playerVel.velocity > 1 ? 0.999 : 1 );
      } else if (i==0 && playerVel.velocity<globals.moveSpeed) { playerVel.velocity *= 1.002 }      
    }  
  }
}

class Item extends Component {
  constructor(gameObject, model, pos, angle, radius, planet, skin) { 
    super(gameObject);
    this.skinInstance;
    if ( skin != undefined ) {
      this.skinInstance = gameObject.addComponent(SkinInstance, skin);
    }
    
    this.shape = this.gameObject.addComponent(Shape, model, pos, radius);
    this.item = this.gameObject.transform;
    
    this.planet = planet;
    this.planet.getComponent(Planet).objects.push(this.gameObject);
    
    let itemPos = this.gameObject.transform.position.clone();
    const planetPos = this.planet.transform.position;
    
    let upDir = itemPos.clone().sub(planetPos).normalize();
    this.gameObject.transform.up.copy(upDir);
   
    itemPos.addScaledVector( upDir, -1/2);
    
    const diff = itemPos.clone().sub(planetPos);
    const dist = diff.length() - this.planet.getComponent(Shape).collisionRadius;
    const moveDir = diff.normalize().negate()
    this.gameObject.transform.position.addScaledVector( moveDir , dist );
    
    let lookDir = new THREE.Vector3().crossVectors(upDir, new THREE.Vector3(0,1,0)).normalize();
    lookDir.applyAxisAngle(upDir, angle);
    
    this.gameObject.transform.lookAt(itemPos.add(lookDir));
    
    this.arrow1 = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1), // direction (will update)
    new THREE.Vector3(0, 0, 0), // origin
    3,                          // length
    0x0000ff                    // color
    );
    this.arrow2 = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1), // direction (will update)
    new THREE.Vector3(0, 0, 0), // origin
    3,                          // length
    0x0000ff                    // color
    );
    
    scene.add(this.arrow1);
    scene.add(this.arrow2);  
    
    this.arrow1.setDirection(upDir);
    this.arrow1.position.copy(this.gameObject.transform.position);
    
    //this.arrow2.setDirection(lookDir.negate());
    //this.arrow2.position.copy(this.gameObject.transform.position);
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

const kamiPos = new THREE.Vector3(0, -60, 0);
const planet1Pos = new THREE.Vector3(0, 0, 0);

const kamiRadius = 12;
const planet1Radius = 12;

const kamiScale = kamiRadius*0.77;
const kamiOffsetY = kamiRadius*-1.235;
const kamiOffsetZ = kamiRadius*-0.004;

const playerPos = planet1Pos.clone().add( new THREE.Vector3( 0, planet1Radius, 0 ) );

const gameObjectManager = new GameObjectManager();
const inputManager = new InputManager();

function init() {
  prepModelsAndAnimations();
  
  {
  const playerObj = gameObjectManager.createGameObject(scene, 'player');

  playerObj.addComponent(Player, playerPos);
  playerObj.addComponent(Collision);
  playerObj.addComponent(Light);
  
  const kamiObj = gameObjectManager.createGameObject(scene, 'KamiPlanet');
  kamiObj.addComponent(Planet, 0, kamiPos, kamiRadius, models.kami);
  kamiObj.getComponent(SkinInstance).animRoot.scale.set(kamiScale,kamiScale,kamiScale);
  kamiObj.getComponent(SkinInstance).animRoot.position.set(-0.1,kamiOffsetY,kamiOffsetZ);
  
  const planet1Obj = gameObjectManager.createGameObject(scene, 'planet1');
  planet1Obj.addComponent(Planet, 0x008844, planet1Pos, planet1Radius);

  playerObj.getComponent(Player).planet = planet1Obj;
  
  gameObjectManager.update();

  const cameraObj = gameObjectManager.createGameObject(scene, 'camera');
  cameraObj.addComponent(Camera, playerObj, new THREE.Vector3( 0, 3, -7));

  let tempPos = planet1Pos.clone().add(new THREE.Vector3(-15, 50, 40) );
  let randomAngle = Math.random() * Math.PI * 2;

  let gameObj = gameObjectManager.createGameObject(scene, 'house1');
  gameObj.addComponent(Item, instances[0], tempPos, randomAngle, 1.5, planet1Obj);

  tempPos = planet1Pos.clone().add(new THREE.Vector3(15, 50, 40));
  randomAngle = Math.random() * Math.PI * 2;

  gameObj = gameObjectManager.createGameObject(scene, 'house2');
  gameObj.addComponent(Item, instances[1], tempPos, randomAngle, 1.5, planet1Obj);
  }
}

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

    renderer.render( scene, camera );
}
renderer.setAnimationLoop( animate );