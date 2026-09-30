import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { areaAt, CLASSES, tanks, type WeatherKey } from '../data/demo';

type Props = { index: number; scenario: number | null; intensity: number; weather: WeatherKey; selected: string | null; motion: boolean; quality: 'auto' | 'low' };
const elevation = (x: number, z: number) => Math.sin(x * .12 + z * .035) * 1.7 + Math.cos(z * .15) * 1.2 + Math.sin(x * .23 - z * .13) * .6;
export default function StormScene(props: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const live = useRef(props); live.current = props;
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' }); }
    catch { setFallback(true); return; }
    const low = props.quality === 'low' || window.innerWidth < 760;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1 : 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor('#050a14', 1);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#050a14', .0095);
    const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, .1, 240);
    const ambient = new THREE.HemisphereLight('#4bd8e2', '#061225', 1.5); scene.add(ambient);
    const moon = new THREE.DirectionalLight('#70d9ed', 2); moon.position.set(20, 35, -5); scene.add(moon);
    const plane = new THREE.PlaneGeometry(128, 112, 90, 78); plane.rotateX(-Math.PI / 2);
    const positions = plane.attributes.position;
    for (let i = 0; i < positions.count; i++) positions.setY(i, elevation(positions.getX(i), positions.getZ(i)));
    plane.computeVertexNormals();
    const ground = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({ color: '#071b27', roughness: .48, metalness: .55, flatShading: true })); scene.add(ground);
    const wire = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: '#1e6471', wireframe: true, transparent: true, opacity: .15 })); wire.position.y = .04; scene.add(wire);
    const linePoints: number[] = [];
    for (let z = -50; z < 53; z += 3.4) for (let x = -60; x < 60; x += 1) {
      linePoints.push(x, elevation(x, z) + .1, z, x + 1, elevation(x + 1, z) + .1, z);
    }
    const contourGeo = new THREE.BufferGeometry(); contourGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
    scene.add(new THREE.LineSegments(contourGeo, new THREE.LineBasicMaterial({ color: '#3c8992', transparent: true, opacity: .16 })));
    const pondGeo = new THREE.CircleGeometry(1, 14); pondGeo.rotateX(-Math.PI / 2);
    const pondMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: .88, side: THREE.DoubleSide, toneMapped: false });
    const ponds = new THREE.InstancedMesh(pondGeo, pondMaterial, tanks.length); ponds.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(ponds);
    const xyz = tanks.map(t => { const x = (t.lon - 77.5) * 160; const z = -(t.lat - 14.35) * 145; return [x, elevation(x, z) + .2, z]; });
    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(xyz.flat(), 3));
    haloGeo.setAttribute('color', new THREE.Float32BufferAttribute(tanks.flatMap(t => new THREE.Color(CLASSES[t.classification].color).toArray()), 3));
    const haloMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute vec3 color; varying vec3 tint; void main(){ tint=color; vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p; gl_PointSize=clamp(1100./-p.z,5.,36.); }',
      fragmentShader: 'varying vec3 tint; void main(){ float d=length(gl_PointCoord-.5)*2.; gl_FragColor=vec4(tint,pow(max(0.,1.-d),3.)*.55); }',
    });
    scene.add(new THREE.Points(haloGeo, haloMat));
    const particleCount = low ? 3000 : 14000;
    const rainGeo = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(particleCount * 6), seeds = new Float32Array(particleCount * 6);
    let r = 52; const rnd = () => { r = Math.imul(r, 1664525) + 1013904223; return (r >>> 0) / 4294967296; };
    for (let i = 0; i < particleCount; i++) {
      const seed = [rnd() * 130 - 65, rnd() * 55, rnd() * 110 - 55];
      for (let j = 0; j < 2; j++) { seeds.set(seed, i * 6 + j * 3); rainPositions[i * 6 + j * 3 + 1] = -j * .72; rainPositions[i * 6 + j * 3] = j * .13; }
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3)); rainGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
    const rainMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, amount: { value: .8 } }, transparent: true, depthWrite: false,
      vertexShader: 'attribute vec3 seed; uniform float time; uniform float amount; varying float alpha; void main(){ vec3 p=position+seed; p.y=mod(seed.y-time*(17.+amount*16.),55.); p.x+=p.y*.13; alpha=step(fract(seed.x*.151+seed.z*.27),amount)*(.18+amount*.35); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }',
      fragmentShader: 'varying float alpha; void main(){gl_FragColor=vec4(.49,.79,.9,alpha);}',
    });
    scene.add(new THREE.LineSegments(rainGeo, rainMat));
    const rippleGeo = new THREE.RingGeometry(.85, 1, 32); rippleGeo.rotateX(-Math.PI / 2);
    const rippleMat = new THREE.MeshBasicMaterial({ color: '#6ce4dd', transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide });
    const ripples = new THREE.InstancedMesh(rippleGeo, rippleMat, 34); scene.add(ripples);
    const temp = new THREE.Object3D(), color = new THREE.Color(), clock = new THREE.Clock();
    const pointer = { x: 0, y: 0 };
    const move = (e: MouseEvent) => { pointer.x = (e.clientX / window.innerWidth - .5) * 2; pointer.y = (e.clientY / window.innerHeight - .5) * 2; };
    const resize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
    window.addEventListener('resize', resize); window.addEventListener('mousemove', move, { passive: true });
    let frame = 0, time = 0, intensity = .75, frameCount = 0, slowFrames = 0;
    const focus = new THREE.Vector3(0, 0, 0), goal = new THREE.Vector3();
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min(clock.getDelta(), .07);
      if (document.hidden) return;
      const p = live.current;
      if (p.motion) time += dt;
      // A static frame is sufficient when reduced motion is enabled.
      if (!p.motion && frameCount++ % 8 !== 0) return;
      intensity += (p.intensity - intensity) * Math.min(1, dt * 2.2);
      rainMat.uniforms.time.value = time; rainMat.uniforms.amount.value = intensity;
      const selectedIndex = tanks.findIndex(t => t.id === p.selected);
      const scroll = Math.min(window.scrollY / window.innerHeight, 2);
      goal.set(selectedIndex >= 0 && scroll > .5 ? xyz[selectedIndex][0] * .2 : 0, 0, selectedIndex >= 0 && scroll > .5 ? xyz[selectedIndex][2] * .2 : 0);
      focus.lerp(goal, .025);
      const drift = p.motion && !low ? Math.sin(time * .045) * 3 : 0;
      camera.position.set(43 + drift + (p.motion && !low ? pointer.x * 1.2 : 0), 49 - scroll * 5, 58 + (p.motion && !low ? pointer.y : 0));
      camera.lookAt(focus.x, focus.y, focus.z);
      tanks.forEach((t, i) => {
        const fill = areaAt(t, p.index, p.scenario) / t.maxArea;
        temp.position.set(...xyz[i] as [number, number, number]);
        const size = (.22 + Math.sqrt(t.area) * .10) * (.45 + fill * .85);
        temp.scale.set(size, 1, size * .68); temp.rotation.y = i * 2.4; temp.updateMatrix(); ponds.setMatrixAt(i, temp.matrix);
        color.set(CLASSES[t.classification].color).multiplyScalar(.4 + fill * .8 + (i === selectedIndex ? .65 : 0)); ponds.setColorAt(i, color);
      });
      ponds.instanceMatrix.needsUpdate = true; if (ponds.instanceColor) ponds.instanceColor.needsUpdate = true;
      for (let i = 0; i < 34; i++) { const cycle = (time * .4 + i * .193) % 1; const pos = xyz[(i * 13) % xyz.length]; temp.position.set(pos[0], pos[1] + .03, pos[2]); temp.scale.setScalar(.2 + cycle * 2.4); temp.updateMatrix(); ripples.setMatrixAt(i, temp.matrix); }
      ripples.instanceMatrix.needsUpdate = true; rippleMat.opacity = .12 * intensity; ripples.visible = intensity > .04;
      // Gentle distant flashes only; no full-screen strobe.
      const flash = p.motion && p.weather === 'storm' && Math.sin(time * .43) > .999 ? .6 : 0;
      moon.intensity = 1.5 + flash;
      moon.color.set(p.weather === 'dry' ? '#e7bc75' : '#70d9ed');
      renderer.render(scene, camera);
      if (dt > .04 && ++slowFrames > 80 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); rainGeo.setDrawRange(0, particleCount); }
    };
    draw();
    const contextLost = (e: Event) => { e.preventDefault(); setFallback(true); cancelAnimationFrame(frame); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    return () => {
      cancelAnimationFrame(frame); window.removeEventListener('resize', resize); window.removeEventListener('mousemove', move);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      const geos = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.Points) { geos.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
      geos.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [props.quality]);
  return <div className={'storm-scene ' + (fallback ? 'scene-fallback' : '')} ref={mount} aria-hidden="true"><div className="scene-shade" /></div>;
}
