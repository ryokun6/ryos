'use client';

import { useEffect, useRef } from "react";
import * as THREE from "three";

const GRID_SIZE = 20;
const HALF_GRID = GRID_SIZE / 2;
const PIPE_RADIUS = 0.4;
const MAX_PIPES = 3;
const SPEED = 0.1;
const SEGMENT_LIMIT = 1000;
const MIN_STRAIGHT_STEPS = 4;
const RANDOM_TURN_CHANCE = 0.5;

type Vec3 = [number, number, number];
type Direction = Vec3;

const DIRECTIONS: Direction[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const ALL_COLORS = [
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFFF00",
  "#00FFFF",
  "#FF00FF",
  "#FFFFFF",
  "#FF8000",
  "#8000FF",
];

interface ActivePipe {
  id: number;
  position: Vec3;
  direction: Direction;
  color: string;
  lastUpdate: number;
  stepsSinceTurn: number;
}

const createPalette = () => {
  const shuffled = [...ALL_COLORS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // Ensure we have enough colors for MAX_PIPES by repeating if necessary,
  // but always take at least MAX_PIPES distinct colors if available.
  // Since ALL_COLORS has 9 entries and MAX_PIPES is 3, we can just slice.
  return shuffled.slice(0, MAX_PIPES);
};

const addVec = (a: Vec3, b: Direction): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];

const posKey = (pos: Vec3) => `${pos[0]},${pos[1]},${pos[2]}`;

const orthogonalDirections = (dir: Direction) =>
  DIRECTIONS.filter(
    (candidate) =>
      candidate[0] * dir[0] + candidate[1] * dir[1] + candidate[2] * dir[2] === 0
  );

const randomDirection = () =>
  DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];

const randomFrom = <T,>(list: T[]) =>
  list[Math.floor(Math.random() * list.length)];

const randomPosition = (): Vec3 => [
  Math.floor(Math.random() * GRID_SIZE) - HALF_GRID,
  Math.floor(Math.random() * GRID_SIZE) - HALF_GRID,
  Math.floor(Math.random() * GRID_SIZE) - HALF_GRID,
];

const isValidPosition = (pos: Vec3, occupied: Set<string>) =>
  Math.abs(pos[0]) <= HALF_GRID &&
  Math.abs(pos[1]) <= HALF_GRID &&
  Math.abs(pos[2]) <= HALF_GRID &&
  !occupied.has(posKey(pos));

const getValidTurnDirections = (
  position: Vec3,
  currentDir: Direction,
  occupied: Set<string>
) =>
  orthogonalDirections(currentDir).filter((dir) =>
    isValidPosition(addVec(position, dir), occupied)
  );

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose());
      } else if (mesh.material) {
        mesh.material.dispose();
      }
    }
  });
};

