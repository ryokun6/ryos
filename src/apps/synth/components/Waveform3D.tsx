import { useRef, useState, useEffect, useMemo } from "react";
import * as THREE from "three";
import * as Tone from "tone";
import { useLatestRef } from "@/hooks/useLatestRef";

interface Waveform3DProps {
  analyzer: Tone.Analyser | null;
}

const vertexShader = `
  varying vec2 vUv;
  varying float vElevation;
  
  void main() {
    vUv = uv;
    vElevation = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  uniform float uTime;
  uniform float uAmplitude;
  
  varying vec2 vUv;
  varying float vElevation;
  
  void main() {
    // Calculate base color by mixing low and high colors based on elevation
    vec3 color = mix(uColorLow, uColorHigh, abs(vElevation) * 2.0);
    
    // Add wave effect
    float wave = sin(vUv.x * 20.0 + uTime * 2.0) * 0.05 * uAmplitude;
    color += wave;
    
    // Add pulse effect based on amplitude
    float pulse = sin(uTime * 3.0) * 0.15 * uAmplitude;
    color += pulse;
    
    // Add glow effect
    float glow = pow(abs(vElevation) * 3.0, 2.0) * uAmplitude;
    color += vec3(glow * 0.5, glow * 0.3, glow * 0.7);
    
    // Add center brightness - brighten the middle part
    float centerX = abs(vUv.x - 0.5) * 2.0; // 0 at center, 1 at edges
    float centerEffect = (1.0 - centerX) * 0.4; // Stronger in the middle
    color += vec3(centerEffect);
    
    // Ensure minimum brightness
    color = max(color, vec3(0.2, 0.1, 0.3));
    
    gl_FragColor = vec4(color, 0.8);
  }
`;

export const Waveform3D: React.FC<Waveform3DProps> = ({ analyzer }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  // Use useLatestRef to keep analyzer ref in sync without useEffect
  const analyzerRef = useLatestRef(analyzer);
  const [isMobile, setIsMobile] = useState(false);
  const timeRef = useRef(0);
  const amplitudeRef = useRef(0);

  const geometry = useMemo(
    () => new THREE.PlaneGeometry(6, 2, 96, 32),
    []
  );
  const lowColor = useMemo(() => new THREE.Color(0x2a0050), []);
  const highColor = useMemo(() => new THREE.Color(0xff00ff), []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColorLow: { value: lowColor },
          uColorHigh: { value: highColor },
          uTime: { value: 0 },
          uAmplitude: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        wireframe: true,
      }),
    [highColor, lowColor]
  );

  const mesh = useMemo(() => {
    const waveformMesh = new THREE.Mesh(geometry, material);
    waveformMesh.rotation.x = -Math.PI / 6;
    return waveformMesh;
  }, [geometry, material]);

  const scene = useMemo(() => {
    const waveformScene = new THREE.Scene();
    waveformScene.add(mesh);
    waveformScene.add(new THREE.AmbientLight(0x404040));
    return waveformScene;
  }, [mesh]);

  const camera = useMemo(() => {
    const waveformCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
    waveformCamera.position.set(0, 1.5, 2);
    waveformCamera.lookAt(0, 0, 0);
    return waveformCamera;
  }, []);

  const renderer = useMemo(() => {
    try {
      return new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch (error) {
      console.warn("[Waveform3D] WebGL unavailable, skipping renderer", error);
      return null;
    }
  }, []);

  // Effect to handle window resize and mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Note: analyzerRef is kept in sync via useLatestRef (no effect needed)

  useEffect(() => {
    if (!containerRef.current || isMobile || !renderer) return;

    const container = containerRef.current;
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Animation loop
    const animate = () => {
      // Update time for shader animation
      timeRef.current += 0.01;
      material.uniforms.uTime.value = timeRef.current;

      // Get waveform data from analyzer
      if (analyzerRef.current) {
        const waveform = analyzerRef.current.getValue() as Float32Array;
        const vertices = mesh.geometry.attributes.position
          .array as Float32Array;

        // Calculate overall amplitude for color changes
        let maxAmplitude = 0;

        // Map waveform data to vertices
        for (let i = 0; i < vertices.length; i += 3) {
          const x = vertices[i];
          // Map x position to waveform index
          const waveformIndex = Math.floor(((x + 3) / 6) * waveform.length); // Adjusted for wider geometry
          if (waveformIndex >= 0 && waveformIndex < waveform.length) {
            // Use waveform value for height, scaled appropriately and clipped
            const value = waveform[waveformIndex];
            // Only show significant changes (clip out near-zero values)
            vertices[i + 1] = Math.abs(value) > 0.1 ? value * 1 : 0;

            // Track maximum amplitude for color effects
            maxAmplitude = Math.max(maxAmplitude, Math.abs(value));
          }
        }

        // Update amplitude uniform with smoothing
        amplitudeRef.current = amplitudeRef.current * 0.9 + maxAmplitude * 0.1;
        material.uniforms.uAmplitude.value = amplitudeRef.current;

        // Update color based on amplitude
        const hue = (timeRef.current * 0.1) % 1; // Cycle through hues over time
        const saturation = 0.7 + amplitudeRef.current * 0.3; // More saturated with higher amplitude
        const lightness = 0.5 + amplitudeRef.current * 0.2; // Brighter with higher amplitude

        // Convert HSL to RGB for high color
        highColor.setHSL(hue, saturation, lightness);

        // Low color follows with a offset in hue
        lowColor.setHSL(
          (hue + 0.5) % 1,
          saturation * 0.7,
          lightness * 0.4
        );

        mesh.geometry.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    // Handle resize with ResizeObserver
    const handleResize = () => {
      if (!containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
    };

    // Create ResizeObserver to detect container size changes
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    handleResize();

    return () => {
      resizeObserver.disconnect();
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (renderer && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [camera, highColor, isMobile, lowColor, material, mesh, renderer, scene, analyzerRef]);

  useEffect(() => {
    return () => {
      renderer?.dispose();
      material.dispose();
      geometry.dispose();
    };
  }, [geometry, material, renderer]);

  return (
    <div
      ref={containerRef}
      className="w-full h-12 md:h-28 overflow-hidden bg-black/50 hidden md:block flex-grow"
    />
  );
};
