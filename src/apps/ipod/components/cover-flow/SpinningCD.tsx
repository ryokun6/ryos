import { useEffect, useRef } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { useImageLoaded } from "../../hooks/useImageLoaded";
import { COVER_FADE_TRANSITION } from "./constants";

// Spinning CD component using Framer Motion exclusively
export function SpinningCD({ coverUrl, size, isPlaying, onClick }: { coverUrl: string | null; size: string; isPlaying: boolean; onClick?: () => void }) {
  // Initialize with a random rotation (0-60 degrees)
  const initialRotation = useRef(Math.random() * 60);
  const rotation = useMotionValue(initialRotation.current);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const albumArt = useImageLoaded(coverUrl);

  useEffect(() => {
    if (isPlaying) {
      // Start with ramp up, then continuous rotation
      const startRotation = rotation.get();
      // First do a ramp-up rotation
      animate(rotation, startRotation + 90, {
        duration: 0.8,
        ease: "easeIn",
        onComplete: () => {
          // Then continue with linear rotation
          const currentRotation = rotation.get();
          animationRef.current = animate(rotation, currentRotation + 360 * 1000, {
            duration: 3000,
            ease: "linear",
          });
        },
      });
    } else {
      // Stop current animation and ease out to a stop
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      // Animate a small additional rotation with easeOut for smooth stop
      const currentRotation = rotation.get();
      animate(rotation, currentRotation + 45, {
        duration: 1,
        ease: "easeOut",
      });
    }
    
    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [isPlaying, rotation]);

  return (
    <div 
      className="absolute inset-0 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Circular click zone */}
      <div
        className="absolute rounded-full"
        style={{ 
          width: "98%", 
          height: "98%", 
          cursor: onClick ? "pointer" : "default",
          zIndex: 30,
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClick?.();
        }}
      />
      {/* CD disc (spinning part) */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: "98%",
          height: "98%",
          background: `
            radial-gradient(circle at 50% 50%, 
              transparent 0%, 
              transparent 15%, 
              rgba(15, 15, 15, 1) 15.5%,
              rgba(20, 20, 20, 1) 16%,
              rgba(25, 25, 25, 1) 20%,
              rgba(35, 35, 35, 1) 25%,
              rgba(20, 20, 20, 1) 30%,
              rgba(15, 15, 15, 1) 100%
            )
          `,
          boxShadow: "inset 0 0 10px rgba(0,0,0,0.25)",
          rotate: rotation,
        }}
      >
        {/* Album art on CD (circular mask). Wrapper's gray bg
            reads as the loading placeholder; the <img> fades in
            on top once the bitmap is ready. */}
        {coverUrl && (
          <div
            className="absolute rounded-full overflow-hidden bg-neutral-400"
            style={{
              top: "30%",
              left: "30%",
              width: "40%",
              height: "40%",
            }}
          >
            <img
              ref={albumArt.ref}
              src={coverUrl}
              alt=""
              draggable={false}
              onLoad={albumArt.onLoad}
              onError={albumArt.onError}
              className="w-full h-full object-cover"
              style={{
                opacity: albumArt.loaded ? 1 : 0,
                transition: COVER_FADE_TRANSITION,
              }}
            />
          </div>
        )}
        
        {/* Center hole */}
        <div
          className="absolute rounded-full bg-black"
          style={{
            top: "50%",
            left: "50%",
            width: "5%",
            height: "5%",
            transform: "translate(-50%, -50%)",
            boxShadow: "inset 0 1px 2px rgba(255,255,255,0.1)",
          }}
        />
        
        {/* Track grooves effect */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `
              repeating-radial-gradient(
                circle at center,
                transparent 0px,
                transparent 2px,
                rgba(0, 0, 0, 0.03) 2px,
                rgba(0, 0, 0, 0.03) 4px
              )
            `,
          }}
        />
      </motion.div>
      
      {/* Shadow (fixed, doesn't spin) */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: "98%",
          height: "98%",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      />
      
      {/* Shine overlay (fixed, doesn't spin) */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: "98%",
          height: "98%",
          background: `
            conic-gradient(
              from 200deg at 50% 50%,
              transparent 0deg,
              rgba(255, 255, 255, 0.05) 40deg,
              transparent 80deg,
              transparent 180deg,
              rgba(255, 255, 255, 0.03) 220deg,
              transparent 260deg,
              transparent 360deg
            )
          `,
        }}
      />
    </div>
  );
}
