import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { ShaderType } from "@/types/shader";

// Re-export for backwards compatibility
export { ShaderType };

interface GalaxyBackgroundProps {
  shaderType?: ShaderType;
  /** When true, render regardless of the global shaderEffectEnabled setting */
  forceRender?: boolean;
}

const GalaxyBackground: React.FC<GalaxyBackgroundProps> = ({
  shaderType = ShaderType.GALAXY,
  forceRender = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef(new THREE.Clock()); // Use Clock for time uniform
  const shaderEffectEnabled = useDisplaySettingsStore((state) => state.shaderEffectEnabled);

  // Combined state for rendering condition - removed screen size check
  const shouldRender = forceRender || shaderEffectEnabled;

  // Check initial screen width and add resize listener - REMOVED
  // useEffect(() => {
  //   const checkScreenWidth = () => {
  //     // Use a common breakpoint like 768px (Tailwind 'md') or 640px ('sm')
  //     setIsLargeScreen(window.innerWidth >= 640); // Update screen size state
  //   };
  //
  //   checkScreenWidth(); // Initial check
  //   window.addEventListener('resize', checkScreenWidth);
  //
  //   return () => window.removeEventListener('resize', checkScreenWidth);
  // }, []);

  useEffect(() => {
    if (!shouldRender || !mountRef.current) return;

    const currentMount = mountRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); // Orthographic for fullscreen shader

    const renderer = new THREE.WebGLRenderer({
      antialias: false, // Disabled for performance
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    // Capped pixel ratio for better performance
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    currentMount.appendChild(renderer.domElement);

    // --- Common Vertex Shader ---
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    // --- Fragment Shader Selection ---
    let fragmentShader: string;
    const customUniforms: { [uniform: string]: { value: unknown } } = {
      resolution: {
        value: new THREE.Vector2(
          currentMount.clientWidth,
          currentMount.clientHeight
        ),
      },
      time: { value: 0.0 },
    };

    // Select shader based on type
    switch (shaderType) {
      case ShaderType.NEBULA:
        fragmentShader = `
          uniform vec2 resolution;
          uniform float time;
          varying vec2 vUv;

          void main() {
            vec4 O = vec4(0.0);
            vec2 a = (gl_FragCoord.xy / resolution.xy) * 2.0 - 1.0;
            a.x *= resolution.x / resolution.y;
            
            // --- Adjust center offset here ---
            vec2 centerOffset = vec2(-0.5, -0.5); // Increase values to shift more top-right
            a += centerOffset;
            // --- End adjustment ---
            
            float f = time;
            float m = 0.0;
            float x = 0.0;

            for (O *= m; m < 170.; O += .0007 / (abs(length(
              a + abs(sin(m * mix(.02, .07, sin(f) * .5 + .5) - f))
              * vec2(cos(x = m * .05 - f), sin(x))) - .5) + .02)
              * (1. + cos(m++ * .1 + length(a) * 6. - f + vec4(0, 1, 2, 0))));

            gl_FragColor = O * 0.8; // Adjust brightness if needed
          }
        `;
        break;

      case ShaderType.AURORA:
        fragmentShader = `
          uniform vec2 resolution;
          uniform float time;
          varying vec2 vUv;
          
          // Simple hash function for noise approximation
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }
          
          void mainImage(out vec4 O, vec2 F) {
            vec3 A = vec3(resolution.x, resolution.y, 0.0);
            vec3 p;
            float u = 0.0, R = 0.0, o = 0.0, r = 0.0, a = time;
          
            // --- Adjust center offset here ---
            // Offset in normalized screen coords (-1 to 1). 
            // Positive values shift center right/up.
            vec2 centerOffset = vec2(-0.5, -0.5); // Start with no offset
            // --- End adjustment ---

            for (O *= u; u++ < 44.;) {
              // Apply offset to the coordinate calculation before normalization
              vec2 centeredF = F + F - A.xy + centerOffset * A.xy; 
              p = R * normalize(vec3(centeredF, A.y));
              
              p.z -= 2.; 
              r = length(p); 
              p /= r*.1;
              
              p.xz *= mat2(cos(a*.2 + vec4(0,33,11,0)));
              
              // Mathematical approximation instead of texture
              float noise = hash(F/1024.0 + vec2(cos(time*0.1), sin(time*0.1))) * 0.1;
              R += o = min(r - .3, noise) + .1;
              
              O += .05 / (.4 + o) 
                   * mix(smoothstep(.5,.7,sin(p.x+cos(p.y)*cos(p.z))*sin(p.z+sin(p.y)*cos(p.x+a))), 
                        1., .15/r/r) 
                   * smoothstep(5., 0., r)
                   * (1. + cos(R*3. + vec4(0,1,2,0)));
            }
          }
          
          void main() {
            vec4 fragColor = vec4(0.0);
            mainImage(fragColor, gl_FragCoord.xy);
            gl_FragColor = fragColor * 0.4; // Dim slightly for performance
          }
        `;
        break;

      case ShaderType.GALAXY:
      default:
        fragmentShader = `
          uniform vec2 resolution;
          uniform float time;
          varying vec2 vUv;

          mat3 rotate3D(float angle, vec3 axis) {
              axis = normalize(axis);
              float s = sin(angle);
              float c = cos(angle);
              float oc = 1.0 - c;

              return mat3(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
                          oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
                          oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c);
          }

          void main() {
              vec2 r = resolution.xy;
              vec2 FC = gl_FragCoord.xy;
              float t = time;
              vec3 o = vec3(0.0);

              for(float i=0.0,g=0.0,e=0.0,s=0.0; ++i<99.;o+=vec3(s/8e2)){
                vec3 p=vec3((FC.xy-.5*r)/r.y*1.3+vec2(2.8,-.4),g-6.)*rotate3D(sin(t*.5)*.1-3.,vec3(2,40,-7));
                s=3.;
                for(int j=0; j++<16; p=vec3(0,4,-1)-abs(abs(p)*e-vec3(3,4,3))){
                  s*=e=7.5/abs(dot(p,p*(.55+cos(t)*.005)+.3));
                }
                g+=p.y/s-.0015;
                s=log2(s)-g*.5;
              }

              float dimFactor = 0.4;
              gl_FragColor = vec4(o * dimFactor, 1.0);
          }
        `;
    }

    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: customUniforms,
      vertexShader,
      fragmentShader,
    });

    // Fullscreen Quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geometry, shaderMaterial);
    scene.add(quad);
    // --- End Shader Setup ---

    // Handle resize
    const handleResize = () => {
      if (!currentMount) return;
      const width = currentMount.clientWidth;
      const height = currentMount.clientHeight;
      renderer.setSize(width, height);
      shaderMaterial.uniforms.resolution.value.set(width, height);
      // No camera update needed for orthographic fullscreen quad
    };
    window.addEventListener("resize", handleResize);

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Update time uniform
      shaderMaterial.uniforms.time.value = clockRef.current.getElapsedTime();

      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      if (currentMount && renderer.domElement) {
        currentMount.removeChild(renderer.domElement);
      }
      // Dispose Three.js objects
      scene.remove(quad);
      geometry.dispose();
      shaderMaterial.dispose();
      renderer.dispose();
    };
  }, [shouldRender, shaderType]); // Re-run effect if rendering condition or shader type changes

  // Conditionally render the container div
  return shouldRender ? (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: -1,
      }}
    />
  ) : null; // Render nothing if condition not met
};

export default GalaxyBackground;
