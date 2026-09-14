"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import gsap from "gsap";
import { createRestaurant } from "./restaurant-model";
import type { RestaurantState, Spot } from "./restaurant-state";

export interface CameraCommand { action: "focus" | "home" | "left" | "right" | "in" | "out"; spot?: Spot; key: number }
export interface SceneProps {
  state: RestaurantState;
  selected: Spot | null;
  motion: boolean;
  command: CameraCommand;
  anchors: RefObject<Partial<Record<Spot, HTMLButtonElement | null>>>;
  onReady: () => void;
  onFailure: () => void;
  onSelect: (spot: Spot) => void;
  onExplore: () => void;
}

export default function RestaurantScene(props: SceneProps) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const runtime = useRef<{ sync: () => void } | null>(null);
  useEffect(() => { latest.current = props; runtime.current?.sync(); }, [props]);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); }
    catch { latest.current.onFailure(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const day = new THREE.Color("#e8e0cd");
    const night = new THREE.Color("#273b36");
    scene.background = day.clone();
    const camera = new THREE.PerspectiveCamera(39, 1, .1, 80);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = .07;
    controls.rotateSpeed = .55;
    controls.zoomSpeed = .65;
    controls.minPolarAngle = .5;
    controls.maxPolarAngle = 1.3;
    controls.minAzimuthAngle = -.08;
    controls.maxAzimuthAngle = 1.3;
    controls.minDistance = 3.5;
    controls.maxDistance = 17;
    controls.target.set(0, .8, 0);

    const ambient = new THREE.HemisphereLight("#fff7e5", "#a2a487", 2.6);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight("#fff0d5", 2.8);
    sun.position.set(-3, 10, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: .1, far: 25 });
    sun.shadow.normalBias = .035; sun.shadow.bias = -.0001;
    scene.add(sun);
    const fill = new THREE.DirectionalLight("#e9f0dd", .8); fill.position.set(4, 6, -2); scene.add(fill);
    const lamps = [-1.17, 1.1].map(z => {
      const lamp = new THREE.PointLight("#ffd58a", 2, 5, 2); lamp.position.set(-1.82, 2.1, z); scene.add(lamp); return lamp;
    });
    const counterLight = new THREE.PointLight("#ffcf81", 1, 5, 2); counterLight.position.set(2, 2.6, -1.5); scene.add(counterLight);
    const groundGeometry = new THREE.PlaneGeometry(150, 150);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: "#e3dbc7", roughness: 1 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.31; ground.receiveShadow = true; scene.add(ground);

    const restaurant = createRestaurant(); scene.add(restaurant.root);
    const hoverGeometry = new THREE.TorusGeometry(.34, .014, 6, 48);
    const hoverMaterial = new THREE.MeshBasicMaterial({ color: "#f3c277", transparent: true, opacity: .7 });
    const hoverRing = new THREE.Mesh(hoverGeometry, hoverMaterial); hoverRing.rotation.x = -Math.PI / 2; hoverRing.visible = false; scene.add(hoverRing);
    const lightState = { night: latest.current.state.mood === "night" ? 1 : 0 };
    let frame = 0, previousTime = 0, time = 0, lastCommand = latest.current.command.key;
    let flight: { timeline: gsap.core.Timeline; started: number; duration: number } | null = null;
    let diagnosticsAt = 0, slowFrames = 0, lowQuality = false;
    let disposed = false, visible = true, ready = false, flying = false;
    let width = 1, height = 1, hovered: Spot | null = null;
    let pointerStart: { x: number; y: number } | null = null;
    let dragged = false;
    const vector = new THREE.Vector3();

    function schedule() { if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(draw); }
    function draw(timestamp: number) {
      frame = 0;
      if (disposed || !visible || document.hidden) { previousTime = 0; return; }
      const delta = previousTime ? Math.min((timestamp - previousTime) / 1000, .05) : .016;
      if (previousTime && timestamp - previousTime > 85) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames >= 5 && !lowQuality) {
        lowQuality = true;
        renderer.setPixelRatio(.85);
        renderer.shadowMap.enabled = false;
        sun.castShadow = false;
        host!.dataset.quality = "adaptive";
      }
      previousTime = timestamp;
      const current = latest.current;
      // Advance this local, paused GSAP timeline by real elapsed time. Global ticker
      // lag smoothing must not turn a short camera move into a long wait on a slow GPU.
      if (flight) {
        const elapsed = Math.max(0, (timestamp - flight.started) / 1000);
        flight.timeline.time(Math.min(elapsed, flight.duration));
        if (elapsed >= flight.duration) { flight.timeline.kill(); flight = null; flying = false; }
      }
      if (current.motion) time += delta;
      controls.enableDamping = current.motion;
      controls.update(delta);
      restaurant.tick(time, delta, current.motion);
      const nightTarget = current.state.mood === "night" ? 1 : 0;
      lightState.night += (nightTarget - lightState.night) * (current.motion ? Math.min(1, delta * 6) : 1);
      scene.background = (scene.background as THREE.Color).copy(day).lerp(night, lightState.night);
      groundMaterial.color.copy(day).lerp(night, lightState.night);
      ambient.intensity = 2.6 - lightState.night * 1.6;
      sun.intensity = 2.8 - lightState.night * 2.35;
      fill.intensity = .8 - lightState.night * .25;
      lamps.forEach(lamp => { lamp.intensity = 2 + lightState.night * 12; });
      counterLight.intensity = 1 + lightState.night * 7;
      if (hovered) { const point = restaurant.anchors[hovered]; hoverRing.position.set(point.x, hovered === "table" ? .96 : point.y - .3, point.z); }
      hoverRing.visible = !!hovered;
      hoverRing.scale.setScalar(current.motion ? 1 + Math.sin(time * 3) * .05 : 1);
      renderer.render(scene, camera);
      for (const id of Object.keys(restaurant.anchors) as Spot[]) {
        const element = current.anchors.current[id];
        if (!element) continue;
        vector.copy(restaurant.anchors[id]).project(camera);
        const x = (vector.x * .5 + .5) * width;
        const y = (-vector.y * .5 + .5) * height;
        const onScreen = vector.z < 1 && vector.z > -1 && x > 25 && x < width - 25 && y > 100 && y < height - 130;
        const transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
        if (element.style.transform !== transform) element.style.transform = transform;
        const visibility = onScreen ? "visible" : "hidden";
        if (element.style.visibility !== visibility) element.style.visibility = visibility;
        if (element.dataset.hovered !== String(hovered === id)) element.dataset.hovered = String(hovered === id);
      }
      if (timestamp - diagnosticsAt > 250 || !current.motion || !ready) {
        diagnosticsAt = timestamp;
        host!.dataset.time = time.toFixed(2);
        const coordinates = camera.position.toArray().map(v => v.toFixed(2)).join(",");
        if (host!.dataset.camera !== coordinates) host!.dataset.camera = coordinates;
      }
      if (host!.dataset.motion !== String(current.motion)) host!.dataset.motion = String(current.motion);
      if (host!.dataset.flight !== String(flying)) host!.dataset.flight = String(flying);
      if (!ready) { ready = true; current.onReady(); }
      if (current.motion || flying) schedule();
    }

    function fly(position: THREE.Vector3, target: THREE.Vector3, duration = 1.25) {
      flight?.timeline.kill();
      flying = true;
      const seconds = latest.current.motion ? duration : 0;
      const timeline = gsap.timeline({ paused: true });
      timeline.to(camera.position, { x: position.x, y: position.y, z: position.z, duration: seconds, ease: "power2.inOut" }, 0);
      timeline.to(controls.target, { x: target.x, y: target.y, z: target.z, duration: seconds, ease: "power2.inOut" }, 0);
      flight = { timeline, started: performance.now(), duration: seconds };
      if (!seconds) { timeline.progress(1); timeline.kill(); flight = null; flying = false; }
      schedule();
    }
    function home(animate = true) {
      const narrow = width / height < .9;
      const position = narrow ? new THREE.Vector3(6.1, 5.1, 8.1) : new THREE.Vector3(5.35, 4.15, 6.15);
      const target = new THREE.Vector3(0, narrow ? .85 : .75, 0);
      if (animate) fly(position, target, 1.65);
      else { camera.position.copy(position); controls.target.copy(target); controls.update(); schedule(); }
    }
    function execute(command: CameraCommand) {
      if (command.action === "home") { home(); return; }
      if (command.action === "focus" && command.spot) {
        const target = restaurant.anchors[command.spot].clone();
        target.y -= width < 700 ? .55 : .1;
        const offset = command.spot === "table" ? new THREE.Vector3(2.8, 2.3, 3.6) : command.spot === "lia" ? new THREE.Vector3(2.4, 2.1, 3.9) : new THREE.Vector3(2.3, 1.8, 4.2);
        // Leave breathing room for the context overlay without losing the selected object.
        if (width < 700) offset.multiplyScalar(1.2);
        fly(target.clone().add(offset), target);
        return;
      }
      const offset = camera.position.clone().sub(controls.target);
      if (command.action === "in" || command.action === "out") offset.setLength(THREE.MathUtils.clamp(offset.length() * (command.action === "in" ? .83 : 1.2), controls.minDistance, controls.maxDistance));
      else offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), command.action === "left" ? -.22 : .22);
      fly(controls.target.clone().add(offset), controls.target.clone(), .5);
    }
    function resize() {
      width = host!.clientWidth; height = host!.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height; camera.fov = width < 700 ? 49 : 39; camera.updateProjectionMatrix();
      if (width < 700 && latest.current.selected) camera.setViewOffset(width, height, 0, height * .22, width, height);
      else camera.clearViewOffset();
      if (!ready) home(false);
      schedule();
    }

    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    function pick(event: PointerEvent) {
      const rect = host!.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / width * 2 - 1, -(event.clientY - rect.top) / height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(restaurant.root, true).find(item => {
        let node: THREE.Object3D | null = item.object;
        while (node) { if (!node.visible) return false; node = node.parent; } return true;
      });
      let node: THREE.Object3D | null = hit?.object ?? null;
      while (node && !node.userData.spot) node = node.parent;
      return (node?.userData.spot as Spot | undefined) ?? null;
    }
    function down(event: PointerEvent) { pointerStart = { x: event.clientX, y: event.clientY }; dragged = false; }
    function move(event: PointerEvent) {
      if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 7) dragged = true;
      if (!pointerStart) { hovered = pick(event); host!.style.cursor = hovered ? "pointer" : "grab"; schedule(); }
    }
    function up(event: PointerEvent) {
      if (pointerStart && !dragged) { const spot = pick(event); if (spot) latest.current.onSelect(spot); }
      pointerStart = null;
      host!.style.cursor = "grab";
    }
    function cancel() { pointerStart = null; hovered = null; schedule(); }
    function beginExplore() {
      flight?.timeline.kill(); flight = null; flying = false;
      latest.current.onExplore(); host!.style.cursor = "grabbing"; schedule();
    }
    function visibilityChange() { previousTime = 0; if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); }
    function loss(event: Event) { event.preventDefault(); latest.current.onFailure(); }
    function keyboard(event: KeyboardEvent) {
      const actions: Record<string, CameraCommand["action"]> = { ArrowLeft: "left", ArrowRight: "right", "+": "in", "=": "in", "-": "out", Home: "home" };
      if (actions[event.key]) { event.preventDefault(); execute({ action: actions[event.key], key: -1 }); }
    }

    runtime.current = { sync() {
      const current = latest.current;
      restaurant.update(current.state, current.selected);
      if (width < 700 && current.selected) camera.setViewOffset(width, height, 0, height * .22, width, height);
      else camera.clearViewOffset();
      if (current.command.key !== lastCommand) { lastCommand = current.command.key; execute(current.command); }
      if (!current.motion) {
        if (flight) { flight.timeline.progress(1); flight.timeline.kill(); flight = null; flying = false; }
      }
      schedule();
    } };
    restaurant.update(latest.current.state, latest.current.selected);
    const observer = new ResizeObserver(resize); observer.observe(host);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; previousTime = 0; if (visible) schedule(); }); intersection.observe(host);
    controls.addEventListener("start", beginExplore); controls.addEventListener("change", schedule);
    host.addEventListener("pointerdown", down); host.addEventListener("pointermove", move); host.addEventListener("pointerup", up); host.addEventListener("pointercancel", cancel); host.addEventListener("pointerleave", cancel); host.addEventListener("keydown", keyboard);
    renderer.domElement.addEventListener("webglcontextlost", loss);
    document.addEventListener("visibilitychange", visibilityChange);
    resize();
    if (latest.current.command.action === "focus") execute(latest.current.command);
    else if (latest.current.motion) { camera.position.multiplyScalar(1.23); home(); }
    else schedule();

    return () => {
      disposed = true; runtime.current = null; cancelAnimationFrame(frame);
      flight?.timeline.kill();
      controls.removeEventListener("start", beginExplore); controls.removeEventListener("change", schedule); controls.dispose();
      observer.disconnect(); intersection.disconnect();
      host.removeEventListener("pointerdown", down); host.removeEventListener("pointermove", move); host.removeEventListener("pointerup", up); host.removeEventListener("pointercancel", cancel); host.removeEventListener("pointerleave", cancel); host.removeEventListener("keydown", keyboard);
      document.removeEventListener("visibilitychange", visibilityChange); renderer.domElement.removeEventListener("webglcontextlost", loss);
      restaurant.dispose(); hoverGeometry.dispose(); hoverMaterial.dispose(); groundGeometry.dispose(); groundMaterial.dispose(); sun.shadow.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  return <div ref={container} className="restaurant-viewport" tabIndex={0} role="region" aria-label="Restaurante 3D. Arraste para girar; use as setas, mais e menos para explorar." data-testid="restaurant-renderer" style={{ width: "100%", height: "100%", cursor: "grab", touchAction: "none" }} />;
}
