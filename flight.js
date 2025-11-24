import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({antialias: true, canvas});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera( 75, 2, 0.1, 1000 );
camera.position.set( 0, 3, -7 );

const scene = new THREE.Scene();

const manager = new THREE.LoadingManager();
manager.onLoad = init;
const models = {
  plane: { url: 'resources/plane/scene.gltf' },
  hangar: { url: 'resources/hangar/scene.gltf' },
  laurel: { url: 'resources/laurelTree/scene.gltf' },
  elm: { url: 'resources/elmTree/scene.gltf' },
  bakery: { url: 'resources/bakery/scene.gltf' },
  viking: { url: 'resources/viking/scene.gltf' },
  building: { url: 'resources/building/scene.gltf' },
  building2: { url: 'resources/building2/scene.gltf' },
  house: { url: 'resources/house/scene.gltf' },
  cafe: { url: 'resources/cafe/scene.gltf' },
  burger: { url: 'resources/burger/scene.gltf' },
  cow: { url: 'resources/cow/scene.gltf' }
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
  constructor(gameObject) {
    super(gameObject);

    const skinScale = new THREE.Vector3(2,2,2);
    
    this.skin = gameObject.addComponent(SkinInstance, models.plane, skinScale);
    this.skin.animRoot.position.set(0,-this.skin.size.y/2,0);
    
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
  constructor(gameObject, radius) {
    super(gameObject);
    this.collisionRadius = radius;
  }
}

class SkinInstance extends Component {
  constructor(gameObject, model, scale) {
    super(gameObject);
    this.model = model;
    this.animRoot = SkeletonUtils.clone(this.model.gltf.scene);
    
    const box = new THREE.Box3().setFromObject(this.animRoot);
    this.size = new THREE.Vector3();
    box.getSize(this.size);
    
    this.mixer = new THREE.AnimationMixer(this.animRoot);
    gameObject.transform.add(this.animRoot);
    
    const firstClip = Object.values(this.model.animations)[0];
    if (firstClip != undefined) {
      const action = this.mixer.clipAction(firstClip);
      action.play();
    }
    
    if (scale != undefined) {
      //console.log(scale);
      this.animRoot.scale.set(scale.x,scale.y,scale.z)
    }
  }
  update() {
    this.mixer.update(globals.deltaTime);
  }
}

class Light extends Component {
  constructor(gameObject) {
    super(gameObject);
    
    const light =  new THREE.DirectionalLight(0xffffff, 2);
    light.castShadow = true;
    
    light.shadow.mapSize.set(1024, 1024);
    light.position.set(0,40,0);
    
    const s = 50;
    
    light.shadow.camera.near = 1;
    light.shadow.camera.far = s*4;
    
    light.shadow.camera.left = -s;
    light.shadow.camera.right = s;
    light.shadow.camera.top = s;
    light.shadow.camera.bottom = -s;
    
    this.gameObject.transform.add(light);
    this.gameObject.transform.add(light.target);
  }
}

class Planet extends Component {
  constructor(gameObject, color, radius, skin) {
    super(gameObject);
    
    if (color != 0) {
      this.sphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 64, 32),
        new THREE.MeshPhongMaterial({ color: color })
      );
      this.sphere.castShadow = true;
      this.sphere.receiveShadow = true;

      this.gameObject.transform.add(this.sphere);
    
      const roadRadius = radius * 1.01;
      const roadHeight = (radius/3 > 4 ? 4 : radius/3);
    
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
    this.shape = this.gameObject.addComponent(Shape, radius);
    this.objects = [ this.gameObject ];
    
    this.radius = radius;
    
    this.orbit = 2*this.radius;
  }
  addObject(object, angles, height) {
    angles.multiplyScalar( Math.PI*2 );
    
    height = (height == undefined ? 0 : height);
    
    const transform = object.transform;
    
    if ( object.getComponent(Shape) != undefined ) {
      this.objects.push(object);
    }
    
    const planetPos = this.gameObject.transform.position;
    
    let upDir = new THREE.Vector3(0,1,0);
    upDir.applyAxisAngle( new THREE.Vector3(1,0,0), angles.x );
    upDir.applyAxisAngle( new THREE.Vector3(0,0,1), angles.z );
    
    let objPos = transform.position
    
    objPos.copy(planetPos);
    objPos.addScaledVector(upDir, this.radius+height);
    
    transform.up.copy(upDir);
    
    let lookDir = new THREE.Vector3().crossVectors(upDir, new THREE.Vector3(0,1,0)).normalize();
    lookDir.applyAxisAngle(upDir, angles.y);
    
    transform.lookAt(objPos.clone().add(lookDir));
    }
    update() {
  
    const player = gameObjectManager.gameObjects.array[0];
    const playerPos = player.transform.position.clone();
    const planetPos = this.gameObject.transform.position.clone();
    const playerPlanet = player.getComponent(Player).planet;
    const zeroPlanet = gameObjectManager.gameObjects.array[1];
    
    const diff = playerPos.sub(planetPos);
    const dist = diff.length();
    if ( dist <= this.orbit ) {
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

class Box extends Component {
  constructor(gameObject, model, radius) { 
    super(gameObject);
    
    this.gameObject.transform.add(model);
    this.shape = this.gameObject.addComponent(Shape, radius);
    
    if ( model != 0 ) {
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
      //scene.add(this.arrow2);

      this.arrow1.setDirection(this.gameObject.transform.up);
      this.arrow1.position.copy(this.gameObject.transform.position);
      this.gameObject.transform.add(this.arrow1);
    
      //this.arrow2.setDirection(this.gameObject.transform.getWorldDirection(new THREE.Vector3()));
      //this.arrow2.position.copy(this.gameObject.transform.position);
    }
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


const planet1Radius = 12;
const planet2Radius = 24;//18;

const playerPos = new THREE.Vector3(-1/4, 0, 0);
const planet1Pos = new THREE.Vector3(0, 0, 0);
const planet2Pos = new THREE.Vector3(0,-planet2Radius*4,0);

const gameObjectManager = new GameObjectManager();
const inputManager = new InputManager();

function init() {
  prepModelsAndAnimations();
  
  {
  const playerObj = gameObjectManager.createGameObject(scene, 'player');

  playerObj.addComponent(Player);
  playerObj.addComponent(Collision);
  playerObj.addComponent(Light);
  
  let planetObj = gameObjectManager.createGameObject(scene, 'planet1');
  
  planetObj.transform.position.copy(planet1Pos);
  planetObj.addComponent(Planet, 0x008844, planet1Radius);

  playerObj.getComponent(Player).planet = planetObj;
  
  let planetComp = planetObj.getComponent(Planet);
  planetComp.addObject(playerObj, playerPos);
  
  gameObjectManager.update();

  const cameraObj = gameObjectManager.createGameObject(scene, 'camera');
  cameraObj.addComponent(Camera, playerObj, new THREE.Vector3( 0, 3, -7));

  let gameObj = gameObjectManager.createGameObject(scene, 'box1');
  gameObj.addComponent(Box, instances[0], 1.5,);
  
  let tempAngles = new THREE.Vector3(1/8, 1/3, 1/18);
  planetComp.addObject(gameObj, tempAngles,1/2);

  gameObj = gameObjectManager.createGameObject(scene, 'box2');
  gameObj.addComponent(Box, instances[1], 1.5,);
  
  tempAngles = new THREE.Vector3(1/8, 1/6, -1/18);
  planetComp.addObject(gameObj, tempAngles,1/2);
  
  let tempScale = new THREE.Vector3(0.5,1.7,1);
  tempAngles = new THREE.Vector3(-1/4.8,0,-1/32);
  
  gameObj = gameObjectManager.createGameObject(scene, 'hangar');
  gameObj.addComponent(SkinInstance, models.hangar, tempScale);
  
  let skinRoot = gameObj.getComponent(SkinInstance).animRoot;
  //skinRoot.rotateOnAxis(skinRoot.up , Math.PI/2);
  
  planetComp.addObject(gameObj, tempAngles,-3);
  
  planetObj = gameObjectManager.createGameObject(scene, 'planet2');
  planetObj.addComponent(Planet, 0x008844, planet2Radius);
  planetObj.transform.position.copy(planet2Pos);
  
  planetComp = planetObj.getComponent(Planet);
  
  tempScale = new THREE.Vector3(0.05,0.05,0.05)
 
  gameObj = gameObjectManager.createGameObject(scene, 'tree1');
  
  gameObj.addComponent(SkinInstance, models.laurel, tempScale);
  gameObj.addComponent(Shape, 3);
  
  tempAngles = new THREE.Vector3(0, 0, -1/8);
  planetComp.addObject(gameObj, tempAngles);
  
  gameObj = gameObjectManager.createGameObject(scene, 'tree2');
  
  gameObj.addComponent(SkinInstance, models.laurel, tempScale);

  gameObj.addComponent(Shape, 3);
  
  tempAngles = new THREE.Vector3(1/8, 2/4, 1/6);
  planetComp.addObject(gameObj, tempAngles);
  
  gameObj = gameObjectManager.createGameObject(scene, 'tree3');
  
  gameObj.addComponent(SkinInstance, models.elm, tempScale);
  gameObj.addComponent(Shape, 3);
  
  tempAngles = new THREE.Vector3(1/8, 2/4, 9.3/16);
  planetComp.addObject(gameObj, tempAngles);
  
  gameObj = gameObjectManager.createGameObject(scene, 'cafe');
  
  tempScale = new THREE.Vector3(2,2,2);
  
  gameObj.addComponent(SkinInstance, models.cafe, tempScale);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/7, -1/3, 1/12);
  planetComp.addObject(gameObj, tempAngles,-0.4);
  
  gameObj = gameObjectManager.createGameObject(scene, 'burger');
  
  tempScale = new THREE.Vector3(2.5,2.5,2.5);
  
  gameObj.addComponent(SkinInstance, models.burger, tempScale);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/10, -1/16, -1/12);
  planetComp.addObject(gameObj, tempAngles,-0.4);
  
  gameObj = gameObjectManager.createGameObject(scene, 'bakery');
  
  tempScale = new THREE.Vector3(2,2,2);
  
  gameObj.addComponent(SkinInstance, models.bakery,tempScale);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/6, 0, -1/8);
  planetComp.addObject(gameObj, tempAngles,-0.6);
  
  gameObj = gameObjectManager.createGameObject(scene, 'building');
  
  tempScale = new THREE.Vector3(1.5,1.5,1.5);
  
  gameObj.addComponent(SkinInstance, models.building, tempScale);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/5, -1/4, -2/8);
  planetComp.addObject(gameObj, tempAngles,-0.5);
  
  gameObj = gameObjectManager.createGameObject(scene, 'building2');
  
  gameObj.addComponent(SkinInstance, models.building2);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/2.9, -1/4, 1/16);
  planetComp.addObject(gameObj, tempAngles,-0.7);
  
  gameObj = gameObjectManager.createGameObject(scene, 'building3');
  
  gameObj.addComponent(SkinInstance, models.building2);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/5.5, 1/4, 1/9);
  planetComp.addObject(gameObj, tempAngles,-0.7);
  
  gameObj = gameObjectManager.createGameObject(scene, 'bakery2');
  
  tempScale = new THREE.Vector3(2,2,2);
  
  gameObj.addComponent(SkinInstance, models.bakery,tempScale);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/5.5, 1/2, 2.5/9);
  planetComp.addObject(gameObj, tempAngles,-0.6);
  
  gameObj = gameObjectManager.createGameObject(scene, 'building5');
  
  tempScale = new THREE.Vector3(1.5,1.5,1.5);
  
  gameObj.addComponent(SkinInstance, models.building, tempScale);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/2.9, 1/4, -1/10);
  planetComp.addObject(gameObj, tempAngles,-0.5);
  
  gameObj = gameObjectManager.createGameObject(scene, 'house1');
  
  tempScale = new THREE.Vector3(0.5,0.5,0.5);
  
  gameObj.addComponent(SkinInstance, models.house,tempScale);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/2.7, 0, 1/18);
  planetComp.addObject(gameObj, tempAngles,-0.4);
  
  gameObj = gameObjectManager.createGameObject(scene, 'house2');
  
  tempScale = new THREE.Vector3(0.5,0.5,0.5);
  
  gameObj.addComponent(SkinInstance, models.house,tempScale);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/2.5, 0, 1/24);
  planetComp.addObject(gameObj, tempAngles,-0.4);
  
  gameObj = gameObjectManager.createGameObject(scene, 'house3');
  
  tempScale = new THREE.Vector3(0.5,0.5,0.5);
  
  gameObj.addComponent(SkinInstance, models.house,tempScale);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/2.4, 1/2, -1/24);
  planetComp.addObject(gameObj, tempAngles,-0.4);
  
  gameObj = gameObjectManager.createGameObject(scene, 'building6');
  
  gameObj.addComponent(SkinInstance, models.building2);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/2.8, 1/4, -1/14);
  planetComp.addObject(gameObj, tempAngles,-0.5);
  
  tempScale = new THREE.Vector3(0.05,0.05,0.05)
  
  gameObj = gameObjectManager.createGameObject(scene, 'tree4');
  
  gameObj.addComponent(SkinInstance, models.laurel, tempScale);

  gameObj.addComponent(Shape, 3);
  
  tempAngles = new THREE.Vector3(1/2.7, 0, -1/6);
  planetComp.addObject(gameObj, tempAngles);
  
  gameObj = gameObjectManager.createGameObject(scene, 'tree5');
  
  gameObj.addComponent(SkinInstance, models.laurel, tempScale);

  gameObj.addComponent(Shape, 3);
  
  tempAngles = new THREE.Vector3(1/2.7, 0, 1/4);
  planetComp.addObject(gameObj, tempAngles);
  
  gameObj = gameObjectManager.createGameObject(scene, 'tree6');
  
  gameObj.addComponent(SkinInstance, models.laurel, tempScale);

  gameObj.addComponent(Shape, 3);
  
  tempAngles = new THREE.Vector3(1/2, 0, 1/8);
  planetComp.addObject(gameObj, tempAngles);
  
  gameObj = gameObjectManager.createGameObject(scene, 'tree7');
  
  gameObj.addComponent(SkinInstance, models.laurel, tempScale);

  gameObj.addComponent(Shape, 3);
  
  tempAngles = new THREE.Vector3(1/2, 0, -1/8);
  planetComp.addObject(gameObj, tempAngles);
  
  gameObj = gameObjectManager.createGameObject(scene, 'tree8');
  
  gameObj.addComponent(SkinInstance, models.laurel, tempScale);

  gameObj.addComponent(Shape, 3);
  
  tempAngles = new THREE.Vector3(1/2, 0, -1/4);
  planetComp.addObject(gameObj, tempAngles);
  
  gameObj = gameObjectManager.createGameObject(scene, 'viking');
  
  tempScale = new THREE.Vector3(0.4,0.4,0.4);
  
  gameObj.addComponent(SkinInstance, models.viking,tempScale);
  gameObj.addComponent(Shape, 6);
  
  tempAngles = new THREE.Vector3(1/1.47, 0, -1/8);
  planetComp.addObject(gameObj, tempAngles,-1);
  
  tempScale = new THREE.Vector3(0.25,0.25,0.25);
  let cowCount = 30;
  
  for (let i = 1; i <= cowCount; i++) {
    let name = 'cow'+i;
    let x = Math.random() * (1/1.8 - 1/1.5) + 1/1.5;
    let y = Math.random();
    let sign = (Math.random() < 0.5 ? -1 : 1);
    let z = Math.random() * (1/2-1/40 -1/40) + 1/40;
    z *= sign;
  
    let tempAngles = new THREE.Vector3( x, y, z);//1/16*i);
    //console.log(tempAngles.z);
    
    let gameObj = gameObjectManager.createGameObject(scene, name);
    gameObj.addComponent(SkinInstance, models.cow, tempScale);
    gameObj.addComponent(Shape, 1.5);
    planetComp.addObject(gameObj, tempAngles);
  }
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