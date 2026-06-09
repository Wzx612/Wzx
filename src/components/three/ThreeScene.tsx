import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Three.js scene: a stylized "city of data" — a grid of extruded building
 * blocks whose heights pulse with mock district demand, ringed by orbiting
 * agent nodes. Uses only core geometries (Box/Sphere/Cylinder), an auto
 * camera orbit (no OrbitControls), and disposes everything on unmount.
 */
export default function ThreeScene({ height = 360 }: { height?: number }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b1020, 0.035);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
    camera.position.set(0, 14, 22);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // lights
    scene.add(new THREE.AmbientLight(0x4a5578, 0.8));
    const key = new THREE.DirectionalLight(0x4f7cff, 1.4);
    key.position.set(8, 18, 10);
    scene.add(key);
    const rim = new THREE.PointLight(0x00d4ff, 1.2, 60);
    rim.position.set(-12, 10, -8);
    scene.add(rim);
    const accent = new THREE.PointLight(0x7c3aed, 1.0, 60);
    accent.position.set(10, 8, -10);
    scene.add(accent);

    // ground grid
    const grid = new THREE.GridHelper(40, 40, 0x4f7cff, 0x1b2440);
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // building blocks
    const cols = 8;
    const rows = 8;
    const gap = 2.2;
    const buildings: { mesh: THREE.Mesh; base: number; phase: number }[] = [];
    const palette = [0x4f7cff, 0x00d4ff, 0x7c3aed, 0x10b981];
    for (let x = 0; x < cols; x++) {
      for (let z = 0; z < rows; z++) {
        const h = 1 + Math.random() * 6;
        const geo = new THREE.BoxGeometry(1.4, h, 1.4);
        const color = palette[(x + z) % palette.length];
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.22,
          metalness: 0.6,
          roughness: 0.35,
          transparent: true,
          opacity: 0.92,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((x - cols / 2) * gap + gap / 2, h / 2, (z - rows / 2) * gap + gap / 2);
        scene.add(mesh);
        buildings.push({ mesh, base: h, phase: Math.random() * Math.PI * 2 });
      }
    }

    // orbiting agent nodes
    const orbitGroup = new THREE.Group();
    scene.add(orbitGroup);
    const nodes: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.SphereGeometry(0.5, 24, 24);
      const color = palette[i % palette.length];
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 });
      const node = new THREE.Mesh(geo, mat);
      const angle = (i / 5) * Math.PI * 2;
      node.position.set(Math.cos(angle) * 12, 9 + Math.sin(angle) * 2, Math.sin(angle) * 12);
      orbitGroup.add(node);
      nodes.push(node);
    }

    // central core
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x4f7cff, emissiveIntensity: 1.2 }),
    );
    core.position.y = 10;
    scene.add(core);

    let raf = 0;
    let t = 0;
    const animate = () => {
      t += 0.016;
      buildings.forEach((b) => {
        const s = 1 + Math.sin(t * 1.3 + b.phase) * 0.18;
        b.mesh.scale.y = s;
        b.mesh.position.y = (b.base * s) / 2;
      });
      orbitGroup.rotation.y = t * 0.3;
      nodes.forEach((n, i) => {
        n.position.y = 9 + Math.sin(t * 1.5 + i) * 1.4;
      });
      const pulse = 1 + Math.sin(t * 2) * 0.12;
      core.scale.setScalar(pulse);

      // auto camera orbit
      camera.position.x = Math.sin(t * 0.12) * 24;
      camera.position.z = Math.cos(t * 0.12) * 24;
      camera.lookAt(0, 6, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [height]);

  return <div ref={mountRef} style={{ width: '100%', height, borderRadius: 'var(--r)', overflow: 'hidden' }} />;
}