export function PipesScreenSaver() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050507);

    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 40);
    camera.lookAt(0, 0, 0);

    const clock = new THREE.Clock();
    const ambientLight = new THREE.AmbientLight(0xfefefe, 0.7);
    const lightA = new THREE.PointLight(0xfff3e0, 2);
    lightA.position.set(18, 12, 14);
    const lightB = new THREE.PointLight(0xdfe9ff, 1.5);
    lightB.position.set(-16, 10, -12);
    scene.add(ambientLight, lightA, lightB);

    const softboxLights: THREE.PointLight[] = [];
    const spawnSoftbox = (
      center: Vec3,
      size: { width: number; height: number },
      color: number,
      intensity: number
    ) => {
      const cols = 3;
      const rows = 2;
      for (let ix = 0; ix < cols; ix++) {
        for (let iy = 0; iy < rows; iy++) {
          const offsetX = ((ix / (cols - 1)) - 0.5) * size.width;
          const offsetY = ((iy / (rows - 1)) - 0.5) * size.height;
          const light = new THREE.PointLight(color, intensity);
          light.position.set(center[0] + offsetX, center[1] + offsetY, center[2]);
          light.castShadow = false;
          scene.add(light);
          softboxLights.push(light);
        }
      }
    };
    spawnSoftbox([0, 18, 16], { width: 18, height: 10 }, 0xffffff, 30);
    spawnSoftbox([-10, -6, 22], { width: 14, height: 8 }, 0xfbf4ff, 10);

    // No panels added

    const grid = new Set<string>();
    const activePipes: ActivePipe[] = [];
    let segments: THREE.Object3D[] = [];
    let animationFrameId: number;

    const createPipeMaterial = (hex: string) => {
      const base = new THREE.Color(hex);
      return new THREE.MeshPhysicalMaterial({
        color: base,
        roughness: 0.2,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.15,
        sheen: 0.5,
        sheenColor: new THREE.Color(0xffffff),
        sheenRoughness: 0.5,
        transmission: 0,
      });
    };

    const clearSegments = () => {
      segments.forEach((obj) => {
        scene.remove(obj);
        disposeObject(obj);
      });
      segments = [];
    };

    const createJoint = (position: Vec3, color: string) => {
      const geometry = new THREE.SphereGeometry(PIPE_RADIUS * 1.3, 24, 24);
      const material = createPipeMaterial(color);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position[0], position[1], position[2]);
      scene.add(mesh);
      segments.push(mesh);
    };

    const createStraight = (position: Vec3, direction: Direction, color: string) => {
      const geometry = new THREE.CylinderGeometry(
        PIPE_RADIUS,
        PIPE_RADIUS,
        1,
        24
      );
      const material = createPipeMaterial(color);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position[0], position[1], position[2]);
      if (direction[0] !== 0) {
        mesh.rotation.z = Math.PI / 2;
      } else if (direction[2] !== 0) {
        mesh.rotation.x = Math.PI / 2;
      }
      scene.add(mesh);
      segments.push(mesh);
    };

    const randomizeCamera = () => {
      const distance = 26;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const x = distance * Math.sin(phi) * Math.cos(theta);
      const y = distance * Math.sin(phi) * Math.sin(theta);
      const z = distance * Math.cos(phi);
      camera.position.set(x, y, z);
      camera.up
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize();
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };

    const randomFreePosition = (): Vec3 => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const candidate = randomPosition();
        if (!grid.has(posKey(candidate))) {
          return candidate;
        }
      }
      grid.clear();
      return randomPosition();
    };

    const respawnPipe = (pipe: ActivePipe, now: number) => {
      pipe.position = randomFreePosition();
      pipe.direction = randomDirection();
      pipe.lastUpdate = now;
      pipe.stepsSinceTurn = 0;
      grid.add(posKey(pipe.position));
      createJoint(pipe.position, pipe.color);
    };

    const initialize = () => {
      const now = clock.getElapsedTime();
      grid.clear();
      clearSegments();
      activePipes.length = 0;
      randomizeCamera();
      const palette = createPalette();
      for (let i = 0; i < MAX_PIPES; i++) {
        const pipe: ActivePipe = {
          id: i,
          position: randomFreePosition(),
          direction: randomDirection(),
          color: palette[i % palette.length],
          lastUpdate: now,
          stepsSinceTurn: 0,
        };
        activePipes.push(pipe);
        grid.add(posKey(pipe.position));
        createJoint(pipe.position, pipe.color);
      }
    };

    const updatePipes = (time: number) => {
      let resetTriggered = false;
      activePipes.forEach((pipe) => {
        if (resetTriggered || time - pipe.lastUpdate <= SPEED) {
          return;
        }

        pipe.lastUpdate = time;
        const nextPos = addVec(pipe.position, pipe.direction);
        const turnOptions = getValidTurnDirections(
          pipe.position,
          pipe.direction,
          grid
        );
        let targetDir = pipe.direction;
        let targetPos = nextPos;
        let turned = false;

        if (!isValidPosition(targetPos, grid)) {
          if (turnOptions.length > 0) {
            targetDir = randomFrom(turnOptions);
            targetPos = addVec(pipe.position, targetDir);
            turned = true;
          } else {
            respawnPipe(pipe, time);
            return;
          }
        } else if (
          turnOptions.length > 0 &&
          pipe.stepsSinceTurn >= MIN_STRAIGHT_STEPS &&
          Math.random() < RANDOM_TURN_CHANCE
        ) {
          targetDir = randomFrom(turnOptions);
          targetPos = addVec(pipe.position, targetDir);
          turned = true;
        }

        if (turned) {
          createJoint(pipe.position, pipe.color);
        }

        const midPoint: Vec3 = [
          pipe.position[0] + targetDir[0] * 0.5,
          pipe.position[1] + targetDir[1] * 0.5,
          pipe.position[2] + targetDir[2] * 0.5,
        ];
        createStraight(midPoint, targetDir, pipe.color);

        pipe.position = targetPos;
        pipe.direction = targetDir;
        grid.add(posKey(pipe.position));
        pipe.stepsSinceTurn = turned ? 0 : pipe.stepsSinceTurn + 1;

        if (segments.length > SEGMENT_LIMIT) {
          resetTriggered = true;
          initialize();
        }
      });
    };

    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);
      const time = clock.getElapsedTime();
      updatePipes(time);
      renderer.render(scene, camera);
    };

    initialize();
    renderLoop();

    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight || 1;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      clearSegments();
      softboxLights.forEach((light) => {
        scene.remove(light);
      });
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full block bg-black" />;
}

export default PipesScreenSaver;
