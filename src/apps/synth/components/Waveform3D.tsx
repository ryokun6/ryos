import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import * as Tone from "tone";

interface Waveform3DProps {
  analyzer: Tone.Analyser | null;
}

export const Waveform3D: React.FC<Waveform3DProps> = ({ analyzer }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const timeRef = useRef(0);
  const amplitudeRef = useRef(0);

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

  useEffect(() => {
    if (!containerRef.current || isMobile) return;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create camera with better angle
    const camera = new THREE.PerspectiveCamera(
      30, // Keep narrow field of view
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.5, 2); // Move back slightly and up a bit
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Create renderer with better quality
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create geometry for waveform with more segments
    const geometry = new THREE.PlaneGeometry(6, 2, 96, 32); // Wider geometry with more segments

    // Custom shader material
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

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColorLow: { value: new THREE.Color(0x2a0050) }, // Lighter deep purple
        uColorHigh: { value: new THREE.Color(0xff00ff) }, // Bright magenta
        uTime: { value: 0 },
        uAmplitude: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      wireframe: true,
    });

    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 6; // Less steep angle
    scene.add(mesh);
    meshRef.current = mesh;

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    // Animation loop
    const animate = () => {
      if (
        !meshRef.current ||
        !rendererRef.current ||
        !sceneRef.current ||
        !cameraRef.current ||
        !materialRef.current
      )
        return;

      // Update time for shader animation
      timeRef.current += 0.01;
      materialRef.current.uniforms.uTime.value = timeRef.current;

      // Get waveform data from analyzer
      if (analyzer) {
        const waveform = analyzer.getValue() as Float32Array;
        const vertices = meshRef.current.geometry.attributes.position
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
        materialRef.current.uniforms.uAmplitude.value = amplitudeRef.current;

        // Update color based on amplitude
        const hue = (timeRef.current * 0.1) % 1; // Cycle through hues over time
        const saturation = 0.7 + amplitudeRef.current * 0.3; // More saturated with higher amplitude
        const lightness = 0.5 + amplitudeRef.current * 0.2; // Brighter with higher amplitude

        // Convert HSL to RGB for high color
        const highColor = new THREE.Color().setHSL(hue, saturation, lightness);
        materialRef.current.uniforms.uColorHigh.value = highColor;

        // Low color follows with a offset in hue
        const lowColor = new THREE.Color().setHSL(
          (hue + 0.5) % 1,
          saturation * 0.7,
          lightness * 0.4
        );
        materialRef.current.uniforms.uColorLow.value = lowColor;

        meshRef.current.geometry.attributes.position.needsUpdate = true;
      }

      rendererRef.current.render(sceneRef.current, cameraRef.current);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    // Handle resize with ResizeObserver
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current)
        return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
      rendererRef.current.setPixelRatio(window.devicePixelRatio);
    };

    // Create ResizeObserver to detect container size changes
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      if (materialRef.current) {
        materialRef.current.dispose();
      }
      if (meshRef.current && meshRef.current.geometry) {
        meshRef.current.geometry.dispose();
      }
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [analyzer, isMobile]);

  return (
    <div
      ref={containerRef}
      className="w-full h-12 md:h-28 overflow-hidden bg-black/50 hidden md:block flex-grow"
    />
  );
};
